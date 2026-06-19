import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDashboardState } from "@/hooks/useDashboardState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Smartphone, Search, Lock, Unlock, Printer, Loader2, CheckCircle2, AlertCircle,
} from "lucide-react";
import {
  getEcocashSummary, openEcocashDay, closeEcocashDay,
  type EcocashSummary, type EcocashLine,
} from "@/lib/ecocash-day.functions";
import { EcocashLockNotice } from "@/components/EcocashLockNotice";

type TxType = "inflow" | "outflow";
type Source = "manual_entry" | "internal_transaction";

type EcocashTx = {
  id: string;
  description: string;
  amount: number;
  transaction_type: TxType;
  inflow_amount: number;
  outflow_amount: number;
  source: Source;
  created_by_label: string | null;
  created_at: string;
};

type FilterKind = "all" | "inflows" | "outflows" | "imported" | "manual";

const fmt = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function deviceString() {
  if (typeof navigator === "undefined") return "server";
  const ua = navigator.userAgent || "";
  const plat = (navigator as any).platform || "web";
  return `${plat} · ${ua.slice(0, 160)}`;
}

const sumUsd = (rows: EcocashLine[]) => rows.reduce((a, r) => a + r.usd, 0);

export function EcocashModule() {
  const { user } = useAuth();
  const dash = useDashboardState(15000);

  // If a STANDARD teller day is open, lock the EcoCash module
  if (dash.state?.session && !dash.state?.ecocashSession) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-8 text-center shadow-sm dark:bg-amber-950/30">
        <Lock className="mx-auto h-10 w-10 text-amber-600" />
        <h2 className="mt-4 text-xl font-semibold">EcoCash is locked</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You currently have a standard teller day open. Close it before opening an EcoCash Day.
        </p>
      </div>
    );
  }

  return <EcocashOperational onRefreshDash={dash.refresh} />;
}

function EcocashOperational({ onRefreshDash }: { onRefreshDash: () => void }) {
  const { user } = useAuth();
  const dash = useDashboardState(15000);

  const summaryFn = useServerFn(getEcocashSummary);
  const openFn = useServerFn(openEcocashDay);
  const closeFn = useServerFn(closeEcocashDay);

  const [summary, setSummary] = useState<EcocashSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSummary = useCallback(async () => {
    setLoading(true);
    try { setSummary(await summaryFn()); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load EcoCash summary"); }
    finally { setLoading(false); }
  }, [summaryFn]);

  useEffect(() => { refreshSummary(); }, [refreshSummary]);

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel("ecocash_module")
      .on("postgres_changes", { event: "*", schema: "public", table: "ecocash_sessions" }, () => { refreshSummary(); onRefreshDash(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "ecocash_transactions" }, () => refreshSummary())
      .on("postgres_changes", { event: "*", schema: "public", table: "user_internal_transactions" }, () => refreshSummary())
      .on("postgres_changes", { event: "*", schema: "public", table: "teller_transfers" }, () => refreshSummary())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refreshSummary, onRefreshDash]);

  const session = summary?.session ?? null;
  const ecocashOpen = !!session;

  return (
    <div className="space-y-6">
      <EcocashStatusCard
        summary={summary}
        loading={loading}
        dashState={dash.state}
        onOpen={async (floatAmount, branchId) => {
          try {
            await openFn({ data: { floatAmount, branchId: branchId ?? null, device: deviceString() } });
            toast.success("EcoCash Day opened");
            await refreshSummary();
            onRefreshDash();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to open EcoCash Day");
          }
        }}
        onClose={async (physicalUsd, expectedUsd, varianceReason) => {
          try {
            await closeFn({ data: { physicalUsd, expectedUsd, varianceReason, device: deviceString() } });
            toast.success("EcoCash Day closed");
            await refreshSummary();
            onRefreshDash();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to close EcoCash Day");
            throw e;
          }
        }}
      />

      {ecocashOpen && summary && (
        <>
          <EcocashBalancingPanel summary={summary} />
          <EcocashInternalTransfersTable summary={summary} />
          <EcocashManualEntries sessionOpen={ecocashOpen} sessionOpenedAt={summary.session?.opened_at ?? null} userId={user?.id ?? null} userEmail={user?.email ?? null} />
        </>
      )}
    </div>
  );
}

/* ---------------- Status Card ---------------- */

function EcocashStatusCard({
  summary, loading, dashState, onOpen, onClose,
}: {
  summary: EcocashSummary | null;
  loading: boolean;
  dashState: ReturnType<typeof useDashboardState>["state"];
  onOpen: (floatAmount: number, branchId: string | null) => Promise<void>;
  onClose: (physicalUsd: number, expectedUsd: number, varianceReason: string | null) => Promise<void>;
}) {
  const session = summary?.session ?? null;
  const pendingFloat = dashState?.pendingFloat ?? null;
  const ready = dashState?.profile?.ready_to_open_day ?? false;
  const branchId = dashState?.profile?.branch_id ?? null;

  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);

  if (loading && !summary) {
    return (
      <Card><CardContent className="flex items-center gap-2 p-6 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading EcoCash status…
      </CardContent></Card>
    );
  }

  if (session) {
    return (
      <>
        <Card className="border-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/20">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5 text-emerald-600" />
                  <CardTitle>EcoCash Teller</CardTitle>
                  <Badge className="bg-emerald-600 hover:bg-emerald-600">OPEN</Badge>
                </div>
                <CardDescription>
                  Session {session.session_code} · Opened{" "}
                  {new Date(session.opened_at).toLocaleString()}
                </CardDescription>
              </div>
              <Button variant="destructive" onClick={() => setCloseDialog(true)}>
                <Lock className="mr-2 h-4 w-4" />
                Close EcoCash Day
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat label="Opening Float (USD)" value={fmt(Number(session.opened_float_amount ?? 0))} />
              <Stat label="Pending Transfers" value={String(summary?.pendingTransfers ?? 0)} />
              <Stat label="Branch" value={summary?.branchName ?? "—"} />
            </div>
            <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              You are currently operating as the EcoCash Teller for today. Other transaction modules are locked until EcoCash Close Day.
            </p>
          </CardContent>
        </Card>

        <CloseEcocashDialog
          open={closeDialog}
          onOpenChange={setCloseDialog}
          summary={summary!}
          onClose={onClose}
        />
      </>
    );
  }

  // Not open
  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-muted-foreground" />
                <CardTitle>EcoCash Day</CardTitle>
                <Badge variant="secondary">CLOSED</Badge>
              </div>
              <CardDescription>
                Open your EcoCash Day to start operating as the EcoCash Teller.
              </CardDescription>
            </div>
            <Button
              onClick={() => setOpenDialog(true)}
              disabled={!ready || !!pendingFloat}
            >
              <Unlock className="mr-2 h-4 w-4" />
              Open EcoCash Day
            </Button>
          </div>
        </CardHeader>
        <CardContent className="text-sm">
          {!ready && pendingFloat && (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              A float assignment of <strong>${fmt(pendingFloat.amount)}</strong> is pending your approval. Approve it from <em>My Float</em> before opening EcoCash Day.
            </p>
          )}
          {!ready && !pendingFloat && (
            <p className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
              No approved float available. Ask Finance to assign a float, then approve it.
            </p>
          )}
          {ready && (
            <p className="text-muted-foreground">
              Float approved. Click <strong>Open EcoCash Day</strong> to start your shift.
            </p>
          )}
        </CardContent>
      </Card>

      <OpenEcocashDialog
        open={openDialog}
        onOpenChange={setOpenDialog}
        suggestedFloat={pendingFloat?.amount ?? 0}
        branchId={branchId}
        onSubmit={onOpen}
      />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function OpenEcocashDialog({
  open, onOpenChange, suggestedFloat, branchId, onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  suggestedFloat: number;
  branchId: string | null;
  onSubmit: (floatAmount: number, branchId: string | null) => Promise<void>;
}) {
  const [amt, setAmt] = useState(String(suggestedFloat || ""));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setAmt(String(suggestedFloat || "")); }, [suggestedFloat, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open EcoCash Day</DialogTitle>
          <DialogDescription>
            Confirm the opening float. You will become the EcoCash Teller for the day.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Opening Float (USD)</Label>
          <Input type="number" step="0.01" min="0" value={amt} onChange={(e) => setAmt(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button
            onClick={async () => {
              const n = Number(amt);
              if (!Number.isFinite(n) || n < 0) return toast.error("Enter a valid float amount");
              setBusy(true);
              try { await onSubmit(n, branchId); onOpenChange(false); }
              finally { setBusy(false); }
            }}
            disabled={busy}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Open Day"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Balancing Panel ---------------- */

function EcocashBalancingPanel({ summary }: { summary: EcocashSummary }) {
  const opening = summary.openingFloat?.usd ?? 0;
  const inTransfers = sumUsd(summary.inflows.transfersReceived);
  const inDeposits = sumUsd(summary.inflows.deposits);
  const inCollections = sumUsd(summary.inflows.collections);
  const outCashOuts = sumUsd(summary.outflows.cashOuts);
  const outTransfers = sumUsd(summary.outflows.transfersSent);
  const outFloatReturns = sumUsd(summary.outflows.floatReturns);

  const totalIn = opening + inTransfers + inDeposits + inCollections;
  const totalOut = outCashOuts + outTransfers + outFloatReturns;
  const expected = totalIn - totalOut;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between print:hidden">
          <div>
            <CardTitle>EcoCash Balancing</CardTitle>
            <CardDescription>Live inflows and outflows for the active session.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Print / Export PDF
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-5 lg:grid-cols-2">
          <Section title="INFLOWS" tone="success">
            <Row label="Opening Float" value={opening} ref={summary.openingFloat?.reference ?? "—"} />
            <Row label="Internal Transfers Received" value={inTransfers} />
            <Row label="EcoCash Deposits (manual)" value={inDeposits} />
            <Row label="EcoCash Collections (imported)" value={inCollections} />
            <TotalRow label="Total Inflows" value={totalIn} tone="success" />
          </Section>
          <Section title="OUTFLOWS" tone="danger">
            <Row label="EcoCash Cash Outs" value={outCashOuts} />
            <Row label="Transfers Sent" value={outTransfers} />
            <Row label="Float Returns" value={outFloatReturns} />
            <TotalRow label="Total Outflows" value={totalOut} tone="danger" />
          </Section>
        </div>

        <div className="rounded-xl border bg-muted/30 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Total Inflows" value={`$${fmt(totalIn)}`} />
            <Stat label="Total Outflows" value={`$${fmt(totalOut)}`} />
            <Stat label="Expected Cash Balance" value={`$${fmt(expected)}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Section({ title, tone, children }: { title: string; tone: "success" | "danger"; children: React.ReactNode }) {
  const border = tone === "success" ? "border-emerald-300" : "border-rose-300";
  return (
    <div className={`rounded-xl border ${border} bg-card p-4`}>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value, ref }: { label: string; value: number; ref?: string }) {
  return (
    <div className="flex items-center justify-between border-b py-1.5 text-sm last:border-0">
      <div>
        <p>{label}</p>
        {ref && <p className="text-[11px] text-muted-foreground">Ref: {ref}</p>}
      </div>
      <span className="font-medium">${fmt(value)}</span>
    </div>
  );
}

function TotalRow({ label, value, tone }: { label: string; value: number; tone: "success" | "danger" }) {
  const color = tone === "success" ? "text-emerald-700" : "text-rose-700";
  return (
    <div className={`flex items-center justify-between pt-3 text-sm font-semibold ${color}`}>
      <span>{label}</span>
      <span>${fmt(value)}</span>
    </div>
  );
}

/* ---------------- Internal Transfers Table ---------------- */

function EcocashInternalTransfersTable({ summary }: { summary: EcocashSummary }) {
  const rows = [
    ...summary.inflows.transfersReceived.map((r) => ({ ...r, kind: "Received" as const })),
    ...summary.outflows.transfersSent.map((r) => ({ ...r, kind: "Sent" as const })),
    ...summary.outflows.floatReturns.map((r) => ({ ...r, kind: "Outflow" as const })),
  ].sort((a, b) => (a.ts > b.ts ? 1 : -1));

  return (
    <Card>
      <CardHeader>
        <CardTitle>EcoCash Internal Transactions</CardTitle>
        <CardDescription>Auto-pulled from approved internal transfers and float movements.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Narration</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">USD</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No internal transactions yet</TableCell></TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{new Date(r.ts).toLocaleTimeString()}</TableCell>
                  <TableCell>{r.narration}</TableCell>
                  <TableCell>
                    <Badge variant={r.kind === "Received" ? "default" : "secondary"}>{r.kind}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.ref}</TableCell>
                  <TableCell className="text-right font-medium">${fmt(r.usd)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------------- Close Day Dialog ---------------- */

function CloseEcocashDialog({
  open, onOpenChange, summary, onClose,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  summary: EcocashSummary;
  onClose: (physicalUsd: number, expectedUsd: number, varianceReason: string | null) => Promise<void>;
}) {
  const opening = summary.openingFloat?.usd ?? 0;
  const totalIn = opening + sumUsd(summary.inflows.transfersReceived) + sumUsd(summary.inflows.deposits) + sumUsd(summary.inflows.collections);
  const totalOut = sumUsd(summary.outflows.cashOuts) + sumUsd(summary.outflows.transfersSent) + sumUsd(summary.outflows.floatReturns);
  const expected = totalIn - totalOut;

  const [physical, setPhysical] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const physN = Number(physical) || 0;
  const variance = physN - expected;
  const balanced = Math.abs(variance) < 0.005;
  const reasonOk = balanced || reason.trim().length > 0;
  const noPending = (summary.pendingTransfers ?? 0) === 0;

  useEffect(() => { if (open) { setPhysical(""); setReason(""); } }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Close EcoCash Day</DialogTitle>
          <DialogDescription>Enter the physical cash count to balance the day.</DialogDescription>
        </DialogHeader>

        {!noPending && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertCircle className="mr-1 inline h-4 w-4" />
            You have {summary.pendingTransfers} pending teller transfer(s). Resolve them before closing.
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Stat label="Expected (USD)" value={`$${fmt(expected)}`} />
          <Stat label="Variance" value={`$${fmt(variance)}`} />
        </div>

        <div className="space-y-2">
          <Label>Physical Cash Count (USD)</Label>
          <Input type="number" step="0.01" min="0" value={physical} onChange={(e) => setPhysical(e.target.value)} />
        </div>

        {!balanced && (
          <div className="space-y-2">
            <Label>Variance Reason *</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain the variance…" />
            <p className="text-xs text-muted-foreground">
              {variance > 0 ? "Over (more cash than expected)." : "Short (less cash than expected)."}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button
            onClick={async () => {
              if (!physical) return toast.error("Enter physical cash count");
              if (!reasonOk) return toast.error("Variance reason required");
              if (!noPending) return toast.error("Resolve pending transfers first");
              setBusy(true);
              try {
                await onClose(physN, Number(expected.toFixed(2)), balanced ? null : reason.trim());
                onOpenChange(false);
              } catch { /* error already toasted */ }
              finally { setBusy(false); }
            }}
            disabled={busy || !physical || !reasonOk || !noPending}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="mr-2 h-4 w-4" />Close Day</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Manual Entries (existing trial balance) ---------------- */

function EcocashManualEntries({
  sessionOpen, sessionOpenedAt, userId, userEmail,
}: { sessionOpen: boolean; sessionOpenedAt: string | null; userId: string | null; userEmail: string | null }) {
  const [rows, setRows] = useState<EcocashTx[]>([]);
  const [loading, setLoading] = useState(false);
  const [txDate, setTxDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [txType, setTxType] = useState<TxType | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState(() => new Date().toISOString().slice(0, 10));
  const [kind, setKind] = useState<FilterKind>("all");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("ecocash_transactions").select("*").order("created_at", { ascending: true });
    setLoading(false);
    if (error) return toast.error("Failed to load EcoCash transactions");
    setRows((data ?? []) as EcocashTx[]);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const ch = supabase.channel("ecocash_manual_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "ecocash_transactions" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!sessionOpen) return toast.error("Open EcoCash Day first");
    const desc = description.trim();
    const amt = Number(amount);
    if (!desc) return toast.error("Description is required");
    if (!txType) return toast.error("Select a transaction type");
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Amount must be greater than 0");

    try {
      setSubmitting(true);
      const { error } = await supabase.from("ecocash_transactions").insert({
        description: desc, amount: amt, transaction_type: txType,
        source: "manual_entry", created_by: userId, created_by_label: userEmail ?? "manual",
        created_at: new Date(txDate).toISOString(),
      });
      if (error) throw error;
      toast.success("Transaction added");
      setDescription(""); setAmount(""); setTxType("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add transaction");
    } finally { setSubmitting(false); }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      // Open-day scoping: only entries since the current EcoCash session opened
      if (!sessionOpenedAt || r.created_at < sessionOpenedAt) return false;
      if (q && !r.description.toLowerCase().includes(q) &&
          !(r.created_by_label ?? "").toLowerCase().includes(q)) return false;
      if (dateFilter && !r.created_at.startsWith(dateFilter)) return false;
      if (kind === "inflows" && r.transaction_type !== "inflow") return false;
      if (kind === "outflows" && r.transaction_type !== "outflow") return false;
      if (kind === "imported" && r.source !== "internal_transaction") return false;
      if (kind === "manual" && r.source !== "manual_entry") return false;
      return true;
    });
  }, [rows, search, dateFilter, kind, sessionOpenedAt]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>Add EcoCash Transaction</CardTitle>
            <CardDescription>Manual inflow or outflow during the open session.</CardDescription>
          </div>
          <Button type="submit" form="ecocash-tx-form" disabled={submitting || !sessionOpen}>
            {submitting ? "Adding..." : "Add Transaction"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <form id="ecocash-tx-form" onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
          <div className="space-y-2">
            <Label>Date *</Label>
            <Input type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} required />
          </div>
          <div className="space-y-2 lg:col-span-2">
            <Label>Description *</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} required />
          </div>
          <div className="space-y-2">
            <Label>Amount *</Label>
            <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Type *</Label>
            <Select value={txType} onValueChange={(v) => setTxType(v as TxType)}>
              <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="inflow">Inflow</SelectItem>
                <SelectItem value="outflow">Outflow</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </form>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
          <Select value={kind} onValueChange={(v) => setKind(v as FilterKind)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="inflows">Inflows</SelectItem>
              <SelectItem value="outflows">Outflows</SelectItem>
              <SelectItem value="imported">Imported</SelectItem>
              <SelectItem value="manual">Manual entries</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => { setSearch(""); setDateFilter(""); setKind("all"); }}>
            Clear filters
          </Button>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Inflows</TableHead>
                <TableHead className="text-right">Outflows</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>}
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No transactions</TableCell></TableRow>
              )}
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{new Date(r.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>{r.description}</TableCell>
                  <TableCell className="text-right">{Number(r.inflow_amount) ? fmt(Number(r.inflow_amount)) : ""}</TableCell>
                  <TableCell className="text-right">{Number(r.outflow_amount) ? fmt(Number(r.outflow_amount)) : ""}</TableCell>
                  <TableCell>
                    {r.source === "internal_transaction" ? <Badge variant="secondary">Imported</Badge> : <Badge>Manual</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// re-export for callers
export { EcocashLockNotice };
