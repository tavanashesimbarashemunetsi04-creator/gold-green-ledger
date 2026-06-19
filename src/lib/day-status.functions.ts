import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DayStatus = {
  isDayOpen: boolean;
  isEcocashMode: boolean;
  isAdmin: boolean;
  dayOpenedAt: string | null;
};

export const getDayStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DayStatus> => {
    const uid = context.userId;
    const sb = context.supabase;

    const [sess, eco, roles] = await Promise.all([
      sb.from("teller_sessions").select("id, opened_at")
        .eq("user_id", uid).eq("status", "open")
        .order("opened_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("ecocash_sessions").select("id, opened_at")
        .eq("user_id", uid).eq("status", "open")
        .order("opened_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("user_roles").select("role").eq("user_id", uid),
    ]);

    const isAdmin = ((roles.data ?? []) as { role: string }[]).some((r) => r.role === "admin");
    const isDayOpen = !!sess.data;
    const isEcocashMode = !!eco.data;
    const dayOpenedAt = (sess.data?.opened_at ?? eco.data?.opened_at ?? null) as string | null;
    return { isDayOpen, isEcocashMode, isAdmin, dayOpenedAt };
  });
