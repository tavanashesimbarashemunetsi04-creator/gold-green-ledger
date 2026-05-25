import { createFileRoute } from "@tanstack/react-router";
import { useDashboardState } from "@/hooks/useDashboardState";
import { EcocashLockNotice } from "@/components/EcocashLockNotice";

export const Route = createFileRoute("/changes-refunds")({
  component: ChangesRefundsPage,
});

function ChangesRefundsPage() {
  const { isEcocashMode } = useDashboardState(15000);
  if (isEcocashMode) return <EcocashLockNotice moduleName="Changes and Refunds" />;
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">Changes and Refunds</h1>
      <p className="text-sm text-muted-foreground">Process changes and refunds.</p>
    </div>
  );
}
