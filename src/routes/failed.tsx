import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, Download, Printer, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/failed")({
  component: FailedPage,
});

type Source = "payments" | "cash_swipes" | "cash_advance" | "internal_transactions";

const FAILURE_REASONS = [
  "Insufficient funds",
  "Teller declined",
  "Verification failed",
  "Duplicate transaction",
  "System timeout",
  "Fraud suspicion",
  "Approval mismatch",
  "Network error",
];

const FAILED_STATUSES = ["failed", "declined", "rejected"];
const HIGH_VALUE_USD = 1000;

type Row = {
  source: Source;
  id: string;
  date: string;
  created_at: string;
  status: string;
  name?: string | null;
  bank?: string | null;
  branch?: string | null;
  transaction_type?: string | null;
  payment_type?: string | null;
  request_type?: string | null;
  usd_amount?: number | null;
  zwg_amount?: number | null;
  amount?: number | null;
  account_number?: string | null;
  phone_number?: string | null;
  card_last4?: string | null;
  id_number?: string | null;
  code?: string | null;
  category?: string | null;
  notes?: string | null;
  failure_reason?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  initiating_teller_id?: string | null;
  target_teller_id?: string | null;
};

const sourceLabels: Record<Source, string> = {
  payments: "Payment",
  cash_swipes: "Cash Swipe",
  cash_advance: "Cash Advance",
  internal_transactions: "Internal Tx",
};

function getAmount(r: Row): { value: number; currency: string } {
  if (r.usd_amount != null) return { value: Number(r.usd_amount), currency: "USD" };
  if (r.zwg_amount != null) return { value: Number(r.zwg_amount), currency: "ZWG" };
  if (r.amount != null) return { value: Number(r.amount), currency: "USD" };
  return { value: 0, currency: "—" };
}

function isFraud(r: Row) {
  return (r.failure_reason ?? "").toLowerCase().includes("fraud");
}

const PAGE_SIZE = 25;

function FailedPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [tellers, setTellers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tellerFilter, setTellerFilter] = useState<string>("all");
  const [reasonFilter, setReasonFilter] = useState<string>("all");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setLoading(true);

    const tellersRes = await supabase.from("tellers").select("id, username");
    const tellersMap: Record<string, string> = {};
    (tellersRes.data ?? []).forEach((t: any) => (tellersMap[t.id] = t.username));
    setTellers(tellersMap);

    const sources: Source[] = ["payments", "cash_swipes", "cash_advance", "internal_transactions"];
    const results = await Promise.all(
      sources.map((s) =>
        supabase.from(s).select("*").in("status", FAILED_STATUSES as any).order("created_at", { ascending: false }),
      ),
    );
    const merged: Row[] = [];
    results.forEach((res, i) => {
      if (res.error) {
        toast.error(`${sources[i]}: ${res.error.message}`);
        return;
      }
      (res.data ?? []).forEach((d: any) => merged.push({ ...d, source: sources[i] }));
    });
    merged.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    setRows(merged);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("failed-tx")
      .on("postgres_changes", { event: "*", schema: "public" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const tellerName = (id?: string | null) => (id ? tellers[id] ?? id.slice(0, 8) : "—");

  const branches = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.branch && set.add(r.branch));
    return Array.from(set);
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.id.toLowerCase().includes(q) && !(r.name ?? "").toLowerCase().includes(q)) return false;
      if (tellerFilter !== "all" && r.initiating_teller_id !== tellerFilter && r.target_teller_id !== tellerFilter) return false;
      if (reasonFilter !== "all" && (r.failure_reason ?? "") !== reasonFilter) return false;
      if (branchFilter !== "all" && (r.branch ?? "") !== branchFilter) return false;
      if (fromDate && r.date < fromDate) return false;
      if (toDate && r.date > toDate) return false;
      return true;
    });
  }, [rows, search, tellerFilter, reasonFilter, branchFilter, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, tellerFilter, reasonFilter, branchFilter, fromDate, toDate]);

  const exportCSV = () => {
    const headers = [
      "Transaction ID","Customer Name","Customer Number","Amount","Currency",
      "Transaction Type","Teller","Branch","Date","Status","Failure Reason","Notes",
    ];
    const rowsCsv = filtered.map((r) => {
      const a = getAmount(r);
      return [
        r.id, r.name ?? "", r.phone_number ?? r.account_number ?? "", a.value, a.currency,
        r.transaction_type ?? r.payment_type ?? r.request_type ?? sourceLabels[r.source],
        tellerName(r.initiating_teller_id) || "—", r.branch ?? "—",
        new Date(r.created_at).toISOString(), r.status, r.failure_reason ?? "", r.notes ?? "",
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
    });
    const blob = new Blob([[headers.join(","), ...rowsCsv].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `failed-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportXLS = () => {
    // Minimal Excel-compatible HTML export (.xls) — no extra dependency.
    const head = ["Transaction ID","Customer Name","Customer Number","Amount","Currency","Transaction Type","Teller","Branch","Date","Status","Failure Reason","Notes"];
    const body = filtered.map((r) => {
      const a = getAmount(r);
      return `<tr>${[
        r.id, r.name ?? "", r.phone_number ?? r.account_number ?? "", a.value, a.currency,
        r.transaction_type ?? r.payment_type ?? r.request_type ?? sourceLabels[r.source],
        tellerName(r.initiating_teller_id) || "—", r.branch ?? "—",
        new Date(r.created_at).toLocaleString(), r.status, r.failure_reason ?? "", r.notes ?? "",
      ].map((v) => `<td>${String(v).replace(/</g, "&lt;")}</td>`).join("")}</tr>`;
    }).join("");
    const html = `<table><thead><tr>${head.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>`;
    const blob = new Blob([html], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `failed-transactions-${new Date().toISOString().slice(0, 10)}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printReport = () => window.print();

  const updateReason = async (row: Row, reason: string) => {
    const { error } = await (supabase.from(row.source) as any)
      .update({ failure_reason: reason })
      .eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Failure reason updated");
    setRows((prev) => prev.map((r) => (r.id === row.id && r.source === row.source ? { ...r, failure_reason: reason } : r)));
    if (selected && selected.id === row.id) setSelected({ ...selected, failure_reason: reason });
  };

  return (
    <main className="p-4 md:p-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Failed Transactions</h1>
          <p className="text-sm text-muted-foreground">
            All failed, declined, and rejected transactions. Read-only audit view.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={exportCSV}><Download className="h-4 w-4" /> CSV</Button>
          <Button size="sm" variant="outline" onClick={exportXLS}><Download className="h-4 w-4" /> Excel</Button>
          <Button size="sm" variant="outline" onClick={printReport}><Printer className="h-4 w-4" /> Print</Button>
          <Button size="sm" variant="outline" onClick={load}>Refresh</Button>
        </div>
      </header>

      <div className="mb-4 grid gap-3 md:grid-cols-2 lg:grid-cols-6">
        <div className="relative lg:col-span-2">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search ID or customer name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={tellerFilter} onValueChange={setTellerFilter}>
          <SelectTrigger><SelectValue placeholder="Teller" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tellers</SelectItem>
            {Object.entries(tellers).map(([id, name]) => (
              <SelectItem key={id} value={id}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={reasonFilter} onValueChange={setReasonFilter}>
          <SelectTrigger><SelectValue placeholder="Failure reason" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All reasons</SelectItem>
            {FAILURE_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={branchFilter} onValueChange={setBranchFilter}>
          <SelectTrigger><SelectValue placeholder="Branch" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All branches</SelectItem>
            {branches.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No failed transactions.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transaction ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Number</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Teller</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((r) => {
                  const a = getAmount(r);
                  const highValue = a.currency === "USD" && a.value >= HIGH_VALUE_USD;
                  return (
                    <TableRow
                      key={`${r.source}-${r.id}`}
                      className={`cursor-pointer ${highValue ? "bg-destructive/5" : ""}`}
                      onClick={() => setSelected(r)}
                    >
                      <TableCell className="font-mono text-xs">{r.id.slice(0, 8)}…</TableCell>
                      <TableCell>
                        {r.name ?? "—"}
                        {isFraud(r) && (
                          <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-destructive" aria-label="Fraud" />
                        )}
                      </TableCell>
                      <TableCell>{r.phone_number ?? r.account_number ?? "—"}</TableCell>
                      <TableCell className={highValue ? "font-semibold text-destructive" : ""}>
                        {a.currency} {a.value.toFixed(2)}
                      </TableCell>
                      <TableCell>{r.transaction_type ?? r.payment_type ?? r.request_type ?? sourceLabels[r.source]}</TableCell>
                      <TableCell>{tellerName(r.initiating_teller_id)}</TableCell>
                      <TableCell>{r.branch ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="destructive" className="capitalize">{r.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{r.failure_reason ?? "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {filtered.length} record{filtered.length === 1 ? "" : "s"} • Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  Transaction details
                  <Badge variant="destructive" className="capitalize">{selected.status}</Badge>
                  {isFraud(selected) && (
                    <Badge variant="outline" className="border-destructive text-destructive">
                      <AlertTriangle className="mr-1 h-3 w-3" /> Fraud
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription className="font-mono text-xs">{selected.id}</DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field label="Source" value={sourceLabels[selected.source]} />
                <Field label="Customer" value={selected.name ?? "—"} />
                <Field label="Number" value={selected.phone_number ?? selected.account_number ?? "—"} />
                <Field label="Amount" value={`${getAmount(selected).currency} ${getAmount(selected).value.toFixed(2)}`} />
                <Field label="Type" value={selected.transaction_type ?? selected.payment_type ?? selected.request_type ?? "—"} />
                <Field label="Branch" value={selected.branch ?? "—"} />
                <Field label="Initiating teller" value={tellerName(selected.initiating_teller_id)} />
                <Field label="Target teller" value={tellerName(selected.target_teller_id)} />
                <Field label="Created" value={new Date(selected.created_at).toLocaleString()} />
                <Field label="Decided at" value={selected.approved_at ? new Date(selected.approved_at).toLocaleString() : "—"} />
                <Field label="Decided by" value={selected.approved_by ?? "—"} />
                <Field label="Code" value={selected.code ?? "—"} />
              </div>

              <div className="mt-2 space-y-2">
                <label className="text-xs font-medium uppercase text-muted-foreground">Failure reason</label>
                <Select value={selected.failure_reason ?? ""} onValueChange={(v) => updateReason(selected, v)}>
                  <SelectTrigger><SelectValue placeholder="Set failure reason…" /></SelectTrigger>
                  <SelectContent>
                    {FAILURE_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {selected.notes && (
                <div className="mt-2">
                  <div className="text-xs font-medium uppercase text-muted-foreground">Notes</div>
                  <p className="rounded-md border border-border bg-muted/30 p-2 text-sm">{selected.notes}</p>
                </div>
              )}

              <div className="mt-4 rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                <div className="mb-1 font-semibold text-foreground">Timeline</div>
                <ul className="space-y-1">
                  <li>Created — {new Date(selected.created_at).toLocaleString()}</li>
                  {selected.approved_at && (
                    <li>
                      Marked {selected.status} — {new Date(selected.approved_at).toLocaleString()}
                      {selected.approved_by ? ` by ${selected.approved_by}` : ""}
                    </li>
                  )}
                </ul>
              </div>

              <p className="mt-2 text-xs text-muted-foreground">
                This transaction is read-only. Core fields cannot be modified after failure.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
      <div>{value}</div>
    </div>
  );
}
