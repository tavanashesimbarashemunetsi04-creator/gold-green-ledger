import { createFileRoute } from "@tanstack/react-router";
import { TellerTransfersModule } from "@/components/TellerTransfersModule";

export const Route = createFileRoute("/internal-transactions")({
  component: InternalTransactionsPage,
});

function InternalTransactionsPage() {
  return (
    <div className="p-8">
      <TellerTransfersModule />
    </div>
  );
}
