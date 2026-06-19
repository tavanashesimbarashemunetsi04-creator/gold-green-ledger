import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Landmark } from "lucide-react";
import { PaymentEntryForm, type BankTab, type PaymentEntry } from "@/components/PaymentEntryForm";
import { useDayStatus } from "@/hooks/useDayStatus";
import { EcocashLockNotice } from "@/components/EcocashLockNotice";
import { NoOpenDayNotice } from "@/components/NoOpenDayNotice";
import { TransactionHistoryTable, type HistoryColumn } from "@/components/TransactionHistoryTable";

export const Route = createFileRoute("/payments")({
  component: PaymentsPage,
});

const banks: { id: BankTab; label: string }[] = [
  { id: "ZB", label: "ZB Transaction" },
  { id: "CBZ", label: "CBZ Transaction" },
  { id: "BANCABC", label: "BANCABC Transaction" },
  { id: "AFC", label: "AFC Transaction" },
];

const paymentColumns: HistoryColumn[] = [
  { key: "account_number", label: "Account Number" },
  { key: "phone_number", label: "Phone Number" },
  { key: "code", label: "Code" },
  { key: "payment_type", label: "Payment Type" },
  { key: "usd_amount", label: "USD Amount", align: "right",
    render: (r) => r.usd_amount != null ? Number(r.usd_amount as number).toFixed(2) : "—" },
  { key: "zwg_amount", label: "ZWG Amount", align: "right",
    render: (r) => r.zwg_amount != null ? Number(r.zwg_amount as number).toFixed(2) : "—" },
  { key: "category", label: "Category" },
  { key: "status", label: "Status", render: (r) => <span className="capitalize">{String(r.status)}</span> },
  { key: "notes", label: "Notes" },
];

function PaymentsPage() {
  const [selected, setSelected] = useState<BankTab>("ZB");
  const [refreshKey, setRefreshKey] = useState(0);
  const { isEcocashMode, isDayOpen, isAdmin, ready, dayOpenedAt } = useDayStatus(15000);
  if (ready && isEcocashMode) return <EcocashLockNotice moduleName="Payments" />;
  if (!isAdmin && (!ready || !isDayOpen)) return <NoOpenDayNotice moduleName="Payments" />;

  const handleSubmit = async (entry: PaymentEntry) => {
    console.log("Payment entry:", entry);
    setRefreshKey((k) => k + 1);
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
      <TransactionHistoryTable
        key={selected}
        table="payments"
        columns={paymentColumns}
        dayOpenedAt={dayOpenedAt}
        match={{ bank: selected }}
        refreshKey={refreshKey}
        title={`${selected} Payment History`}
        description="Payments recorded for this bank during the current open day. Newest first."
      />
    </div>
  );
}
