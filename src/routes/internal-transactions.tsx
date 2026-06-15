import { createFileRoute } from "@tanstack/react-router";
import { TellerTransfersModule } from "@/components/TellerTransfersModule";
import { useDayStatus } from "@/hooks/useDayStatus";
import { NoOpenDayNotice } from "@/components/NoOpenDayNotice";

export const Route = createFileRoute("/internal-transactions")({
  component: InternalTransactionsPage,
});

function InternalTransactionsPage() {
  const { isDayOpen, isAdmin, ready } = useDayStatus(15000);
  if (!isAdmin && (!ready || !isDayOpen)) return <NoOpenDayNotice moduleName="Internal Transactions" />;
  return (
    <div className="p-8">
      <TellerTransfersModule />
    </div>
  );
}
