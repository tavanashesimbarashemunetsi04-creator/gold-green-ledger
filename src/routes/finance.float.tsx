import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/finance/float")({
  component: FinanceFloat,
});

function FinanceFloat() {
  return (
    <div className="p-8 space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Float Management</h1>
        <p className="text-sm text-muted-foreground">Assign float to tellers and track approvals.</p>
      </header>
      <Card>
        <CardHeader><CardTitle className="text-base">Float assignments</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Float assignment is currently shared with the admin portal.</p>
          <Button asChild><Link to="/admin/float">Open Float Management</Link></Button>
        </CardContent>
      </Card>
    </div>
  );
}
