import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  Calculator,
  CheckCircle2,
  Loader2,
  Lock,
  Printer,
  Scale,
  Search,
  TriangleAlert,
  Wallet,
} from "lucide-react";

import {
  getEndDaySummary,
  closeDayWithBalancing,
  type EndDaySummary,
  type EodLine,
} from "@/lib/teller-day.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/end-day")({
  component: EndDayPage,
});

/* ------------------------------ helpers ------------------------------ */

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function deviceString() {
  if (typeof navigator === "undefined") return "server";
  const ua = navigator.userAgent || "";
  const plat = (navigator as any).platform || "web";
  return `${plat} · ${ua.slice(0, 160)}`;
}
const sumUsd = (rows: EodLine[]) => rows.reduce((a, r) => a + r.usd, 0);
const sumZwg = (rows: EodLine[]) => rows.reduce((a, r) => a + r.zwg, 0);

/* ------------------------------ page ------------------------------ */

function EndDayPage() {
  const navigate = useNavigate();
  const fetcher = useServerFn(getEndDaySummary);
  const [data, setData] = useState<EndDaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [physicalUsd, setPhysicalUsd] = useState("");
  const [physicalZwg, setPhysicalZwg] = useState("");
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await fetcher();
      setData(r);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load summary");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = useMemo(() => {
    if (!data) {
      return {
        inflowUsd: 0, inflowZwg: 0, outflowUsd: 0, outflowZwg: 0,
        expectedUsd: 0, expectedZwg: 0,
        paymentBanks: {} as Record<string, { usd: number; zwg: number }>,
        swipesUsd: 0, swipesZwg: 0, advUsd: 0, advZwg: 0,
        intInUsd: 0, intInZwg: 0, intOutUsd: 0, intOutZwg: 0,
        openingUsd: 0, openingZwg: 0,
        payAllUsd: 0, payAllZwg: 0,
      };
    }
    const openingUsd = data.openingFloat?.usd ?? 0;
    const openingZwg = data.openingFloat?.zwg ?? 0;
    const intInUsd = sumUsd(data.inflows.internal);
    const intInZwg = sumZwg(data.inflows.internal);
    const paymentBanks: Record<string, { usd: number; zwg: number }> = {};
    let payAllUsd = 0, payAllZwg = 0;
    Object.entries(data.inflows.paymentsByBank).forEach(([k, rows]) => {
      const u = sumUsd(rows), z = sumZwg(rows);
      paymentBanks[k] = { usd: u, zwg: z };
      payAllUsd += u; payAllZwg += z;
    });
    const swipesUsd = sumUsd(data.outflows.swipes);
    const swipesZwg = sumZwg(data.outflows.swipes);
    const advUsd = sumUsd(data.outflows.advances);
    const advZwg = sumZwg(data.outflows.advances);
    const intOutUsd = sumUsd(data.outflows.internal);
    const intOutZwg = sumZwg(data.outflows.internal);
    const inflowUsd = openingUsd + intInUsd + payAllUsd;
    const inflowZwg = openingZwg + intInZwg + payAllZwg;
    const outflowUsd = swipesUsd + advUsd + intOutUsd;
    const outflowZwg = swipesZwg + advZwg + intOutZwg;
    return {
      inflowUsd, inflowZwg, outflowUsd, outflowZwg,
      expectedUsd: inflowUsd - outflowUsd,
      expectedZwg: inflowZwg - outflowZwg,
      paymentBanks, swipesUsd, swipesZwg, advUsd, advZwg,
      intInUsd, intInZwg, intOutUsd, intOutZwg,
      openingUsd, openingZwg, payAllUsd, payAllZwg,
    };
  }, [data]);

  const phyUsd = Number(physicalUsd) || 0;
  const phyZwg = Number(physicalZwg) || 0;
  const varUsd = phyUsd - totals.expectedUsd;
  const varZwg = phyZwg - totals.expectedZwg;
  const balanced = Math.abs(varUsd) < 0.005 && Math.abs(varZwg) < 0.005;
  const varianceExists = !balanced;
  const physicalEntered = physicalUsd.trim() !== "" && physicalZwg.trim() !== "";
  const reasonOk = !varianceExists || reason.trim().length > 0;

  const closeFn = useServerFn(closeDayWithBalancing);
  const onClose = async () => {
    setClosing(true);
    try {
      await closeFn({
        data: {
          physicalUsd: phyUsd,
          physicalZwg: phyZwg,
          expectedUsd: Number(totals.expectedUsd.toFixed(2)),
          expectedZwg: Number(totals.expectedZwg.toFixed(2)),
          varianceReason: varianceExists ? reason.trim() : null,
          device: deviceString(),
        },
      });
      toast.success("Operational day closed");
      setConfirmOpen(false);
      navigate({ to: "/" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to close day");
    } finally {
      setClosing(false);
    }
  };

  const session = data?.session ?? null;

  /* No session → show empty state */
  if (!loading && !session) {
    return (
      <main className="mx-auto max-w-5xl space-y-6 p-6">
        <div className="rounded-2xl border border-border bg-card p-10 text-center shadow-[var(--shadow-soft)]">
          <Lock className="mx-auto h-10 w-10 text-muted-foreground" />
          <h1 className="mt-4 text-2xl font-semibold">No operational day open</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Open your day from the dashboard before generating an End Day Summary.
          </p>
          <Button className="mt-6" onClick={() => navigate({ to: "/" })}>
            Back to dashboard
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-6 print:p-0">
      {/* Header */}
      <header
        className="rounded-3xl border border-border p-5 shadow-[var(--shadow-elegant)] md:p-7 print:shadow-none print:border-0"
        style={{ background: "var(--gradient-hero)" }}
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="text-white">
            <p className="text-xs font-medium uppercase tracking-[0.25em] text-[var(--gold)]">
              End Day Summary & Balancing
            </p>
            <h1 className="mt-1 text-2xl font-bold md:text-3xl">
              {data?.username ?? "Teller"} · {data?.branchName ?? "—"}
            </h1>
            <p className="mt-0.5 text-xs text-white/80">
              Session {session?.session_code} · Opened{" "}
              {session ? new Date(session.opened_at).toLocaleString() : "—"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" /> Print / Export PDF
            </Button>
            <Button size="sm" onClick={refresh} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
            </Button>
          </div>
        </div>
      </header>

      {/* Search */}
      <div className="relative max-w-md print:hidden">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search transactions (narration, reference, type)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* INFLOWS */}
        <section className="rounded-2xl border border-success/30 bg-card shadow-[var(--shadow-soft)]">
          <SectionHeader
            title="INFLOWS"
            icon={ArrowDownToLine}
            tone="success"
            totalUsd={totals.inflowUsd}
            totalZwg={totals.inflowZwg}
          />
          <div className="space-y-5 p-4 md:p-5">
            {/* Opening Float */}
            <Subsection title="Opening Float" subtitle="From approved float" tone="muted">
              <LineTable
                rows={[
                  data?.openingFloat
                    ? {
                        id: "opening-float",
                        ts: session?.opened_at ?? "",
                        narration: "Opening Float",
                        type: "opening_float",
                        ref: data.openingFloat.reference ?? "—",
                        usd: data.openingFloat.usd,
                        zwg: data.openingFloat.zwg,
                      }
                    : null,
                ].filter(Boolean) as EodLine[]}
                search={search}
                showTotal
              />
            </Subsection>

            <Subsection title="Internal Transactions" subtitle="Inflow">
              <LineTable rows={data?.inflows.internal ?? []} search={search} showTotal emptyText="No internal inflows" />
            </Subsection>

            {(["ZB", "CBZ", "BANCABC", "AFC"] as const).map((bank) => (
              <Subsection key={bank} title={`${bank} Payments`} subtitle="Successful">
                <LineTable
                  rows={data?.inflows.paymentsByBank[bank] ?? []}
                  search={search}
                  showTotal
                  emptyText={`No ${bank} payments`}
                />
              </Subsection>
            ))}

            <GrandTotal label="Total Inflows" usd={totals.inflowUsd} zwg={totals.inflowZwg} tone="success" />
          </div>
        </section>

        {/* OUTFLOWS */}
        <section className="rounded-2xl border border-destructive/30 bg-card shadow-[var(--shadow-soft)]">
          <SectionHeader
            title="OUTFLOWS"
            icon={ArrowUpFromLine}
            tone="destructive"
            totalUsd={totals.outflowUsd}
            totalZwg={totals.outflowZwg}
          />
          <div className="space-y-5 p-4 md:p-5">
            <Subsection title="Cash Swipes" subtitle="Withdrawals">
              <LineTable rows={data?.outflows.swipes ?? []} search={search} showTotal emptyText="No swipes" />
            </Subsection>

            <Subsection title="Cash Advance">
              <LineTable rows={data?.outflows.advances ?? []} search={search} showTotal emptyText="No cash advances" />
            </Subsection>

            <Subsection title="Internal Transactions" subtitle="Outflow">
              <LineTable rows={data?.outflows.internal ?? []} search={search} showTotal emptyText="No internal outflows" />
            </Subsection>

            <GrandTotal label="Total Outflows" usd={totals.outflowUsd} zwg={totals.outflowZwg} tone="destructive" />
          </div>
        </section>
      </div>

      {/* Cash Balance Summary */}
      <section className="rounded-2xl border border-primary/30 bg-card p-5 shadow-[var(--shadow-soft)] md:p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--gradient-primary)] text-primary-foreground">
            <Calculator className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Cash Balance Summary</h2>
            <p className="text-xs text-muted-foreground">Expected = Total Inflows − Total Outflows</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <BalanceCell currency="USD" expected={totals.expectedUsd} />
          <BalanceCell currency="ZWG" expected={totals.expectedZwg} />
        </div>
      </section>

      {/* Physical Cash Count + Variance */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)] md:p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--gradient-gold)] text-gold-foreground">
            <Scale className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Physical Cash Count</h2>
            <p className="text-xs text-muted-foreground">Enter counted cash to compute variance.</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <PhysicalInput
            currency="USD"
            value={physicalUsd}
            onChange={setPhysicalUsd}
            expected={totals.expectedUsd}
            variance={varUsd}
          />
          <PhysicalInput
            currency="ZWG"
            value={physicalZwg}
            onChange={setPhysicalZwg}
            expected={totals.expectedZwg}
            variance={varZwg}
          />
        </div>

        {varianceExists && physicalEntered && (
          <div className="mt-5">
            <Label htmlFor="reason" className="flex items-center gap-2 text-sm font-medium">
              <TriangleAlert className="h-4 w-4 text-warning" />
              Variance reason (required)
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain the cause of the variance — cash misplacement, miscount, system error, etc."
              rows={3}
              className="mt-2"
            />
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-4 print:hidden">
          <div className="text-xs text-muted-foreground">
            All balancing actions are permanently logged with timestamp, device, and session ID.
          </div>
          <Button
            variant="destructive"
            disabled={!physicalEntered || !reasonOk}
            onClick={() => setConfirmOpen(true)}
          >
            <Lock className="mr-2 h-4 w-4" /> Confirm & Close Day
          </Button>
        </div>
      </section>

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close operational day?</DialogTitle>
            <DialogDescription>
              This will lock all transaction modules until a new day is opened with finance-approved float. Balancing
              records and variance details are permanently stored.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-lg border border-border bg-muted/50 p-3 text-sm">
            <Row k="Expected USD" v={fmt(totals.expectedUsd)} />
            <Row k="Physical USD" v={fmt(phyUsd)} />
            <Row k="Variance USD" v={fmt(varUsd)} tone={balanced ? "ok" : varUsd > 0 ? "warn" : "err"} />
            <div className="h-px bg-border" />
            <Row k="Expected ZWG" v={fmt(totals.expectedZwg)} />
            <Row k="Physical ZWG" v={fmt(phyZwg)} />
            <Row k="Variance ZWG" v={fmt(varZwg)} tone={balanced ? "ok" : varZwg > 0 ? "warn" : "err"} />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={closing} onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={closing} onClick={onClose}>
              {closing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Yes, Close Day"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

/* ------------------------------ sub-components ------------------------------ */

function SectionHeader({
  title,
  icon: Icon,
  tone,
  totalUsd,
  totalZwg,
}: {
  title: string;
  icon: any;
  tone: "success" | "destructive";
  totalUsd: number;
  totalZwg: number;
}) {
  const color =
    tone === "success"
      ? "bg-success/10 text-success border-success/30"
      : "bg-destructive/10 text-destructive border-destructive/30";
  return (
    <div className={`sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-t-2xl border-b ${color} px-5 py-3 backdrop-blur`}>
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5" />
        <h2 className="text-sm font-bold uppercase tracking-wider">{title}</h2>
      </div>
      <div className="flex items-center gap-4 text-xs font-semibold tabular-nums">
        <span>USD {fmt(totalUsd)}</span>
        <span>ZWG {fmt(totalZwg)}</span>
      </div>
    </div>
  );
}

function Subsection({
  title,
  subtitle,
  children,
  tone,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  tone?: "muted";
}) {
  return (
    <div className={`rounded-xl border ${tone === "muted" ? "border-gold/40 bg-gold/5" : "border-border bg-background/40"} p-3`}>
      <div className="mb-2 flex items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-foreground">{title}</h3>
          {subtitle && <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function LineTable({
  rows,
  search,
  showTotal,
  emptyText,
}: {
  rows: EodLine[];
  search: string;
  showTotal?: boolean;
  emptyText?: string;
}) {
  const q = search.trim().toLowerCase();
  const filtered = q
    ? rows.filter(
        (r) =>
          r.narration.toLowerCase().includes(q) ||
          r.ref.toLowerCase().includes(q) ||
          r.type.toLowerCase().includes(q),
      )
    : rows;
  const usd = filtered.reduce((a, r) => a + r.usd, 0);
  const zwg = filtered.reduce((a, r) => a + r.zwg, 0);

  if (!filtered.length) {
    return <p className="px-1 py-2 text-xs italic text-muted-foreground">{emptyText ?? "No matching entries"}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="py-1.5 pr-2 font-medium">Time</th>
            <th className="py-1.5 pr-2 font-medium">Narration</th>
            <th className="py-1.5 pr-2 font-medium">Type</th>
            <th className="py-1.5 pr-2 font-medium">Ref</th>
            <th className="py-1.5 pr-2 text-right font-medium">USD</th>
            <th className="py-1.5 text-right font-medium">ZWG</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.id} className="border-t border-border/60">
              <td className="py-1.5 pr-2 text-muted-foreground tabular-nums">{r.ts ? timeOf(r.ts) : "—"}</td>
              <td className="py-1.5 pr-2 font-medium text-foreground">{r.narration}</td>
              <td className="py-1.5 pr-2 text-muted-foreground">{r.type}</td>
              <td className="py-1.5 pr-2 text-muted-foreground">{r.ref}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{fmt(r.usd)}</td>
              <td className="py-1.5 text-right tabular-nums">{fmt(r.zwg)}</td>
            </tr>
          ))}
          {showTotal && (
            <tr className="border-t-2 border-border bg-muted/30">
              <td colSpan={4} className="py-1.5 pr-2 text-right text-[11px] font-bold uppercase tracking-wider">
                Subtotal
              </td>
              <td className="py-1.5 pr-2 text-right font-bold tabular-nums">{fmt(usd)}</td>
              <td className="py-1.5 text-right font-bold tabular-nums">{fmt(zwg)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function GrandTotal({ label, usd, zwg, tone }: { label: string; usd: number; zwg: number; tone: "success" | "destructive" }) {
  const color = tone === "success" ? "bg-success text-white" : "bg-destructive text-white";
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl ${color} px-4 py-3 font-bold`}>
      <span className="text-sm uppercase tracking-wider">{label}</span>
      <div className="flex items-center gap-5 text-sm tabular-nums">
        <span>USD {fmt(usd)}</span>
        <span>ZWG {fmt(zwg)}</span>
      </div>
    </div>
  );
}

function BalanceCell({ currency, expected }: { currency: "USD" | "ZWG"; expected: number }) {
  return (
    <div className="rounded-xl border border-border bg-background/40 p-4">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Expected {currency} Cash Balance</p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{fmt(expected)}</p>
    </div>
  );
}

function PhysicalInput({
  currency, value, onChange, expected, variance,
}: {
  currency: "USD" | "ZWG";
  value: string;
  onChange: (v: string) => void;
  expected: number;
  variance: number;
}) {
  const entered = value.trim() !== "";
  const balanced = entered && Math.abs(variance) < 0.005;
  const over = entered && variance > 0.005;
  const short = entered && variance < -0.005;
  const status = !entered
    ? { label: "Enter physical count", cls: "bg-muted text-muted-foreground" }
    : balanced
      ? { label: "Balanced", cls: "bg-success text-white" }
      : over
        ? { label: `Over by ${fmt(Math.abs(variance))}`, cls: "bg-warning text-white" }
        : { label: `Short by ${fmt(Math.abs(variance))}`, cls: "bg-destructive text-white" };

  return (
    <div className="rounded-xl border border-border bg-background/40 p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Physical {currency} Count</p>
        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${status.cls}`}>
          {status.label}
        </span>
      </div>
      <Input
        type="number"
        min="0"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0.00"
        className="mt-2 text-lg font-bold tabular-nums"
      />
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <Row k={`Expected ${currency}`} v={fmt(expected)} />
        <Row k={`Variance ${currency}`} v={fmt(variance)} tone={!entered ? undefined : balanced ? "ok" : over ? "warn" : "err"} align="right" />
      </div>
    </div>
  );
}

function Row({ k, v, tone, align }: { k: string; v: string; tone?: "ok" | "warn" | "err"; align?: "right" }) {
  const color =
    tone === "ok" ? "text-success" : tone === "warn" ? "text-warning" : tone === "err" ? "text-destructive" : "text-foreground";
  return (
    <div className={`flex items-center justify-between ${align === "right" ? "text-right" : ""}`}>
      <span className="text-muted-foreground">{k}</span>
      <span className={`font-semibold tabular-nums ${color}`}>{v}</span>
    </div>
  );
}
