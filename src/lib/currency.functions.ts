import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function assertAdmin(userId: string) {
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

export const getCurrencyRates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const admin = await getAdmin();
    const { data, error } = await admin
      .from("currency_rates")
      .select("*")
      .eq("key", "global")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const saveCurrencyRates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        payments_rate: z.number().min(0),
        withdrawals_rate: z.number().min(0),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const admin = await getAdmin();

    const { data: current } = await admin
      .from("currency_rates")
      .select("*")
      .eq("key", "global")
      .maybeSingle();

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { key: "global", updated_at: now };
    const history: Array<{ kind: string; old_rate: number | null; new_rate: number; changed_by: string }> = [];

    if (!current || Number(current.payments_rate) !== data.payments_rate) {
      patch.payments_rate = data.payments_rate;
      patch.payments_updated_at = now;
      patch.payments_updated_by = context.userId;
      history.push({
        kind: "payments",
        old_rate: current ? Number(current.payments_rate) : null,
        new_rate: data.payments_rate,
        changed_by: context.userId,
      });
    }
    if (!current || Number(current.withdrawals_rate) !== data.withdrawals_rate) {
      patch.withdrawals_rate = data.withdrawals_rate;
      patch.withdrawals_updated_at = now;
      patch.withdrawals_updated_by = context.userId;
      history.push({
        kind: "withdrawals",
        old_rate: current ? Number(current.withdrawals_rate) : null,
        new_rate: data.withdrawals_rate,
        changed_by: context.userId,
      });
    }

    const { error } = await admin
      .from("currency_rates")
      .upsert(patch as never, { onConflict: "key" });
    if (error) throw new Error(error.message);

    if (history.length) {
      await admin.from("currency_rate_history").insert(history);

      // Broadcast a full-screen announcement to all users so they're aware of
      // the new rates even without admin communication.
      const parts = history.map((h) => {
        const label = h.kind === "payments" ? "Payments code" : "Withdrawals code";
        const from = h.old_rate == null ? "—" : h.old_rate;
        return `${label}: ${from} → ${h.new_rate}`;
      });
      const message =
        `Currency code updated by admin.\n\n${parts.join("\n")}\n\n` +
        `Please use the new code(s) for all new transactions.`;
      const updated_at = now;

      const { data: existing } = await admin
        .from("app_settings")
        .select("value")
        .eq("key", "global")
        .maybeSingle();
      const value = ((existing?.value as Record<string, unknown>) ?? {}) as Record<string, unknown>;
      const ann = { message, updated_at };
      value.announcement = ann;
      await admin
        .from("app_settings")
        .upsert({ key: "global", value: value as never, updated_at } as never, { onConflict: "key" });

      // Real-time broadcast: push the announcement to every connected user
      // over Supabase Realtime Broadcast (WebSocket). Clients don't need DB
      // polling — they receive the message the instant we send it.
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const rt = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );
        const ch = rt.channel("global-announcements");
        await new Promise<void>((resolve) => {
          ch.subscribe(async (status) => {
            if (status === "SUBSCRIBED") {
              await ch.send({ type: "broadcast", event: "announcement", payload: ann });
              await rt.removeChannel(ch);
              resolve();
            }
          });
          // Don't block the response indefinitely.
          setTimeout(() => resolve(), 3000);
        });
      } catch {
        /* broadcast best-effort; DB row still triggers fallback on next fetch */
      }
    }
    await admin.from("audit_logs").insert({
      actor_user_id: context.userId,
      action: "currency_rates_saved",
      table_name: "currency_rates",
      record_id: "global",
      new_data: { payments_rate: data.payments_rate, withdrawals_rate: data.withdrawals_rate } as never,
      module: "admin_settings",
    });
    return { ok: true };
  });

export const getRateHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const admin = await getAdmin();
    const { data, error } = await admin
      .from("currency_rate_history")
      .select("*")
      .order("changed_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// Verify the current user's password without disturbing their session.
export const verifyMyPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ password: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const { data: user, error: uerr } = await admin.auth.admin.getUserById(context.userId);
    if (uerr || !user?.user?.email) throw new Error("Unable to verify user");
    const { createClient } = await import("@supabase/supabase-js");
    const verifier = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { error } = await verifier.auth.signInWithPassword({
      email: user.user.email,
      password: data.password,
    });
    if (error) return { ok: false as const };
    return { ok: true as const };
  });

export const logCodeOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        transaction_type: z.enum(["payment", "withdrawal"]),
        original_rate: z.number(),
        edited_rate: z.number(),
        reference: z.string().max(200).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const { data: prof } = await admin
      .from("profiles")
      .select("branch_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    const { error } = await admin.from("code_overrides").insert({
      user_id: context.userId,
      branch_id: prof?.branch_id ?? null,
      transaction_type: data.transaction_type,
      original_rate: data.original_rate,
      edited_rate: data.edited_rate,
      reference: data.reference ?? null,
    });
    if (error) throw new Error(error.message);
    await admin.from("audit_logs").insert({
      actor_user_id: context.userId,
      action: "code_overridden",
      table_name: "code_overrides",
      branch_id: prof?.branch_id ?? null,
      new_data: data as never,
      module: data.transaction_type === "payment" ? "payments" : "withdrawals",
    });
    return { ok: true };
  });
