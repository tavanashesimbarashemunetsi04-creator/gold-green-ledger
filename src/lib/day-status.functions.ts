import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DayStatus = {
  isDayOpen: boolean;
  isEcocashMode: boolean;
  isAdmin: boolean;
};

export const getDayStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DayStatus> => {
    const uid = context.userId;
    const sb = context.supabase;

    const [sess, eco, roles] = await Promise.all([
      sb.from("teller_sessions").select("id", { head: true, count: "exact" })
        .eq("user_id", uid).eq("status", "open"),
      sb.from("ecocash_sessions").select("id", { head: true, count: "exact" })
        .eq("user_id", uid).eq("status", "open"),
      sb.from("user_roles").select("role").eq("user_id", uid),
    ]);

    const isAdmin = ((roles.data ?? []) as { role: string }[]).some((r) => r.role === "admin");
    return {
      isDayOpen: (sess.count ?? 0) > 0,
      isEcocashMode: (eco.count ?? 0) > 0,
      isAdmin,
    };
  });
