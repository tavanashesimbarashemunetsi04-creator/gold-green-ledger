import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Megaphone } from "lucide-react";

type Announcement = { message: string; updated_at: string } | null;

const ACK_KEY = "afs_announcement_ack";

export function AnnouncementGate() {
  const { user } = useAuth();
  const [announcement, setAnnouncement] = useState<Announcement>(null);
  const [acked, setAcked] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setAcked(localStorage.getItem(ACK_KEY));
  }, []);

  useEffect(() => {
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
      const v = (data?.value ?? {}) as { announcement?: Announcement };
      const a = v.announcement;
      if (a && a.message && a.message.trim().length > 0 && a.updated_at) {
        setAnnouncement(a);
      } else {
        setAnnouncement(null);
      }
    };

    fetchIt();
    // Poll frequently so a newly-posted announcement reaches every connected
    // user within a few seconds of the admin saving.
    const id = window.setInterval(fetchIt, 5_000);
    const onFocus = () => fetchIt();
    const onVisible = () => { if (document.visibilityState === "visible") fetchIt(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user]);

  if (!user || !announcement) return null;
  if (acked === announcement.updated_at) return null;

  const handleAck = () => {
    localStorage.setItem(ACK_KEY, announcement.updated_at);
    setAcked(announcement.updated_at);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
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
          have noted these changes.
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
