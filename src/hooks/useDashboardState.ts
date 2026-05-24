import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getDashboardState, type DashboardState } from "@/lib/teller-day.functions";
import { useAuth } from "@/hooks/useAuth";

export function useDashboardState(pollMs = 15000) {
  const { user } = useAuth();
  const fetcher = useServerFn(getDashboardState);
  const [state, setState] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const next = await fetcher();
      if (mounted.current) {
        setState(next);
        setError(null);
      }
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [fetcher, user]);

  useEffect(() => {
    mounted.current = true;
    refresh();
    const t = setInterval(refresh, pollMs);
    return () => {
      mounted.current = false;
      clearInterval(t);
    };
  }, [refresh, pollMs]);

  const isDayOpen = !!state?.session;
  const canTransact = isDayOpen;
  return { state, loading, error, refresh, isDayOpen, canTransact };
}
