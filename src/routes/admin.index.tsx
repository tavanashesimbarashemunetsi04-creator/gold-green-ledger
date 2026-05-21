import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users,
  Building2,
  ListChecks,
  XCircle,
  Clock,
  ShieldAlert,
  ArrowDownToLine,
  ArrowUpFromLine,
} from "lucide-react";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

type Stats = {
  users: number;
  branches: number;
  tellers: number;
  pendingApprovals: number;
  pendingTx: number;
  failedTx: number;
  securityAlerts: number;
  todayInflowUSD: number;
  todayOutflowUSD: number;
};

function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const c = (q: any) => q.then((r: any) => r.count ?? 0);

      const [
        users,
        branches,
        tellers,
        pendingItx,
        pendingPay,
        pendingWd,
        failedPay,
        failedWd,
        alerts,
        eod,
      ] = await Promise.all([
        c(supabase.from("profiles").select("*", { count: "exact", head: true })),
        c(supabase.from("branches").select("*", { count: "exact", head: true })),
        c(supabase.from("tellers").select("*", { count: "exact", head: true })),
        c(supabase.from("internal_transactions").select("*", { count: "exact", head: true }).eq("status", "pending")),
        c(supabase.from("payments").select("*", { count: "exact", head: true }).eq("status", "pending")),
        c(supabase.from("cash_advance").select("*", { count: "exact", head: true }).eq("status", "pending")),
        c(supabase.from("payments").select("*", { count: "exact", head: true }).eq("status", "failed")),
        c(supabase.from("cash_advance").select("*", { count: "exact", head: true }).eq("status", "failed")),
        c(supabase.from("security_alerts").select("*", { count: "exact", head: true }).eq("is_read", false)),
        supabase.from("end_day_summary").select("total_inflow_usd,total_outflow_usd").eq("business_date", today),
      ]);

      const inflow = (eod.data ?? []).reduce((s: number, r: any) => s + Number(r.total_inflow_usd || 0), 0);
      const outflow = (eod.data ?? []).reduce((s: number, r: any) => s + Number(r.total_outflow_usd || 0), 0);

      setStats({
        users,
        branches,
        tellers,
        pendingApprovals: pendingItx,
        pendingTx: pendingPay + pendingWd,
        failedTx: failedPay + failedWd,
        securityAlerts: alerts,
        todayInflowUSD: inflow,
        todayOutflowUSD: outflow,
      });
      setLoading(false);
    })();
  }, []);

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          System-wide overview across branches and tellers.
        </p>
      </header>

      {loading || !stats ? (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          Loading stats…
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Users" value={stats.users} icon={<Users className="h-5 w-5" />} />
            <Kpi label="Branches" value={stats.branches} icon={<Building2 className="h-5 w-5" />} />
            <Kpi label="Tellers" value={stats.tellers} icon={<Users className="h-5 w-5" />} />
            <Kpi label="Unread Security Alerts" value={stats.securityAlerts} icon={<ShieldAlert className="h-5 w-5" />} tone={stats.securityAlerts > 0 ? "warn" : undefined} />
          </section>

          <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Pending Approvals" value={stats.pendingApprovals} icon={<ListChecks className="h-5 w-5" />} tone={stats.pendingApprovals > 0 ? "warn" : undefined} />
            <Kpi label="Pending Transactions" value={stats.pendingTx} icon={<Clock className="h-5 w-5" />} />
            <Kpi label="Failed Transactions" value={stats.failedTx} icon={<XCircle className="h-5 w-5" />} tone={stats.failedTx > 0 ? "danger" : undefined} />
            <Kpi label="Today Net USD" value={fmt(stats.todayInflowUSD - stats.todayOutflowUSD)} icon={<ArrowDownToLine className="h-5 w-5" />} />
          </section>

          <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Today's flows (USD)</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground flex items-center gap-2"><ArrowDownToLine className="h-4 w-4" /> Inflow</p>
                  <p className="mt-1 text-2xl font-semibold">${fmt(stats.todayInflowUSD)}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground flex items-center gap-2"><ArrowUpFromLine className="h-4 w-4" /> Outflow</p>
                  <p className="mt-1 text-2xl font-semibold">${fmt(stats.todayOutflowUSD)}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quick actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <a href="/admin/users" className="block rounded-md border px-3 py-2 hover:bg-muted">Manage users & roles →</a>
                <a href="/admin/approvals" className="block rounded-md border px-3 py-2 hover:bg-muted">Review pending approvals →</a>
                <a href="/admin/audit" className="block rounded-md border px-3 py-2 hover:bg-muted">View audit logs →</a>
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
