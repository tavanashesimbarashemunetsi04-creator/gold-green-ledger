import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, ArrowLeftRight, Users, FileBarChart } from "lucide-react";

export const Route = createFileRoute("/finance/")({
  component: FinanceDashboard,
});

function FinanceDashboard() {
  return (
    <div className="p-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Finance Manager Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Float assignments, received cash reconciliation, and teller oversight.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <QuickCard icon={ArrowLeftRight} title="Float Management" href="/finance/float" desc="Assign and track teller float." />
        <QuickCard icon={Wallet} title="Received Cash" href="/finance/received-cash" desc="Record physical cash collected." />
        <QuickCard icon={Users} title="Tellers" href="/finance/tellers" desc="View active tellers and balances." />
        <QuickCard icon={FileBarChart} title="Reports" href="/finance/reports" desc="Daily and monthly reconciliation." />
      </section>

      <Card>
        <CardHeader><CardTitle className="text-base">Welcome</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Use the sidebar to manage float, record received cash, and review teller activity. Detailed widgets coming soon.
        </CardContent>
      </Card>
    </div>
  );
}

function QuickCard({ icon: Icon, title, href, desc }: { icon: any; title: string; href: string; desc: string }) {
  return (
    <a href={href} className="block rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-elegant)]">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--gradient-primary)] text-primary-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
    </a>
  );
}
