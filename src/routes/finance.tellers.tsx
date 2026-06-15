import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/finance/tellers")({
  component: FinanceTellers,
});

function FinanceTellers() {
  return (
    <div className="p-8 space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Tellers</h1>
        <p className="text-sm text-muted-foreground">Active tellers and their float status.</p>
      </header>
      <Card>
        <CardHeader><CardTitle className="text-base">Teller list</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Detailed teller view coming soon. In the meantime, manage users in the admin portal.</p>
          <Button asChild variant="outline"><Link to="/admin/users">Open Users</Link></Button>
        </CardContent>
      </Card>
    </div>
  );
}
