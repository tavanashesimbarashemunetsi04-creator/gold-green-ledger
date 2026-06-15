import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/admin/branches")({
  component: AdminBranches,
});

function AdminBranches() {
  return (
    <div className="p-8 space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Branches</h1>
        <p className="text-sm text-muted-foreground">Manage branches and their assigned managers.</p>
      </header>
      <Card>
        <CardHeader><CardTitle className="text-base">Coming soon</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">Create, edit, and deactivate branches.</CardContent>
      </Card>
    </div>
  );
}
