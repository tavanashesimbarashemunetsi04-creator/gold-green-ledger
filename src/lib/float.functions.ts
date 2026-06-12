import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertFinanceOrAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "finance_manager"]);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Forbidden: finance manager or admin only");
}

export const assignFloat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        teller_user_id: z.string().uuid(),
        amount: z.number().positive().max(1_000_000_000),
        branch_id: z.string().uuid().nullable().optional(),
        reference: z.string().trim().max(120).optional(),
        notes: z.string().trim().max(500).optional(),
        assigned_role: z.enum(["Ecocash_Teller", "Agency_Banking_Teller", "Dual_Role_Teller"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertFinanceOrAdmin(context.userId);
    if (data.teller_user_id === context.userId)
      throw new Error("Use the self-float action to assign float to yourself");

    const { data: row, error } = await supabaseAdmin
      .from("float_assignments")
      .insert({
        assigned_by_user_id: context.userId,
        assigned_to_user_id: data.teller_user_id,
        amount: data.amount,
        branch_id: data.branch_id ?? null,
        reference: data.reference ?? null,
        notes: data.notes ?? null,
        // Column added by daily teller roles migration; cast to satisfy generated types until refresh
        ...({ assigned_role: data.assigned_role } as Record<string, unknown>),
      } as never)
      .select()
      .single();
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("audit_logs").insert({
      actor_user_id: context.userId,
      action: "float_assign",
      table_name: "float_assignments",
      record_id: row.id,
      new_data: { amount: data.amount, reference: data.reference } as never,
      module: "float",
      amount: data.amount,
      target_user_id: data.teller_user_id,
      branch_id: data.branch_id ?? null,
    });

    return { id: row.id };
  });

export const approveFloat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ assignment_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Use the user-authenticated client so auth.uid() resolves inside the RPC
    const { error } = await context.supabase.rpc("approve_float_assignment", {
      _assignment_id: data.assignment_id,
    });
    if (error) {
      await supabaseAdmin.from("audit_logs").insert({
        actor_user_id: context.userId,
        action: "float_approve_failed",
        table_name: "float_assignments",
        record_id: data.assignment_id,
        new_data: { error: error.message } as never,
        module: "float",
      });
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const rejectFloat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        assignment_id: z.string().uuid(),
        reason: z.string().trim().min(1).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("reject_float_assignment", {
      _assignment_id: data.assignment_id,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const selfAssignFloat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        amount: z.number().positive().max(1_000_000_000),
        branch_id: z.string().uuid().nullable().optional(),
        reference: z.string().trim().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertFinanceOrAdmin(context.userId);
    const { error } = await context.supabase.rpc("self_assign_float", {
      _amount: data.amount,
      _branch_id: (data.branch_id ?? null) as string,
      _reference: (data.reference ?? null) as string,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const grantRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        role: z.enum(["admin", "manager", "finance_manager", "teller"]),
        grant: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // admin only
    const { data: r, error: rErr } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!r) throw new Error("Forbidden: admin only");

    if (data.grant) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: data.user_id, role: data.role });
      if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.user_id)
        .eq("role", data.role);
      if (error) throw new Error(error.message);
    }

    await supabaseAdmin.from("audit_logs").insert({
      actor_user_id: context.userId,
      action: data.grant ? "role_granted" : "role_revoked",
      table_name: "user_roles",
      record_id: data.user_id,
      new_data: { role: data.role } as never,
      module: "users",
      target_user_id: data.user_id,
    });
    return { ok: true };
  });
