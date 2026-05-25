import { createFileRoute, Link, useSearch, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  getTellerDayDetail,
  saveManagerReview,
  balanceTeller,
  type TellerDayDetail,
} from "@/lib/manager-portal.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Printer, Lock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/manager/teller/$userId")({
  validateSearch: (s: Record<string, unknown>) =>
    z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).parse(s),
  component: TellerDetail,
});

function fmt(n: number) {
  return Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function ts(s: string | null | undefined) {
  return s ? new Date(s).toLocaleString() : "—";
}

function TellerDetail() {
  const { userId } = useParams({ from: "/manager/teller/$userId" });
  const { date } = useSearch({ from: "/manager/teller/$userId" });
  const businessDate = date ?? new Date().toISOString().slice(0, 10);

  const fetcher = useServerFn(getTellerDayDetail);
  const reviewFn = useServerFn(saveManagerReview);
  const balanceFn = useServerFn(balanceTeller);

  const [detail, setDetail] = useState<TellerDayDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewedSet, setReviewedSet] = useState<Set<string>>(new Set());
  const [comments, setComments] = useState("");
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [physical, setPhysical] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const r = await fetcher({ data: { tellerUserId: userId, businessDate } });
      setDetail(r);
      const refs = (r.balancing?.reviewed_tx_refs ?? []) as Array<{ table: string; id: string }>;
      setReviewedSet(new Set(refs.map((x) => `${x.table}:${x.id}`)));
      setComments(r.balancing?.manager_comments ?? "");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel(`mgr_teller_${userId}_${businessDate}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "teller_balancing" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_internal_transactions" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_advance" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_swipes" }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, businessDate]);

  const locked = detail?.balancing?.status === "balanced";

  const toggleTick = (table: string, id: string) => {
    if (locked) return;
    const key = `${table}:${id}`;
    setReviewedSet((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const saveReview = async () => {
    if (locked) return;
    setBusy(true);
    try {
      const refs = Array.from(reviewedSet).map((k) => {
        const [table, id] = k.split(":");
        return { table, id, ticked_at: new Date().toISOString() };
      });
      await reviewFn({
        data: { tellerUserId: userId, businessDate, reviewedRefs: refs, comments },
      });
      toast.success("Review saved");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const submitBalance = async () => {
    if (!detail) return;
    const physNum = Number(physical);
    if (!Number.isFinite(physNum) || physNum < 0) {
      toast.error("Enter a valid physical cash amount");
      return;
    }
    setBusy(true);
    try {
      await reviewFn({
        data: {
          tellerUserId: userId,
          businessDate,
          reviewedRefs: Array.from(reviewedSet).map((k) => {
            const [table, id] = k.split(":");
            return { table, id, ticked_at: new Date().toISOString() };
          }),
          comments,
        },
      }).catch(() => null);
      await balanceFn({
        data: {
          tellerUserId: userId,
          businessDate,
          physicalUsd: physNum,
          expectedUsd: detail.totals.expectedCash,
          comments,
          device: navigator.userAgent,
        },
      });
      toast.success("Teller balanced & locked");
      setBalanceOpen(false);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to balance");
    } finally {
      setBusy(false);
    }
  };

  if (loading || !detail) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>
    );
  }

  const t = detail.teller;

  return (
    <div className="p-8 print:p-0">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <Link to="/manager/balancing" className="mb-2 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> Back to Balancing
          </Link>
          <h1 className="text-2xl font-semibold">{t.full_name ?? t.display_name ?? t.username}</h1>
          <p className="text-sm text-muted-foreground">
            @{t.username ?? "—"} · {t.branch_name ?? "No branch"} · {businessDate}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Print / PDF
          </Button>
        </div>
      </header>

      {locked && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border-2 border-green-500/40 bg-green-500/10 p-4 text-green-800">
          <Lock className="h-5 w-5" />
          <div className="text-sm">
            <p className="font-semibold">Balanced & Locked</p>
            <p className="text-xs">
              Balanced at {ts(detail.balancing!.balanced_at)} · Variance ${fmt(detail.balancing!.variance_usd)}
            </p>
          </div>
        </div>
      )}

      <Tabs defaultValue="end-day" className="w-full">
        <TabsList className="mb-4 flex flex-wrap h-auto">
          <TabsTrigger value="payments">Payments ({detail.payments.length})</TabsTrigger>
          <TabsTrigger value="withdrawals">Withdrawals ({detail.withdrawals.length})</TabsTrigger>
          <TabsTrigger value="internal">Internal ({detail.internal.length})</TabsTrigger>
          <TabsTrigger value="pending">Pending ({detail.pending.length})</TabsTrigger>
          <TabsTrigger value="failed">Failed ({detail.failed.length})</TabsTrigger>
          <TabsTrigger value="changes">Changes & Refunds</TabsTrigger>
          <TabsTrigger value="ecocash">EcoCash ({detail.ecocash.length})</TabsTrigger>
          <TabsTrigger value="end-day">End Day Summary</TabsTrigger>
        </TabsList>

        <TabsContent value="payments">
          <TableCard
            columns={["Customer", "Bank", "Reference", "Amount USD", "Time", "Status"]}
            rows={detail.payments.map((r) => ({
              key: `payments:${r.id}`,
              cells: [
                r.account_number || r.phone_number || "—",
                r.bank ?? "—",
                r.code ?? r.id.slice(0, 8),
                `$${fmt(Number(r.usd_amount ?? 0))}`,
                ts(r.created_at),
                <StatusPill key="s" value={r.status} />,
              ],
            }))}
            reviewedSet={reviewedSet} onToggle={toggleTick} locked={locked} table="payments"
          />
        </TabsContent>

        <TabsContent value="withdrawals">
          <TableCard
            columns={["Customer", "Type", "Reference", "Amount", "Time", "Status"]}
            rows={detail.withdrawals.map((r) => ({
              key: `withdrawals:${r.id}`,
              cells: [
                r.name ?? "—",
                r.transaction_type ?? "—",
                r.code ?? r.id.slice(0, 8),
                `$${fmt(Number(r.amount ?? r.usd_amount ?? 0))}`,
                ts(r.created_at),
                <StatusPill key="s" value={r.status} />,
              ],
            }))}
            reviewedSet={reviewedSet} onToggle={toggleTick} locked={locked} table="withdrawals"
          />
        </TabsContent>

        <TabsContent value="internal">
          <TableCard
            columns={["Narration", "Category", "Direction", "Reference", "Amount USD", "Time"]}
            rows={detail.internal.map((r) => ({
              key: `internal:${r.id}`,
              cells: [
                r.notes || r.reason || r.category || "—",
                r.category ?? "transfer",
                r.kind ?? (r.status === "approved" ? "transfer" : "—"),
                r.reference_code ?? r.id.slice(0, 8),
                `$${fmt(Number(r.amount ?? 0))}`,
                ts(r.created_at),
              ],
            }))}
            reviewedSet={reviewedSet} onToggle={toggleTick} locked={locked} table="internal"
          />
        </TabsContent>

        <TabsContent value="pending">
          <TableCard
            columns={["Kind", "Reference", "Customer/Note", "Amount", "Time"]}
            rows={detail.pending.map((r) => ({
              key: `pending:${r.id}`,
              cells: [
                r._kind,
                r.code ?? r.reference_code ?? r.id.slice(0, 8),
                r.name ?? r.account_number ?? r.notes ?? r.reason ?? "—",
                `$${fmt(Number(r.usd_amount ?? r.amount ?? 0))}`,
                ts(r.created_at),
              ],
            }))}
            reviewedSet={reviewedSet} onToggle={toggleTick} locked={locked} table="pending"
          />
        </TabsContent>

        <TabsContent value="failed">
          <TableCard
            columns={["Kind", "Reference", "Reason", "Amount", "Time"]}
            rows={detail.failed.map((r) => ({
              key: `failed:${r.id}`,
              cells: [
                r._kind,
                r.code ?? r.reference_code ?? r.id.slice(0, 8),
                r.failure_reason ?? r.rejection_reason ?? "—",
                `$${fmt(Number(r.usd_amount ?? r.amount ?? 0))}`,
                ts(r.created_at),
              ],
            }))}
            reviewedSet={reviewedSet} onToggle={toggleTick} locked={locked} table="failed"
          />
        </TabsContent>

        <TabsContent value="changes">
          <TableCard
            columns={["Action", "Table", "Old", "New", "Time"]}
            rows={detail.changes_refunds.map((r) => ({
              key: `audit:${r.id}`,
              cells: [
                r.action,
                r.table_name,
                JSON.stringify(r.old_data ?? {}),
                JSON.stringify(r.new_data ?? {}),
                ts(r.created_at),
              ],
            }))}
            reviewedSet={reviewedSet} onToggle={toggleTick} locked={locked} table="changes"
          />
        </TabsContent>

        <TabsContent value="ecocash">
          <TableCard
            columns={["Narration", "Type", "Amount", "Source", "Time"]}
            rows={detail.ecocash.map((r) => ({
              key: `ecocash:${r.id}`,
              cells: [
                r.description ?? "—",
                r.transaction_type,
                `$${fmt(Number(r.amount ?? 0))}`,
                r.source,
                ts(r.created_at),
              ],
            }))}
            reviewedSet={reviewedSet} onToggle={toggleTick} locked={locked} table="ecocash"
          />
        </TabsContent>

        <TabsContent value="end-day">
          <EndDayPanel
            detail={detail}
            locked={locked}
            comments={comments}
            setComments={setComments}
            onSaveReview={saveReview}
            onOpenBalance={() => {
              setPhysical(detail.totals.expectedCash.toFixed(2));
              setBalanceOpen(true);
            }}
            busy={busy}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={balanceOpen} onOpenChange={setBalanceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Balance for {t.full_name ?? t.username}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <Row label="Expected Cash" value={`$${fmt(detail.totals.expectedCash)}`} />
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Physical Cash Count (USD)</label>
              <Input type="number" step="0.01" value={physical} onChange={(e) => setPhysical(e.target.value)} />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Manager Comments</label>
              <Textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={3} />
            </div>
            <Row label="Variance" value={`$${fmt(Number(physical || 0) - detail.totals.expectedCash)}`} />
            <p className="text-xs text-muted-foreground">
              This will <strong>lock</strong> the teller's day. After balancing, all records become read-only.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBalanceOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submitBalance} disabled={busy}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {busy ? "Balancing…" : "Confirm Balance"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function StatusPill({ value }: { value: string }) {
  const colors: Record<string, string> = {
    successful: "bg-green-100 text-green-700",
    approved: "bg-green-100 text-green-700",
    pending: "bg-amber-100 text-amber-700",
    failed: "bg-red-100 text-red-700",
    declined: "bg-red-100 text-red-700",
    rejected: "bg-red-100 text-red-700",
    cancelled: "bg-gray-100 text-gray-700",
  };
  return (
    <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${colors[value] ?? "bg-muted text-foreground"}`}>
      {value}
    </span>
  );
}

function TableCard({
  columns,
  rows,
  reviewedSet,
  onToggle,
  locked,
  table,
}: {
  columns: string[];
  rows: { key: string; cells: React.ReactNode[] }[];
  reviewedSet: Set<string>;
  onToggle: (table: string, id: string) => void;
  locked: boolean;
  table: string;
}) {
  if (rows.length === 0) {
    return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No records.</CardContent></Card>;
  }
  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="w-10 p-2"></th>
              {columns.map((c) => (
                <th key={c} className="p-2 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const id = r.key.split(":")[1];
              const checked = reviewedSet.has(`${table}:${id}`);
              return (
                <tr key={r.key} className="border-t hover:bg-muted/30">
                  <td className="p-2">
                    <Checkbox
                      checked={checked}
                      disabled={locked}
                      onCheckedChange={() => onToggle(table, id)}
                    />
                  </td>
                  {r.cells.map((c, i) => (
                    <td key={i} className="p-2 align-top">
                      {c}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function EndDayPanel({
  detail,
  locked,
  comments,
  setComments,
  onSaveReview,
  onOpenBalance,
  busy,
}: {
  detail: TellerDayDetail;
  locked: boolean;
  comments: string;
  setComments: (s: string) => void;
  onSaveReview: () => void;
  onOpenBalance: () => void;
  busy: boolean;
}) {
  const t = detail.totals;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        <SummaryCard title="Inflows">
          <SumRow label="Opening Float" value={t.openingFloat} />
          <SumRow label="Payments" value={t.payments} />
          <SumRow label="Internal Transfers Received" value={t.transfersIn} />
          <SumRow label="EcoCash Collections" value={t.ecocashIn} />
          <SumRow label="Total Inflows" value={t.totalInflows} bold />
        </SummaryCard>
        <SummaryCard title="Outflows">
          <SumRow label="Cash Advance" value={t.cashAdvance} />
          <SumRow label="Cash Swipes (Withdrawals)" value={t.cashSwipes} />
          <SumRow label="Transfers Sent" value={t.transfersOut} />
          <SumRow label="Float Returns" value={t.floatReturns} />
          <SumRow label="EcoCash Cash Outs" value={t.ecocashOut} />
          <SumRow label="Total Outflows" value={t.totalOutflows} bold />
        </SummaryCard>
        <SummaryCard title="Manager Comments">
          <Textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Add notes about this teller's day…"
            rows={4}
            disabled={locked}
          />
        </SummaryCard>
      </div>

      <div className="space-y-4">
        <Card className="sticky top-4 border-2 border-primary/40">
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Balance Summary</h3>
            <div className="mt-3 space-y-2 text-sm">
              <Row label="Total Inflows" value={`$${fmt(t.totalInflows)}`} />
              <Row label="Total Outflows" value={`$${fmt(t.totalOutflows)}`} />
              <Row label="Expected Cash" value={`$${fmt(t.expectedCash)}`} />
              {detail.balancing && (
                <>
                  <Row label="Physical Count" value={`$${fmt(Number(detail.balancing.physical_usd ?? 0))}`} />
                  <Row label="Variance" value={`$${fmt(Number(detail.balancing.variance_usd ?? 0))}`} />
                </>
              )}
            </div>

            {locked ? (
              <div className="mt-4 rounded-lg border border-green-500/40 bg-green-500/10 p-3 text-xs text-green-800">
                <p className="font-semibold">BALANCED</p>
                <p>Balanced at: {ts(detail.balancing!.balanced_at)}</p>
                <p>Branch: {detail.teller.branch_name ?? "—"}</p>
                {detail.balancing?.manager_comments && (
                  <p className="mt-2">"{detail.balancing.manager_comments}"</p>
                )}
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                <Button variant="outline" className="w-full" onClick={onSaveReview} disabled={busy}>
                  Save Review
                </Button>
                <Button className="w-full" onClick={onOpenBalance} disabled={busy}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> BALANCE
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
        <div className="space-y-2 text-sm">{children}</div>
      </CardContent>
    </Card>
  );
}

function SumRow({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between border-b py-1.5 ${bold ? "border-foreground/20 pt-2 font-semibold" : "border-border"}`}>
      <span className={bold ? "" : "text-muted-foreground"}>{label}</span>
      <span>${fmt(value)}</span>
    </div>
  );
}
