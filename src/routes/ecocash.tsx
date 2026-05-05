import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/ecocash")({
  component: EcocashPage,
});

function EcocashPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">Ecocash</h1>
      <p className="text-sm text-muted-foreground">Ecocash transactions.</p>
    </div>
  );
}
