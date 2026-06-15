import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

async function logAudit(
  actor: string,
  action: string,
  table: string,
  recordId: string | null,
  data: Record<string, unknown>,
) {
  await supabaseAdmin.from("audit_logs").insert({
    actor_user_id: actor,
    action,
    table_name: table,
    record_id: recordId,
    new_data: data as never,
    module: "admin_settings",
  });
}

// ===== App settings (single JSON blob) =====
export const saveAppSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ value: z.record(z.string(), z.any()) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert(
        { key: "global", value: data.value, updated_at: new Date().toISOString(), updated_by: context.userId },
        { onConflict: "key" },
      );
    if (error) throw new Error(error.message);
    await logAudit(context.userId, "settings_saved", "app_settings", "global", data.value);
    return { ok: true };
  });

// ===== Branches =====
export const upsertBranch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(1).max(120),
        code: z.string().trim().min(1).max(40),
        location: z.string().trim().max(200).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("branches")
        .update({ name: data.name, code: data.code, location: data.location ?? null })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      await logAudit(context.userId, "branch_updated", "branches", data.id, data);
      return { id: data.id };
    }
    const { data: row, error } = await supabaseAdmin
      .from("branches")
      .insert({ name: data.name, code: data.code, location: data.location ?? null })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await logAudit(context.userId, "branch_created", "branches", row.id, data);
    return { id: row.id };
  });

export const setBranchActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("branches")
      .update({ is_active: data.is_active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAudit(context.userId, data.is_active ? "branch_activated" : "branch_deactivated", "branches", data.id, {
      is_active: data.is_active,
    });
    return { ok: true };
  });

// ===== User deletion =====
export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ user_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.user_id === context.userId) throw new Error("Cannot remove yourself");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    await logAudit(context.userId, "user_deleted", "profiles", data.user_id, { user_id: data.user_id });
    return { ok: true };
  });

// ===== Set primary role (replace existing non-teller roles) =====
export const setPrimaryRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        role: z.enum(["admin", "finance_manager", "teller"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    // remove all roles, then insert chosen
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.user_id, role: data.role });
    if (error) throw new Error(error.message);
    await logAudit(context.userId, "role_set", "user_roles", data.user_id, { role: data.role });
    return { ok: true };
  });
