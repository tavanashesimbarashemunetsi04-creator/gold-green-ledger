import { createFileRoute } from "@tanstack/react-router";
import { TellerTransfersModule } from "@/components/TellerTransfersModule";
import { useDashboardState } from "@/hooks/useDashboardState";
import { EcocashLockNotice } from "@/components/EcocashLockNotice";

export const Route = createFileRoute("/internal-transactions")({
  component: InternalTransactionsPage,
});

function InternalTransactionsPage() {
  const { isEcocashMode } = useDashboardState(15000);
  if (isEcocashMode) return <EcocashLockNotice moduleName="Internal Transactions" />;
  return (
    <div className="p-8">
      <TellerTransfersModule />
    </div>
  );
}
