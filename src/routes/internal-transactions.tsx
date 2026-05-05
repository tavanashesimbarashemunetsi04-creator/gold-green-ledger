import { createFileRoute } from "@tanstack/react-router";
import { InternalTransactionsModule } from "@/components/InternalTransactionsModule";

export const Route = createFileRoute("/internal-transactions")({
  component: InternalTransactionsPage,
});

function InternalTransactionsPage() {
  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Internal Transactions</h1>
        <p className="text-sm text-muted-foreground">
          Record teller-to-teller fund movements with dual approval.
        </p>
      </header>
      <InternalTransactionsModule />
    </div>
  );
}
