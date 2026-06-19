import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getDayStatus, type DayStatus } from "@/lib/day-status.functions";
import { useAuth } from "@/hooks/useAuth";

// Module-level cache so tabs sharing this hook (sidebar + page) get instant
// hydration after the first fetch in the session.
let cached: DayStatus | null = null;
let inflight: Promise<DayStatus> | null = null;

export function useDayStatus(pollMs = 20000) {
  const { user, loading: authLoading } = useAuth();
  const fetcher = useServerFn(getDayStatus);
  const [status, setStatus] = useState<DayStatus | null>(cached);
  const [ready, setReady] = useState<boolean>(cached !== null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (authLoading || !user) return;

    const load = async () => {
      try {
        if (!inflight) inflight = fetcher();
        const next = await inflight;
        cached = next;
        if (mounted.current) {
          setStatus(next);
          setReady(true);
        }
      } catch {
        // keep last good state
      } finally {
        inflight = null;
      }
    };
    load();
    const t = setInterval(() => {
      inflight = fetcher();
      inflight
        .then((next) => {
          cached = next;
          if (mounted.current) setStatus(next);
        })
        .catch(() => {})
        .finally(() => {
          inflight = null;
        });
    }, pollMs);

    return () => {
      mounted.current = false;
      clearInterval(t);
    };
  }, [fetcher, user, authLoading, pollMs]);

  return {
    ready,
    isDayOpen: status?.isDayOpen ?? false,
    isEcocashMode: status?.isEcocashMode ?? false,
    isAdmin: status?.isAdmin ?? false,
    dayOpenedAt: status?.dayOpenedAt ?? null,
  };
}
