import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Landmark } from "lucide-react";
import { PaymentEntryForm, type BankTab, type PaymentEntry } from "@/components/PaymentEntryForm";
import { useDayStatus } from "@/hooks/useDayStatus";
import { EcocashLockNotice } from "@/components/EcocashLockNotice";
import { NoOpenDayNotice } from "@/components/NoOpenDayNotice";

export const Route = createFileRoute("/payments")({
  component: PaymentsPage,
});

const banks: { id: BankTab; label: string }[] = [
  { id: "ZB", label: "ZB Transaction" },
  { id: "CBZ", label: "CBZ Transaction" },
  { id: "BANCABC", label: "BANCABC Transaction" },
  { id: "AFC", label: "AFC Transaction" },
];

function PaymentsPage() {
  const [selected, setSelected] = useState<BankTab>("ZB");
  const { isEcocashMode } = useDashboardState(15000);
  if (isEcocashMode) return <EcocashLockNotice moduleName="Payments" />;

  const handleSubmit = async (entry: PaymentEntry) => {
    console.log("Payment entry:", entry);
  };

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Payments</h1>
        <p className="text-sm text-muted-foreground">Select a bank to record a transaction.</p>
      </header>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {banks.map((b) => (
          <Button key={b.id} variant={selected === b.id ? "default" : "outline"}
            className="h-24 flex-col gap-2 text-base" onClick={() => setSelected(b.id)}>
            <Landmark className="h-6 w-6" />
            {b.label}
          </Button>
        ))}
      </div>
      <div className="mt-8">
        <PaymentEntryForm key={selected} bank={selected} onSubmit={handleSubmit} />
      </div>
    </div>
  );
}
