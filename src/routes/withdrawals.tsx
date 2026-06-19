import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CreditCard, Banknote } from "lucide-react";
import { WithdrawalEntryForm, type WithdrawalKind } from "@/components/WithdrawalEntryForm";
import { useDayStatus } from "@/hooks/useDayStatus";
import { EcocashLockNotice } from "@/components/EcocashLockNotice";
import { NoOpenDayNotice } from "@/components/NoOpenDayNotice";
import { TransactionHistoryTable, type HistoryColumn } from "@/components/TransactionHistoryTable";

export const Route = createFileRoute("/withdrawals")({
  component: WithdrawalsPage,
});

const types: { id: WithdrawalKind; label: string; icon: typeof CreditCard }[] = [
  { id: "CASH_SWIPE", label: "Cash Swipes", icon: CreditCard },
  { id: "CASH_ADVANCE", label: "Cash Advance", icon: Banknote },
];

const swipeColumns: HistoryColumn[] = [
  { key: "name", label: "Name" },
  { key: "card_last4", label: "Card Number" },
  { key: "phone_number", label: "Phone Number" },
  { key: "id_number", label: "ID Number" },
  { key: "transaction_type", label: "Transaction Type" },
  { key: "code", label: "Code" },
  { key: "usd_amount", label: "USD Amount", align: "right",
    render: (r) => r.usd_amount != null ? Number(r.usd_amount as number).toFixed(2) : "—" },
  { key: "zwg_amount", label: "ZWG Amount", align: "right",
    render: (r) => r.zwg_amount != null ? Number(r.zwg_amount as number).toFixed(2) : "—" },
  { key: "status", label: "Status", render: (r) => <span className="capitalize">{String(r.status)}</span> },
  { key: "notes", label: "Notes" },
];

const advanceColumns: HistoryColumn[] = [
  { key: "name", label: "Name" },
  { key: "card_last4", label: "Card Number" },
  { key: "phone_number", label: "Phone Number" },
  { key: "id_number", label: "ID Number" },
  { key: "transaction_type", label: "Transaction Type" },
  { key: "code", label: "Code" },
  { key: "amount", label: "Amount", align: "right",
    render: (r) => r.amount != null ? Number(r.amount as number).toFixed(2) : "—" },
  { key: "status", label: "Status", render: (r) => <span className="capitalize">{String(r.status)}</span> },
  { key: "notes", label: "Notes" },
];

function WithdrawalsPage() {
  const [selected, setSelected] = useState<WithdrawalKind>("CASH_SWIPE");
  const [refreshKey, setRefreshKey] = useState(0);
  const { isEcocashMode, isDayOpen, isAdmin, ready, dayOpenedAt } = useDayStatus(15000);
  if (ready && isEcocashMode) return <EcocashLockNotice moduleName="Withdrawals" />;
  if (!isAdmin && (!ready || !isDayOpen)) return <NoOpenDayNotice moduleName="Withdrawals" />;

  const isSwipe = selected === "CASH_SWIPE";

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Withdrawals</h1>
        <p className="text-sm text-muted-foreground">Select a withdrawal type to record a transaction.</p>
      </header>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {types.map((t) => {
          const Icon = t.icon;
          return (
            <Button key={t.id} variant={selected === t.id ? "default" : "outline"}
              className="h-24 flex-col gap-2 text-base" onClick={() => setSelected(t.id)}>
              <Icon className="h-6 w-6" />
              {t.label}
            </Button>
          );
        })}
      </div>
      <div className="mt-8">
        <WithdrawalEntryForm key={selected} kind={selected} onSubmitted={() => setRefreshKey((k) => k + 1)} />
      </div>
      <TransactionHistoryTable
        key={selected}
        table={isSwipe ? "cash_swipes" : "cash_advance"}
        columns={isSwipe ? swipeColumns : advanceColumns}
        dayOpenedAt={dayOpenedAt}
        refreshKey={refreshKey}
        title={`${isSwipe ? "Cash Swipe" : "Cash Advance"} History`}
        description="Transactions recorded during the current open day. Newest first."
      />
    </div>
  );
}
