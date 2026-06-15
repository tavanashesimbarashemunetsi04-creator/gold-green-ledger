import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/finance/audit")({
  component: FinanceAudit,
});

function FinanceAudit() {
  return (
    <div className="p-8 space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Audit Logs</h1>
        <p className="text-sm text-muted-foreground">Financial activity audit trail.</p>
      </header>
      <Card>
        <CardHeader><CardTitle className="text-base">Coming soon</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">Audit log viewer scoped to float, received cash, and reconciliation events.</CardContent>
      </Card>
    </div>
  );
}
