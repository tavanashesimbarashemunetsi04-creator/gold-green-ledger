import { createFileRoute } from "@tanstack/react-router";
import { EcocashModule } from "@/components/EcocashModule";
import { useDayStatus } from "@/hooks/useDayStatus";
import { NoOpenDayNotice } from "@/components/NoOpenDayNotice";

export const Route = createFileRoute("/ecocash")({
  component: EcocashPage,
});

function EcocashPage() {
  const { isDayOpen, isEcocashMode, isAdmin, ready } = useDayStatus(15000);
  if (!isAdmin && (!ready || (!isDayOpen && !isEcocashMode))) {
    return <NoOpenDayNotice moduleName="Ecocash" />;
  }
  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Ecocash</h1>
        <p className="text-sm text-muted-foreground">
          Manage Ecocash inflows and outflows. Approved Ecocash-related internal transactions are imported automatically.
        </p>
      </header>
      <EcocashModule />
    </div>
  );
}
