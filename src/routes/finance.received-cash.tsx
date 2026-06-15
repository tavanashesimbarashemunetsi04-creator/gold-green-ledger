import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/finance/received-cash")({
  component: ReceivedCash,
});

function ReceivedCash() {
  return (
    <div className="p-8 space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Received Cash</h1>
        <p className="text-sm text-muted-foreground">Record actual cash physically received from each teller.</p>
      </header>
      <Card>
        <CardHeader><CardTitle className="text-base">Coming soon</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          The Received Cash module requires a database migration that has not yet been applied.
          Enable <strong>Modify database</strong> under <em>Always allow</em> in Lovable Cloud settings, then re-run the request to finish this module.
        </CardContent>
      </Card>
    </div>
  );
}
