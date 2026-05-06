import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown, Loader2 } from "lucide-react";

export const Route = createFileRoute("/end-day")({
  component: EndDayPage,
});

type AnyRow = Record<string, any>;

function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function amt(r: AnyRow): number {
  const v = r.usd_amount ?? r.amount ?? 0;
  return Number(v) || 0;
}

function EndDayPage() {
  const [date, setDate] = useState(todayStr());
  const [loading, setLoading] = useState(false);
  const [payments, setPayments] = useState<AnyRow[]>([]);
  const [swipes, setSwipes] = useState<AnyRow[]>([]);
  const [advances, setAdvances] = useState<AnyRow[]>([]);
  const [internalIn, setInternalIn] = useState<AnyRow[]>([]);
  const [internalOut, setInternalOut] = useState<AnyRow[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [p, s, a, ii, io] = await Promise.all([
        supabase.from("payments").select("*").eq("date", date).eq("status", "successful"),
        supabase.from("cash_swipes").select("*").eq("date", date).eq("status", "successful").eq("transaction_type", "withdrawal"),
        supabase.from("cash_advance").select("*").eq("date", date).eq("status", "successful"),
        supabase.from("internal_transactions").select("*").eq("date", date).eq("status", "approved").eq("request_type", "inflow"),
        supabase.from("internal_transactions").select("*").eq("date", date).eq("status", "approved").eq("request_type", "outflow"),
      ]);
      setPayments(p.data ?? []);
      setSwipes(s.data ?? []);
      setAdvances(a.data ?? []);
      setInternalIn(ii.data ?? []);
      setInternalOut(io.data ?? []);
      setLoading(false);
    };
    load();
  }, [date]);

  const sum = (rows: AnyRow[]) => rows.reduce((acc, r) => acc + amt(r), 0);

  const totals = useMemo(() => {
    const inflowsItems = sum(internalIn) + sum(payments);
    const outflowsItems = sum(swipes) + sum(advances) + sum(internalOut);
    return {
      inflows: inflowsItems,
      outflows: outflowsItems,
      balance: inflowsItems - outflowsItems,
    };
  }, [payments, swipes, advances, internalIn, internalOut]);

  const fmt = (n: number) => n.toFixed(2);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">End Day Summary</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Date</label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-44"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* INFLOWS */}
        <Card>
          <CardHeader>
            <CardTitle className="text-emerald-600">Inflows</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <SummaryRow label="Internal Transfers (inflow)" value={fmt(sum(internalIn))} />
            <DrillDown title="Internal Transfer details" rows={internalIn} columns={["date", "amount", "request_type", "status"]} />

            <SummaryRow label="Payments" value={fmt(sum(payments))} />
            <DrillDown title="Payment details" rows={payments} columns={["date", "bank", "payment_type", "usd_amount", "zwg_amount", "status"]} />

            <div className="flex justify-between border-t pt-3 font-semibold">
              <span>Total Inflows</span>
              <span>{fmt(totals.inflows)}</span>
            </div>
          </CardContent>
        </Card>

        {/* OUTFLOWS */}
        <Card>
          <CardHeader>
            <CardTitle className="text-rose-600">Outflows</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <SummaryRow label="Cash Swipes (withdrawal)" value={fmt(sum(swipes))} />
            <DrillDown title="Cash Swipe details" rows={swipes} columns={["date", "name", "transaction_type", "usd_amount", "zwg_amount", "status"]} />

            <SummaryRow label="Cash Advance" value={fmt(sum(advances))} />
            <DrillDown title="Cash Advance details" rows={advances} columns={["date", "name", "transaction_type", "amount", "status"]} />

            <SummaryRow label="Internal Transfers (outflow)" value={fmt(sum(internalOut))} />
            <DrillDown title="Internal Transfer details" rows={internalOut} columns={["date", "amount", "request_type", "status"]} />

            <div className="flex justify-between border-t pt-3 font-semibold">
              <span>Total Outflows</span>
              <span>{fmt(totals.outflows)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex items-center justify-between py-6">
          <span className="text-lg font-semibold">Balance (Inflows − Outflows)</span>
          <span className={`text-2xl font-bold ${totals.balance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            {fmt(totals.balance)}
          </span>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function DrillDown({ title, rows, columns }: { title: string; rows: AnyRow[]; columns: string[] }) {
  const [open, setOpen] = useState(false);
  if (!rows.length) return null;
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
          <ChevronDown className={`h-3 w-3 mr-1 transition-transform ${open ? "rotate-180" : ""}`} />
          {title} ({rows.length})
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="rounded border mt-2">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => (
                  <TableHead key={c} className="text-xs">{c}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  {columns.map((c) => (
                    <TableCell key={c} className="text-xs">{r[c] ?? "—"}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
