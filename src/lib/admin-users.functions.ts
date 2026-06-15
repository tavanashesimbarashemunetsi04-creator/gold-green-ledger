import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Must contain an uppercase letter")
  .regex(/[a-z]/, "Must contain a lowercase letter")
  .regex(/[0-9]/, "Must contain a number")
  .regex(/[^A-Za-z0-9]/, "Must contain a special character");

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
  recordId: string,
  data: Record<string, unknown>,
) {
  await supabaseAdmin.from("audit_logs").insert({
    actor_user_id: actor,
    action,
    table_name: table,
    record_id: recordId,
    new_data: data as never,
  });
}

export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        full_name: z.string().trim().min(1).max(120),
        username: z.string().trim().min(2).max(40).regex(/^[a-zA-Z0-9_.-]+$/),
        email: z.string().trim().email().max(255),
        role: z.enum(["admin", "teller", "finance_manager"]),
        password: PasswordSchema,
        is_temporary_password: z.boolean().default(false),
        require_password_change: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { display_name: data.full_name },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Failed to create user");
    const uid = created.user.id;

    const { error: pErr } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          user_id: uid,
          email: data.email,
          full_name: data.full_name,
          display_name: data.full_name,
          username: data.username,
          status: "active",
          is_temporary_password: data.is_temporary_password,
          require_password_change: data.require_password_change || data.is_temporary_password,
        },
        { onConflict: "user_id" },
      );
    if (pErr) throw new Error(pErr.message);

    // Default trigger inserts 'teller'; add additional role if requested
    if (data.role === "admin" || data.role === "finance_manager") {
      await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: uid, role: data.role })
        .then(() => {});
    }

    await logAudit(context.userId, "user_created", "profiles", uid, {
      email: data.email,
      role: data.role,
      username: data.username,
    });
    return { user_id: uid };
  });

export const adminResetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        new_password: PasswordSchema,
        require_change: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: data.new_password,
    });
    if (error) throw new Error(error.message);

    await supabaseAdmin
      .from("profiles")
      .update({
        is_temporary_password: data.require_change,
        require_password_change: data.require_change,
      })
      .eq("user_id", data.user_id);

    await logAudit(context.userId, "password_reset", "profiles", data.user_id, {
      require_change: data.require_change,
    });
    return { ok: true };
  });

export const adminSetUserStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        status: z.enum(["active", "suspended", "locked"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ status: data.status })
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);

    // Block auth sign-in when suspended/locked by banning, restore when active
    const banDuration = data.status === "active" ? "none" : "876000h";
    await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      ban_duration: banDuration,
    } as { ban_duration: string });

    await logAudit(context.userId, `status_${data.status}`, "profiles", data.user_id, {
      status: data.status,
    });
    return { ok: true };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ user_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.user_id === context.userId) {
      throw new Error("You cannot delete your own account");
    }

    // Best-effort cleanup of related rows; rely on FK cascades where present
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("profiles").delete().eq("user_id", data.user_id);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);

    await logAudit(context.userId, "user_deleted", "profiles", data.user_id, {});
    return { ok: true };
  });
