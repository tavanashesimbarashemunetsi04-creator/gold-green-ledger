import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getManagerDashboard, type TellerCard } from "@/lib/manager-portal.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, Users, Activity, AlertTriangle, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/manager/")({ component: ManagerDashboard });

function statusColor(s: TellerCard["status"], v: TellerCard["variance_status"]) {
  if (v === "variance") return { dot: "bg-red-500", ring: "border-red-500/40", label: "Variance" };
  if (s === "open_day") return { dot: "bg-green-500", ring: "border-green-500/40", label: "Open Day" };
  if (s === "ecocash") return { dot: "bg-blue-500", ring: "border-blue-500/40", label: "EcoCash Day" };
  if (s === "closed") return v === "balanced"
    ? { dot: "bg-green-500", ring: "border-green-500/40", label: "Balanced" }
    : { dot: "bg-orange-500", ring: "border-orange-500/40", label: "Pending Balancing" };
  return { dot: "bg-gray-400", ring: "border-gray-300", label: "Offline" };
}

function ManagerDashboard() {
  const fetcher = useServerFn(getManagerDashboard);
  const [data, setData] = useState<{ tellers: TellerCard[]; business_date: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");

  const refresh = async () => {
    try {
      const r = await fetcher();
      setData(r);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15000);
    const ch = supabase
      .channel("manager_dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "teller_sessions" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "ecocash_sessions" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_internal_transactions" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "teller_balancing" }, refresh)
      .subscribe();
    return () => {
      clearInterval(interval);
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const s = search.toLowerCase();
    return data.tellers.filter((t) => {
      const matchesSearch = !s ||
        (t.username ?? "").toLowerCase().includes(s) ||
        (t.full_name ?? "").toLowerCase().includes(s) ||
        (t.display_name ?? "").toLowerCase().includes(s) ||
        (t.branch_name ?? "").toLowerCase().includes(s);
      if (!matchesSearch) return false;
      if (filter === "all") return true;
      if (filter === "open") return t.status === "open_day";
      if (filter === "closed") return t.status === "closed";
      if (filter === "ecocash") return t.status === "ecocash";
      if (filter === "variance") return t.variance_status === "variance";
      return true;
    });
  }, [data, search, filter]);

  const stats = useMemo(() => {
    if (!data) return { total: 0, open: 0, variance: 0, balanced: 0 };
    return {
      total: data.tellers.length,
      open: data.tellers.filter((t) => t.status === "open_day" || t.status === "ecocash").length,
      variance: data.tellers.filter((t) => t.variance_status === "variance").length,
      balanced: data.tellers.filter((t) => t.variance_status === "balanced").length,
    };
  }, [data]);

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Manager Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Real-time teller activity for {data?.business_date ?? "today"}
        </p>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Total Tellers" value={stats.total} icon={<Users className="h-5 w-5" />} />
        <Kpi label="Active Now" value={stats.open} icon={<Activity className="h-5 w-5" />} />
        <Kpi label="Variances" value={stats.variance} icon={<AlertTriangle className="h-5 w-5" />} tone={stats.variance > 0 ? "danger" : undefined} />
        <Kpi label="Balanced" value={stats.balanced} icon={<CheckCircle2 className="h-5 w-5" />} />
      </section>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search teller name, username, or branch…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          {[
            { v: "all", l: "All" },
            { v: "open", l: "Open Day" },
            { v: "ecocash", l: "EcoCash" },
            { v: "closed", l: "Closed" },
            { v: "variance", l: "Variance" },
          ].map((f) => (
            <button
              key={f.v}
              onClick={() => setFilter(f.v)}
              className={`rounded-md border px-3 py-2 text-xs font-medium transition ${
                filter === f.v ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
              }`}
            >
              {f.l}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">No tellers match.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((t) => {
            const c = statusColor(t.status, t.variance_status);
            return (
              <Link
                key={t.user_id}
                to="/manager/teller/$userId"
                params={{ userId: t.user_id }}
                search={{ date: data?.business_date }}
              >
                <Card className={`border-2 transition hover:shadow-lg ${c.ring}`}>
                  <CardContent className="p-5">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{t.full_name ?? t.display_name ?? t.username ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">@{t.username ?? "—"} · {t.branch_name ?? "No branch"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} />
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.label}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <Field label="Opening Float" value={`$${fmt(t.opening_float)}`} />
                      <Field label="Current Balance" value={`$${fmt(t.current_balance)}`} />
                      <Field label="Last Activity" value={t.last_activity ? new Date(t.last_activity).toLocaleTimeString() : "—"} />
                      <Field label="Variance" value={t.variance_usd !== null ? `$${fmt(t.variance_usd)}` : "—"} />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function fmt(n: number) {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium">{value}</p>
    </div>
  );
}

function Kpi({ label, value, icon, tone }: { label: string; value: number | string; icon: React.ReactNode; tone?: "warn" | "danger" }) {
  const ring = tone === "danger" ? "border-destructive/40" : tone === "warn" ? "border-[var(--gold)]/40" : "border-border";
  return (
    <Card className={ring}>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
        </div>
        <div className="text-muted-foreground">{icon}</div>
      </CardContent>
    </Card>
  );
}
