import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getManagerBalancingList, type TellerCard } from "@/lib/manager-portal.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/manager/balancing")({ component: BalancingTab });

function statusBadge(t: TellerCard) {
  if (t.balancing_status === "balanced") {
    const ok = Math.abs(Number(t.variance_usd ?? 0)) <= 0.005;
    return ok
      ? { color: "bg-green-500/10 text-green-700 border-green-500/40", label: "Balanced" }
      : { color: "bg-red-500/10 text-red-700 border-red-500/40", label: "Balanced w/ Variance" };
  }
  if (t.balancing_status === "in_review")
    return { color: "bg-amber-500/10 text-amber-700 border-amber-500/40", label: "In Review" };
  if (t.status === "closed")
    return { color: "bg-orange-500/10 text-orange-700 border-orange-500/40", label: "Pending Balance" };
  if (t.status === "open_day" || t.status === "ecocash")
    return { color: "bg-blue-500/10 text-blue-700 border-blue-500/40", label: "Day Active" };
  return { color: "bg-gray-200 text-gray-700 border-gray-300", label: "No Activity" };
}

function BalancingTab() {
  const fetcher = useServerFn(getManagerBalancingList);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<{ tellers: TellerCard[]; business_date: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await fetcher({ data: { businessDate: date } });
      setData(r);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel(`manager_balancing_${date}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "teller_balancing" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "teller_sessions" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "ecocash_sessions" }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const s = search.toLowerCase();
    return data.tellers.filter(
      (t) =>
        !s ||
        (t.username ?? "").toLowerCase().includes(s) ||
        (t.full_name ?? "").toLowerCase().includes(s) ||
        (t.branch_name ?? "").toLowerCase().includes(s),
    );
  }, [data, search]);

  return (
    <div className="p-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Balancing</h1>
          <p className="text-sm text-muted-foreground">Click a teller to open their balancing view.</p>
        </div>
        <div className="flex gap-3">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Business Date</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-48" />
          </div>
        </div>
      </header>

      <Input
        placeholder="Search teller name, username, or branch…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 max-w-md"
      />

      {loading ? (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">No tellers found.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((t) => {
            const b = statusBadge(t);
            return (
              <Link
                key={t.user_id}
                to="/manager/teller/$userId"
                params={{ userId: t.user_id }}
                search={{ date }}
              >
                <Card className="border transition hover:shadow-lg">
                  <CardContent className="p-5">
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">{t.full_name ?? t.display_name ?? t.username}</p>
                        <p className="text-xs text-muted-foreground">@{t.username ?? "—"} · {t.branch_name ?? "—"}</p>
                      </div>
                      <span className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${b.color}`}>
                        {b.label}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <Field label="Current Balance" value={`$${fmt(t.current_balance)}`} />
                      <Field label="Variance" value={t.variance_usd !== null ? `$${fmt(t.variance_usd)}` : "—"} />
                      <Field label="Open Time" value={t.open_time ? new Date(t.open_time).toLocaleTimeString() : "—"} />
                      <Field label="Close Time" value={t.close_time ? new Date(t.close_time).toLocaleTimeString() : "—"} />
                      <Field label="EcoCash" value={t.ecocash_session_code ? "Yes" : "No"} />
                      <Field label="Branch" value={t.branch_name ?? "—"} />
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
