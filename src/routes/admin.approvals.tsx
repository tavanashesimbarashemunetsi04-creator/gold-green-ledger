import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/admin/approvals")({
  component: AdminApprovals,
});

function AdminApprovals() {
  return (
    <div className="p-8 space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Approvals</h1>
        <p className="text-sm text-muted-foreground">Pending items awaiting administrator approval.</p>
      </header>
      <Card>
        <CardHeader><CardTitle className="text-base">Coming soon</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">Review and approve internal transactions, float requests, and reversals.</CardContent>
      </Card>
    </div>
  );
}
