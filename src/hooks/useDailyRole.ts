import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMyDailyRole, type DailyRole } from "@/lib/daily-role.functions";
import { useAuth } from "@/hooks/useAuth";

export function useDailyRole(pollMs = 30000) {
  const { user } = useAuth();
  const fetcher = useServerFn(getMyDailyRole);
  const [role, setRole] = useState<DailyRole | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) {
      setRole(null);
      setLoaded(true);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const r = await fetcher();
        if (!cancelled) setRole(r?.assigned_role ?? null);
      } catch {
        if (!cancelled) setRole(null);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };
    void run();
    const t = setInterval(run, pollMs);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [fetcher, user, pollMs]);

  return { role, loaded };
}

export const ROLE_ALLOWED_ROUTES: Record<DailyRole, string[]> = {
  Ecocash_Teller: [
    "/", "/teller-float", "/ecocash", "/internal-transactions",
    "/end-day", "/account", "/settings", "/pending", "/failed", "/changes-refunds",
  ],
  Agency_Banking_Teller: [
    "/", "/teller-float", "/payments", "/withdrawals",
    "/end-day", "/account", "/settings", "/pending", "/failed", "/changes-refunds",
  ],
  Dual_Role_Teller: [
    "/", "/teller-float", "/payments", "/withdrawals", "/ecocash", "/internal-transactions",
    "/end-day", "/account", "/settings", "/pending", "/failed", "/changes-refunds",
  ],
};
