import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RateAwareAmountFields, useCurrencyRates } from "@/components/RateAwareAmountFields";

export type BankTab = "ZB" | "BANCABC" | "CBZ" | "AFC";

export type PaymentEntry = {
  bank: BankTab;
  date: string;
  account_name: string;
  account_number: string;
  phone_number: string;
  code: string;
  payment_type: string;
  usd_amount: number | null;
  zwg_amount: number | null;
  category: string;
  custom_category?: string;
  notes: string;
  status: PaymentStatus;
};

export type PaymentStatus = "successful" | "pending" | "failed";
const STATUSES: PaymentStatus[] = ["successful", "pending", "failed"];

const PAYMENT_TYPES = ["USD - ZWG", "Cash USD", "Swipe", "Cash ZWG"] as const;
const CATEGORIES = [
  "Zesa",
  "COH",
  "School Fees",
  "University Fees",
  "DSTV",
  "Deposits",
  "Nyaradzo",
  "Doves",
  "Cimas",
  "Other",
] as const;

const today = new Date().toISOString().slice(0, 10);

const initialState = {
  date: today,
  account_name: "",
  account_number: "",
  phone_number: "",
  code: "",
  payment_type: "",
  usd_amount: "",
  zwg_amount: "",
  category: "",
  custom_category: "",
  notes: "",
  status: "pending" as PaymentStatus,
};

interface Props {
  bank: BankTab;
  onSubmit?: (entry: PaymentEntry) => void | Promise<void>;
}

export function PaymentEntryForm({ bank, onSubmit }: Props) {
  const [form, setForm] = useState(initialState);
  const [submitting, setSubmitting] = useState(false);
  const rates = useCurrencyRates();
  const paymentsRate = rates?.payments_rate ?? 0;

  const update = <K extends keyof typeof initialState>(key: K, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.date) return toast.error("Date is required");
    if (!form.payment_type) return toast.error("Payment Type is required");
    if (!form.usd_amount && !form.zwg_amount)
      return toast.error("Enter at least one of USD or ZWG amount");

    const entry: PaymentEntry = {
      bank,
      date: form.date,
      account_name: form.account_name.trim(),
      account_number: form.account_number.trim(),
      phone_number: form.phone_number.trim(),
      code: form.code.trim(),
      payment_type: form.payment_type,
      usd_amount: form.usd_amount ? Number(form.usd_amount) : null,
      zwg_amount: form.zwg_amount ? Number(form.zwg_amount) : null,
      category: form.category === "Other" ? `Other: ${form.custom_category.trim()}` : form.category,
      custom_category: form.custom_category.trim(),
      notes: form.notes.trim(),
      status: form.status,
    };

    try {
      setSubmitting(true);
      await onSubmit?.(entry);
      toast.success(`${bank} transaction saved`);
      setForm(initialState);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{bank} Transaction Entry</CardTitle>
        <CardDescription>Record a new payment for {bank}.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Identity */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            <div className="space-y-2">
              <Label htmlFor="date">Date *</Label>
              <Input
                id="date"
                type="date"
                value={form.date}
                onChange={(e) => update("date", e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account_name">Account Name</Label>
              <Input
                id="account_name"
                value={form.account_name}
                onChange={(e) => update("account_name", e.target.value)}
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account_number">Account Number</Label>
              <Input
                id="account_number"
                value={form.account_number}
                onChange={(e) => update("account_number", e.target.value)}
                maxLength={50}
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
          </div>



          {/* Payment + Category */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Payment Type *</Label>
              <Select
                value={form.payment_type}
                onValueChange={(v) => update("payment_type", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select payment type" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) => update("category", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.category === "Other" && (
                <div className="pt-2">
                  <Label htmlFor="custom_category">Custom Category</Label>
                  <Input
                    id="custom_category"
                    value={form.custom_category}
                    onChange={(e) => update("custom_category", e.target.value)}
                    placeholder="Describe the transaction type"
                    maxLength={100}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Code + Amounts (auto-calc using Admin-set Payments Rate) */}
          <div className="grid gap-4 sm:grid-cols-3">
            <RateAwareAmountFields
              kind="payment"
              defaultRate={paymentsRate}
              usdValue={form.usd_amount}
              zwgValue={form.zwg_amount}
              onUsdChange={(v) => update("usd_amount", v)}
              onZwgChange={(v) => update("zwg_amount", v)}
              onCodeChange={(c) => setForm((f) => ({ ...f, code: String(c) }))}
              reference={`${bank} ${form.account_name || form.account_number || ""}`.trim()}
            />
          </div>

          {/* Status */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Status *</Label>
              <Select
                value={form.status}
                onValueChange={(v) => update("status", v as PaymentStatus)}
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

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              rows={4}
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              maxLength={1000}
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : "Save Transaction"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
