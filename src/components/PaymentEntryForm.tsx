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
  notes: string;
  status: PaymentStatus;
};

export type PaymentStatus = "successful" | "pending" | "failed";
const STATUSES: PaymentStatus[] = ["successful", "pending", "failed"];

const PAYMENT_TYPES = ["Cash", "Cash USD", "Swipe", "Cash ZWG"] as const;
const CATEGORIES = [
  "Zesa",
  "COH",
  "School fees",
  "DSTV",
  "Deposits",
  "Insurances",
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
      category: form.category,
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
            <div className="space-y-2">
              <Label htmlFor="code">Code</Label>
              <Input
                id="code"
                value={form.code}
                onChange={(e) => update("code", e.target.value)}
                maxLength={50}
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
            </div>
          </div>

          {/* Amounts */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="usd_amount">USD Amount</Label>
              <Input
                id="usd_amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={form.usd_amount}
                onChange={(e) => update("usd_amount", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zwg_amount">ZWG Amount</Label>
              <Input
                id="zwg_amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={form.zwg_amount}
                onChange={(e) => update("zwg_amount", e.target.value)}
              />
            </div>
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
