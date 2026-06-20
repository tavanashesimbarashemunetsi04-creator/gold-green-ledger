import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Megaphone } from "lucide-react";

type Announcement = { message: string; updated_at: string } | null;

// Session-scoped: a fresh login always re-prompts.
const ACK_KEY = "afs_announcement_ack";

function readAck(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(ACK_KEY);
  } catch {
    return null;
  }
}

function extractAnnouncement(value: unknown): Announcement {
  const v = (value ?? {}) as { announcement?: Announcement };
  const a = v.announcement;
  if (a && a.message && a.message.trim().length > 0 && a.updated_at) return a;
  return null;
}

export function AnnouncementGate() {
  const { user } = useAuth();
  const [announcement, setAnnouncement] = useState<Announcement>(null);
  const [acked, setAcked] = useState<string | null>(null);

  // Initial ack read + reset on user identity change (logout / login)
  useEffect(() => {
    setAcked(readAck());
  }, [user?.id]);

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log("[announcement] effect run, user=", user?.id ?? null);
    if (!user) {
      setAnnouncement(null);
      return;
    }
    let cancelled = false;

    const fetchIt = async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "global")
        .maybeSingle();
      if (cancelled) return;
      setAnnouncement(extractAnnouncement(data?.value));
    };

    fetchIt();

    // Real-time push: instant delivery via Supabase Realtime (WebSocket).
    // Ensure the socket carries the user's auth so RLS-bound postgres_changes
    // events actually reach the client.
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (token) supabase.realtime.setAuth(token);
      if (cancelled) return;
      channel = supabase
        .channel("app-settings-announcement")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "app_settings", filter: "key=eq.global" },
          (payload) => {
            // eslint-disable-next-line no-console
            console.log("[announcement] realtime payload", payload);
            const next = (payload.new ?? {}) as { value?: unknown };
            setAnnouncement(extractAnnouncement(next.value));
          },
        )
        .subscribe((status) => {
          // eslint-disable-next-line no-console
          console.log("[announcement] channel status", status);
        });
    })();



    // Safety net: refetch on tab focus in case the socket was offline.
    const onFocus = () => fetchIt();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      if (channel) supabase.removeChannel(channel);
    };
  }, [user]);

  if (!user || !announcement) return null;
  if (acked === announcement.updated_at) return null;

  const handleAck = () => {
    try {
      window.sessionStorage.setItem(ACK_KEY, announcement.updated_at);
    } catch {
      /* storage unavailable — keep state-only ack */
    }
    setAcked(announcement.updated_at);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Important Notice from Admin"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 p-6 backdrop-blur-sm"
    >
      <div className="max-w-2xl w-full rounded-2xl border-2 border-primary bg-card p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-full bg-primary/10 p-3">
            <Megaphone className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Important Notice from Admin</h2>
            <p className="text-xs text-muted-foreground">
              Posted {new Date(announcement.updated_at).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="rounded-lg bg-muted p-5 mb-6">
          <p className="whitespace-pre-wrap text-base leading-relaxed">
            {announcement.message}
          </p>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Please read the notice carefully. Click the button below to confirm you
          have noted these changes. The dashboard will remain locked until you do.
        </p>
        <div className="flex justify-end">
          <Button size="lg" onClick={handleAck} className="px-8">
            I have noted this change
          </Button>
        </div>
      </div>
    </div>
  );
}
