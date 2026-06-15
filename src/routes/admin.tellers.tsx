import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/admin/tellers")({
  component: AdminTellers,
});

function AdminTellers() {
  return (
    <div className="p-8 space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Tellers</h1>
        <p className="text-sm text-muted-foreground">All teller accounts across branches.</p>
      </header>
      <Card>
        <CardHeader><CardTitle className="text-base">Coming soon</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">Teller roster with status, branch, and current session.</CardContent>
      </Card>
    </div>
  );
}
