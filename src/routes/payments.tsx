import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Landmark } from "lucide-react";

export const Route = createFileRoute("/payments")({
  component: PaymentsPage,
});

const banks = [
  { id: "zb", label: "ZB Transaction" },
  { id: "cbz", label: "CBZ Transaction" },
  { id: "bancabc", label: "BANCABC Transaction" },
  { id: "afc", label: "AFC Transaction" },
] as const;

type BankId = (typeof banks)[number]["id"];

function PaymentsPage() {
  const [selected, setSelected] = useState<BankId | null>(null);

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Payments</h1>
        <p className="text-sm text-muted-foreground">
          Select a bank to record a transaction.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {banks.map((b) => (
          <Button
            key={b.id}
            variant={selected === b.id ? "default" : "outline"}
            className="h-24 flex-col gap-2 text-base"
            onClick={() => setSelected(b.id)}
          >
            <Landmark className="h-6 w-6" />
            {b.label}
          </Button>
        ))}
      </div>

      {selected && (
        <Card className="mt-8 p-6">
          <h2 className="text-lg font-semibold">
            {banks.find((b) => b.id === selected)?.label}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Record a new transaction for this bank.
          </p>
        </Card>
      )}
    </div>
  );
}
