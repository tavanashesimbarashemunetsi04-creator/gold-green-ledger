import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctxSupabase: any, userId: string) {
  const { data, error } = await ctxSupabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

export const listSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [settingsRes, flagsRes, profilesRes] = await Promise.all([
      supabaseAdmin.from("app_settings").select("*").order("category").order("sort_order"),
      supabaseAdmin.from("feature_flags").select("*").order("key"),
      supabaseAdmin.from("profiles").select("user_id, display_name, email"),
    ]);
    if (settingsRes.error) throw new Error(settingsRes.error.message);
    const profileMap = new Map(
      (profilesRes.data ?? []).map((p: any) => [p.user_id, p.display_name || p.email]),
    );
    const settings = (settingsRes.data ?? []).map((s: any) => ({
      ...s,
      last_modified_by_name: s.last_modified_by ? profileMap.get(s.last_modified_by) ?? null : null,
    }));
    return { settings, flags: flagsRes.data ?? [] };
  });

export const updateSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        key: z.string().min(1).max(120),
        value: z.unknown(),
        reason: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_settings")
      .update({
        value: data.value as never,
        last_modified_by: context.userId,
        last_modified_at: new Date().toISOString(),
      })
      .eq("key", data.key);
    if (error) throw new Error(error.message);
    if (data.reason) {
      await supabaseAdmin
        .from("app_setting_history")
        .insert({
          setting_key: data.key,
          new_value: data.value as never,
          change_reason: data.reason,
          changed_by: context.userId,
        });
    }
    return { ok: true };
  });

export const bulkUpdateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        updates: z
          .array(z.object({ key: z.string().min(1).max(120), value: z.unknown() }))
          .min(1)
          .max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const stamp = new Date().toISOString();
    for (const u of data.updates) {
      const { error } = await supabaseAdmin
        .from("app_settings")
        .update({
          value: u.value as never,
          last_modified_by: context.userId,
          last_modified_at: stamp,
        })
        .eq("key", u.key);
      if (error) throw new Error(`${u.key}: ${error.message}`);
    }
    return { ok: true, count: data.updates.length };
  });

export const getSettingHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ key: z.string().min(1).max(120), limit: z.number().int().min(1).max(100).default(20) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("app_setting_history")
      .select("*")
      .eq("setting_key", data.key)
      .order("changed_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    const userIds = Array.from(new Set((rows ?? []).map((r: any) => r.changed_by).filter(Boolean)));
    let nameMap = new Map<string, string>();
    if (userIds.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("user_id, display_name, email")
        .in("user_id", userIds);
      nameMap = new Map((profs ?? []).map((p: any) => [p.user_id, p.display_name || p.email]));
    }
    return {
      history: (rows ?? []).map((r: any) => ({
        ...r,
        changed_by_name: r.changed_by ? nameMap.get(r.changed_by) ?? null : null,
      })),
    };
  });

export const forceLogoutAllUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // List users (paged) and sign each out
    let page = 1;
    let total = 0;
    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw new Error(error.message);
      for (const u of data.users) {
        await supabaseAdmin.auth.admin.signOut(u.id).catch(() => {});
        total++;
      }
      if (data.users.length < 1000) break;
      page++;
    }
    await supabaseAdmin.from("audit_logs").insert({
      actor_user_id: context.userId,
      action: "force_logout_all",
      table_name: "auth.users",
      record_id: context.userId,
      new_data: { count: total } as never,
    });
    return { ok: true, count: total };
  });

export const exportConfiguration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [s, f] = await Promise.all([
      supabaseAdmin.from("app_settings").select("key, value"),
      supabaseAdmin.from("feature_flags").select("key, enabled"),
    ]);
    return {
      exported_at: new Date().toISOString(),
      settings: s.data ?? [],
      feature_flags: f.data ?? [],
    };
  });

export const importConfiguration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        settings: z.array(z.object({ key: z.string(), value: z.unknown() })).default([]),
        feature_flags: z.array(z.object({ key: z.string(), enabled: z.boolean() })).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const stamp = new Date().toISOString();
    for (const s of data.settings) {
      await supabaseAdmin
        .from("app_settings")
        .update({ value: s.value as never, last_modified_by: context.userId, last_modified_at: stamp })
        .eq("key", s.key);
    }
    for (const f of data.feature_flags) {
      await supabaseAdmin
        .from("feature_flags")
        .update({ enabled: f.enabled, last_modified_by: context.userId, last_modified_at: stamp })
        .eq("key", f.key);
    }
    return { ok: true };
  });

export const restoreDefaults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    await context.supabase.from("audit_logs").insert({
      actor_user_id: context.userId,
      action: "restore_defaults_requested",
      table_name: "app_settings",
      record_id: context.userId,
      new_data: { note: "Restore defaults requires manual review" } as never,
    } as never);
    return { ok: true, note: "Defaults restore requested. An operator must reseed via migration." };
  });
