import { useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SignaturePad, type SignaturePadHandle } from "@/components/SignaturePad";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RateAwareAmountFields, useCurrencyRates } from "@/components/RateAwareAmountFields";

export type WithdrawalKind = "CASH_SWIPE" | "CASH_ADVANCE";
export type WithdrawalStatus = "successful" | "pending" | "failed";
const STATUSES: WithdrawalStatus[] = ["successful", "pending", "failed"];

export type WithdrawalEntry = {
  date: string;
  name: string;
  card_last4: string;
  phone_number: string;
  id_number: string;
  transaction_type: "withdrawal";
  code: string;
  usd_amount?: number | null;
  zwg_amount?: number | null;
  amount?: number;
  signature_url: string;
  created_at: string;
  status: WithdrawalStatus;
};

interface Props {
  kind: WithdrawalKind;
  onSubmitted?: (entry: WithdrawalEntry) => void;
}

const today = new Date().toISOString().slice(0, 10);

const baseInit = {
  date: today,
  name: "",
  card_number: "",
  phone_number: "",
  id_number: "",
  code: "",
};

export function WithdrawalEntryForm({ kind, onSubmitted }: Props) {
  const isSwipe = kind === "CASH_SWIPE";
  const txType = isSwipe ? "Cash Swipe" : "Cash Advance";
  const table = isSwipe ? "cash_swipes" : "cash_advance";

  const [form, setForm] = useState({
    ...baseInit,
    usd_amount: "",
    zwg_amount: "",
    amount: "",
    status: "pending" as WithdrawalStatus,
  });
  const [signature, setSignature] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const padRef = useRef<SignaturePadHandle>(null);
  const rates = useCurrencyRates();
  const withdrawalsRate = rates?.withdrawals_rate ?? 0;

  const update = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const reset = () => {
    setForm({ ...baseInit, usd_amount: "", zwg_amount: "", amount: "", status: "pending" });
    setSignature(null);
    padRef.current?.clear();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.date) return toast.error("Date is required");
    if (!form.name.trim()) return toast.error("Name is required");
    if (!form.card_number.trim()) return toast.error("Card Number is required");
    if (!form.id_number.trim()) return toast.error("ID Number is required");

    if (isSwipe) {
      const hasUsd = !!form.usd_amount && Number(form.usd_amount) > 0;
      const hasZwg = !!form.zwg_amount && Number(form.zwg_amount) > 0;
      if (hasUsd === hasZwg)
        return toast.error("Enter exactly one of USD or ZWG amount");
    } else {
      if (!form.amount || Number(form.amount) <= 0)
        return toast.error("Amount must be greater than 0");
    }

    if (!signature) return toast.error("Signature is required");

    const card = form.card_number.replace(/\D/g, "");
    const card_last4 = card.slice(-4).padStart(4, "0");

    const entry: WithdrawalEntry = {
      date: form.date,
      name: form.name.trim(),
      card_last4,
      
      phone_number: form.phone_number.trim(),
      id_number: form.id_number.trim(),
      transaction_type: "withdrawal",
      code: form.code.trim(),
      signature_url: signature,
      created_at: new Date().toISOString(),
      status: form.status,
      ...(isSwipe
        ? {
            usd_amount: form.usd_amount ? Number(form.usd_amount) : null,
            zwg_amount: form.zwg_amount ? Number(form.zwg_amount) : null,
          }
        : { amount: Number(form.amount) }),
    } as WithdrawalEntry;

    try {
      setSubmitting(true);
      const { card_number: _omit, ...payload } = entry as WithdrawalEntry & { card_number?: string };
      const { error } = await (supabase.from(table) as any).insert(payload);
      if (error) throw error;
      toast.success(`${txType} saved`);
      onSubmitted?.(entry);
      reset();
    } catch (err) {
      console.error(`Failed to save ${txType}:`, err);
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  const submitDisabled = submitting || !signature;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{txType} Entry</CardTitle>
        <CardDescription>Record a new {txType.toLowerCase()} transaction.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Identity */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="date">Date *</Label>
              <Input
                id="date"
                type="date"
                value={form.date}
                onChange={(e) => update("date", e.target.value)}
                className="max-w-[200px]"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                maxLength={100}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="card_number">Card Number *</Label>
              <Input
                id="card_number"
                value={form.card_number}
                onChange={(e) => update("card_number", e.target.value)}
                maxLength={32}
                className="max-w-[200px]"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone_number">Phone Number</Label>
              <Input
                id="phone_number"
                value={form.phone_number}
                onChange={(e) => update("phone_number", e.target.value)}
                maxLength={20}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="id_number">ID Number *</Label>
              <Input
                id="id_number"
                value={form.id_number}
                onChange={(e) => update("id_number", e.target.value)}
                maxLength={50}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="transaction_type">Transaction Type</Label>
              <Input id="transaction_type" value={txType} readOnly disabled />
            </div>
          </div>

          {/* Financials */}
          {isSwipe ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <RateAwareAmountFields
                kind="withdrawal"
                defaultRate={withdrawalsRate}
                usdValue={form.usd_amount}
                zwgValue={form.zwg_amount}
                onUsdChange={(v) => update("usd_amount", v)}
                onZwgChange={(v) => update("zwg_amount", v)}
                onCodeChange={(c) => setForm((f) => ({ ...f, code: String(c) }))}
                reference={`${txType} ${form.name || form.card_number}`.trim()}
              />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="code">Code</Label>
                <Input
                  id="code"
                  value={form.code}
                  onChange={(e) => update("code", e.target.value)}
                  maxLength={50}
                  className="max-w-[200px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount *</Label>
                <Input
                  id="amount"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={form.amount}
                  onChange={(e) => update("amount", e.target.value)}
                  required
                />
              </div>
            </div>
          )}

          {/* Status */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>Status *</Label>
              <Select
                value={form.status}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, status: v as WithdrawalStatus }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Signature */}
          <SignaturePad ref={padRef} onChange={setSignature} />

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={reset} disabled={submitting}>
              Reset
            </Button>
            <Button type="submit" disabled={submitDisabled}>
              {submitting ? "Saving..." : `Save ${txType}`}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
