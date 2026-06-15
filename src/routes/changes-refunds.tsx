import { createFileRoute } from "@tanstack/react-router";
import { useDayStatus } from "@/hooks/useDayStatus";
import { EcocashLockNotice } from "@/components/EcocashLockNotice";
import { NoOpenDayNotice } from "@/components/NoOpenDayNotice";

export const Route = createFileRoute("/changes-refunds")({
  component: ChangesRefundsPage,
});

function ChangesRefundsPage() {
  const { isEcocashMode, isDayOpen, isAdmin, ready } = useDayStatus(15000);
  if (ready && isEcocashMode) return <EcocashLockNotice moduleName="Changes and Refunds" />;
  if (!isAdmin && (!ready || !isDayOpen)) return <NoOpenDayNotice moduleName="Changes and Refunds" />;
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">Changes and Refunds</h1>
      <p className="text-sm text-muted-foreground">Process changes and refunds.</p>
    </div>
  );
}
