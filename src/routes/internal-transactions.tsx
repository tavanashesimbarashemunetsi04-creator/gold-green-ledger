import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/internal-transactions")({
  component: InternalTransactionsPage,
});

function InternalTransactionsPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">Internal Transactions</h1>
      <p className="text-sm text-muted-foreground">Record internal transactions.</p>
    </div>
  );
}
