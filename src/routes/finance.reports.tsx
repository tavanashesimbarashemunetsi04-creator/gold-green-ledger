import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/finance/reports")({
  component: FinanceReports,
});

function FinanceReports() {
  return (
    <div className="p-8 space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="text-sm text-muted-foreground">Daily and monthly reconciliation reports.</p>
      </header>
      <Card>
        <CardHeader><CardTitle className="text-base">Coming soon</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">Downloadable reconciliation, float, and cash-handling reports.</CardContent>
      </Card>
    </div>
  );
}
