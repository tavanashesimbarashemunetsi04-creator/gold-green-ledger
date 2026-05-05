import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/changes-refunds")({
  component: ChangesRefundsPage,
});

function ChangesRefundsPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">Changes and Refunds</h1>
      <p className="text-sm text-muted-foreground">Process changes and refunds.</p>
    </div>
  );
}
