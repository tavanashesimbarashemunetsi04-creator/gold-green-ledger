import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CreditCard, Banknote } from "lucide-react";
import { WithdrawalEntryForm, type WithdrawalKind } from "@/components/WithdrawalEntryForm";

export const Route = createFileRoute("/withdrawals")({
  component: WithdrawalsPage,
});

const types: { id: WithdrawalKind; label: string; icon: typeof CreditCard }[] = [
  { id: "CASH_SWIPE", label: "Cash Swipes", icon: CreditCard },
  { id: "CASH_ADVANCE", label: "Cash Advance", icon: Banknote },
];

function WithdrawalsPage() {
  const [selected, setSelected] = useState<WithdrawalKind>("CASH_SWIPE");

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Withdrawals</h1>
        <p className="text-sm text-muted-foreground">
          Select a withdrawal type to record a transaction.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {types.map((t) => {
          const Icon = t.icon;
          return (
            <Button
              key={t.id}
              variant={selected === t.id ? "default" : "outline"}
              className="h-24 flex-col gap-2 text-base"
              onClick={() => setSelected(t.id)}
            >
              <Icon className="h-6 w-6" />
              {t.label}
            </Button>
          );
        })}
      </div>

      <div className="mt-8">
        <WithdrawalEntryForm key={selected} kind={selected} />
      </div>
    </div>
  );
}
