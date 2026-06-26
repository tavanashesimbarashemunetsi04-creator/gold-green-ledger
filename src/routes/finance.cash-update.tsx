import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { addFinanceCash } from "@/lib/finance-ledger.functions";

export const Route = createFileRoute("/finance/cash-update")({ component: FinanceCashUpdatePage });

const CATEGORY_LABEL: Record<string, string> = {
  cash_update: "Cash update",
  opening_finance_float: "Opening finance float",
  float_issued_to_teller: "Float issued to teller",
  float_received_from_teller: "Float received from teller",
  adjustment: "Adjustment",
  self_float_legacy: "Self-float (legacy)",
};

type FinanceTx = {
  id: string;
  user_id: string;
  kind: "inflow" | "outflow";
  category: string;
  amount: number;
  currency: string;
  reference: string | null;
  notes: string | null;
  created_at: string;
};

function FinanceCashUpdatePage() {
  const { loading, isAdmin, isFinanceManager, user } = useAuth();
  const addCash = useServerFn(addFinanceCash);

  const [balance, setBalance] = useState(0);
  const [rows, setRows] = useState<FinanceTx[]>([]);
  const [now, setNow] = useState(new Date());

  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const [bal, tx] = await Promise.all([
      supabase.from("finance_balances" as never).select("balance").eq("user_id", user.id).maybeSingle(),
      supabase.from("finance_transactions" as never).select("*").eq("user_id", user.id)
        .order("created_at", { ascending: false }).limit(100),
    ]);
    setBalance(Number((bal.data as { balance?: number } | null)?.balance ?? 0));
    setRows((tx.data ?? []) as unknown as FinanceTx[]);
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const ch = supabase.channel("finance_cash_update")
      .on("postgres_changes", { event: "*", schema: "public", table: "finance_transactions" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  if (loading) return null;
  if (!isAdmin && !isFinanceManager) return <Navigate to="/" />;

  const clearForm = () => { setAmount(""); setReason(""); setNotes(""); };

  const submit = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    if (!reason.trim()) return toast.error("Reason / description is required");
    setSubmitting(true);
    try {
      await addCash({ data: { amount: amt, reference: reason.trim(), notes: notes.trim() || undefined } });
      toast.success(`Finance cash increased by $${amt.toFixed(2)}`);
      clearForm();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setSubmitting(false); }
  };

  const todayTotal = rows
    .filter(r => new Date(r.created_at).toDateString() === new Date().toDateString() && r.kind === "inflow")
    .reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div className="space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-semibold">Cash Update</h1>
        <p className="text-sm text-muted-foreground">
          Increase the Finance Manager's available finance cash. This does not affect any teller balance.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Finance cash balance</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-semibold">${balance.toFixed(2)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Added today</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-semibold">${todayTotal.toFixed(2)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Entries logged</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-semibold">{rows.length}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add Float to Finance Cash</CardTitle>
          <CardDescription>Use this when you physically receive additional cash into the finance till.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input value={now.toLocaleDateString()} readOnly disabled />
            </div>
            <div className="space-y-2">
              <Label>Time</Label>
              <Input value={now.toLocaleTimeString()} readOnly disabled />
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Input value="USD" readOnly disabled />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Amount <span className="text-destructive">*</span></Label>
              <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label>Added by</Label>
              <Input value={user?.email ?? ""} readOnly disabled />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Reason / Description <span className="text-destructive">*</span></Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Cash received from head office" />
          </div>
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <div className="flex gap-2">
            <Button onClick={submit} disabled={submitting}>{submitting ? "Adding..." : "Add Float"}</Button>
            <Button variant="outline" onClick={clearForm} disabled={submitting}>Clear Form</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Finance ledger history</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date &amp; Time</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Reference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No finance ledger entries yet</TableCell></TableRow>
              )}
              {rows.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell className="text-xs">{CATEGORY_LABEL[r.category] || r.category}</TableCell>
                  <TableCell className={`text-xs font-medium ${r.kind === "inflow" ? "text-emerald-600" : "text-destructive"}`}>
                    {r.kind === "inflow" ? "+ in" : "− out"}
                  </TableCell>
                  <TableCell className="text-right font-medium">${Number(r.amount).toFixed(2)}</TableCell>
                  <TableCell className="text-xs">{r.reference || r.notes || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
