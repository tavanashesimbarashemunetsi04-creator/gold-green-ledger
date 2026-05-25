import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowRightLeft,
  Wallet,
  Receipt,
  Lock,
  Unlock,
  ShieldCheck,
  ShieldAlert,
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  RotateCcw,
  Loader2,
} from "lucide-react";

import { useDashboardState } from "@/hooks/useDashboardState";
import { useAuth } from "@/hooks/useAuth";
import { openDay, closeDay } from "@/lib/teller-day.functions";
import { approveFloat, rejectFloat } from "@/lib/float.functions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

/* ------------------------------ helpers ------------------------------ */

function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
}

function formatDate(d = new Date()) {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function fmtMoney(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function deviceString() {
  if (typeof navigator === "undefined") return "server";
  const ua = navigator.userAgent || "";
  const plat = (navigator as any).platform || "web";
  return `${plat} · ${ua.slice(0, 160)}`;
}

function useAnimatedNumber(value: number, ms = 600) {
  const [n, setN] = useState(value);
  useEffect(() => {
    const start = n;
    const delta = value - start;
    if (delta === 0) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setN(start + delta * (0.5 - Math.cos(Math.PI * p) / 2));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return n;
}

/* ------------------------------ component ------------------------------ */

function Dashboard() {
  const { state, loading, refresh } = useDashboardState();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [openDlg, setOpenDlg] = useState(false);
  const [closeDlg, setCloseDlg] = useState(false);
  const [reviewDlg, setReviewDlg] = useState(false);
  const [search, setSearch] = useState("");

  const username =
    state?.profile.username ||
    state?.profile.display_name ||
    user?.email?.split("@")[0] ||
    "Teller";
  const branchName = state?.profile.branch_name ?? "Unassigned branch";
  const session = state?.session ?? null;
  const pending = state?.pendingFloat ?? null;
  const ready = state?.profile.ready_to_open_day ?? false;
  const isDayOpen = !!session;
  const lastClosed = state?.lastClosedSession ?? null;

  const filteredRecent = useMemo(() => {
    if (!state) return [];
    const q = search.trim().toLowerCase();
    if (!q) return state.recent;
    return state.recent.filter(
      (r) =>
        r.ref.toLowerCase().includes(q) ||
        r.client.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q),
    );
  }, [state, search]);

  return (
    <main className="min-h-screen bg-background px-6 py-8 md:px-10">
      {/* Greeting */}
      <GreetingCard
        greet={greeting()}
        name={username}
        date={formatDate()}
        branch={branchName}
        session={session}
        loading={loading}
      />

      {/* Day banner */}
      {!isDayOpen && (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <ShieldAlert className="h-5 w-5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">
              {lastClosed ? "Operational day closed" : "Operational day not opened"}
            </p>
            <p className="text-xs opacity-80">
              {lastClosed
                ? "You have view-only access. A new day must be opened (with finance-assigned float) before you can transact."
                : "You cannot process any transactions until you open the day."}
            </p>
          </div>
        </div>
      )}

      {/* Action row */}
      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <OpenDayCard
          pendingFloat={pending}
          ready={ready}
          isDayOpen={isDayOpen}
          session={session}
          onReview={() => setReviewDlg(true)}
          onOpen={() => setOpenDlg(true)}
        />
        <CloseDayCard
          isDayOpen={isDayOpen}
          session={session}
          onClose={() => setCloseDlg(true)}
        />
      </section>

      {/* Tiles */}
      <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <Tile label="Total Payments" value={state?.totals.payments ?? 0} icon={ArrowDownToLine} tone="primary" />
        <Tile label="Total Withdrawals" value={state?.totals.withdrawals ?? 0} icon={ArrowUpFromLine} tone="primary" />
        <Tile label="Internal Inflow" value={state?.totals.internalIn ?? 0} icon={ArrowRightLeft} tone="primary" />
        <Tile label="Internal Outflow" value={state?.totals.internalOut ?? 0} icon={ArrowRightLeft} tone="primary" />
        <Tile
          label="Cash At Hand"
          value={state?.totals.cashAtHand ?? 0}
          icon={Wallet}
          tone="gold"
          highlight
        />
      </section>

      {/* Recent */}
      <section className="mt-8 rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Recent Transactions</h2>
            <p className="text-xs text-muted-foreground">Updated automatically every 15 seconds</p>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reference, client, type…"
              className="w-72 pl-9"
            />
          </div>
        </div>

        {filteredRecent.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">
            {loading ? "Loading…" : "No transactions for this session yet."}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredRecent.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-muted/40">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{t.client}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t.ref} · {t.type} · {new Date(t.ts).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-sm font-bold tabular-nums ${
                      t.amount >= 0 ? "text-success" : "text-foreground"
                    }`}
                  >
                    {fmtMoney(t.amount)}
                  </span>
                  <StatusBadge status={t.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Dialogs */}
      <ReviewFloatDialog
        open={reviewDlg}
        onOpenChange={setReviewDlg}
        pending={pending}
        onDone={refresh}
      />
      <OpenDayDialog
        open={openDlg}
        onOpenChange={setOpenDlg}
        defaultAmount={pending?.amount ?? 0}
        branchId={state?.profile.branch_id ?? null}
        onDone={refresh}
      />
      <CloseDayDialog
        open={closeDlg}
        onOpenChange={setCloseDlg}
        defaultCash={state?.totals.cashAtHand ?? 0}
        onDone={refresh}
      />
    </main>
  );
}

/* ------------------------------ sub-components ------------------------------ */

function GreetingCard({
  greet,
  name,
  date,
  branch,
  session,
  loading,
}: {
  greet: string;
  name: string;
  date: string;
  branch: string;
  session: { session_code: string } | null;
  loading: boolean;
}) {
  return (
    <header
      className="relative overflow-hidden rounded-3xl border border-border p-6 shadow-[var(--shadow-elegant)] md:p-8"
      style={{ background: "var(--gradient-hero)" }}
    >
      <div className="relative z-10 flex flex-wrap items-end justify-between gap-4">
        <div className="text-white">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-[var(--gold)]">
            Teller Workstation
          </p>
          <h1 className="mt-2 text-3xl font-bold md:text-4xl">
            {greet}, {name}
          </h1>
          <p className="mt-1 text-sm text-white/80">{date}</p>
          <p className="mt-0.5 text-sm font-medium text-white/90">{branch}</p>
        </div>
        <div className="flex items-center gap-2">
          {loading ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-medium text-white/80">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading status
            </span>
          ) : session ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-success/20 px-4 py-2 text-xs font-semibold text-success ring-1 ring-success/40">
              <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
              Day Open · {session.session_code}
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full bg-destructive/20 px-4 py-2 text-xs font-semibold text-destructive ring-1 ring-destructive/40">
              <span className="h-2 w-2 rounded-full bg-destructive" />
              Day Closed
            </span>
          )}
        </div>
      </div>
      <div
        aria-hidden
        className="absolute -bottom-24 -right-16 h-64 w-64 rounded-full opacity-30 blur-3xl"
        style={{ background: "var(--gold)" }}
      />
    </header>
  );
}

function OpenDayCard({
  pendingFloat,
  ready,
  isDayOpen,
  session,
  onReview,
  onOpen,
}: {
  pendingFloat: { id: string; amount: number; reference: string | null } | null;
  ready: boolean;
  isDayOpen: boolean;
  session: { opened_float_amount: number; session_code: string } | null;
  onReview: () => void;
  onOpen: () => void;
}) {
  const canOpen = !isDayOpen && ready;
  const status: { label: string; desc: string; tone: "ok" | "warn" | "err" } =
    isDayOpen
      ? { label: "Day Opened", desc: `Float ${fmtMoney(session?.opened_float_amount ?? 0)} · ${session?.session_code}`, tone: "ok" }
      : pendingFloat
        ? { label: "Float awaiting your approval", desc: `${fmtMoney(pendingFloat.amount)} from finance${pendingFloat.reference ? ` · ${pendingFloat.reference}` : ""}`, tone: "warn" }
        : ready
          ? { label: "Float approved — ready to open day", desc: "Click Open Day to begin transacting.", tone: "ok" }
          : { label: "Waiting for finance float assignment", desc: "Finance must assign and you must approve float before you can open the day.", tone: "err" };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--gradient-primary)] text-primary-foreground">
          <Unlock className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Open Day</p>
          <p className="text-sm font-semibold text-foreground">{status.label}</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{status.desc}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {pendingFloat && !isDayOpen && (
          <Button size="sm" variant="secondary" onClick={onReview}>
            <ShieldCheck className="mr-1 h-4 w-4" /> Review Float
          </Button>
        )}
        <Button size="sm" disabled={!canOpen} onClick={onOpen}>
          {isDayOpen ? "Day Opened" : "Open Day"}
        </Button>
      </div>
    </div>
  );
}

function CloseDayCard({
  isDayOpen,
  session,
  onClose,
}: {
  isDayOpen: boolean;
  session: { opened_at: string } | null;
  onClose: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--gradient-gold)] text-gold-foreground">
          <Lock className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Close Day</p>
          <p className="text-sm font-semibold text-foreground">
            {isDayOpen ? "Operational day is currently open" : "No open operational day"}
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {isDayOpen && session
          ? `Opened ${new Date(session.opened_at).toLocaleString()}. You must close the day before logging out.`
          : "Once a day is opened, the Close Day action will become available here."}
      </p>
      <div className="mt-4">
        <Button size="sm" variant="destructive" disabled={!isDayOpen} onClick={onClose}>
          Close Day
        </Button>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  icon: Icon,
  tone,
  highlight,
}: {
  label: string;
  value: number;
  icon: any;
  tone: "primary" | "gold";
  highlight?: boolean;
}) {
  const n = useAnimatedNumber(value);
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border p-5 shadow-[var(--shadow-soft)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-elegant)] ${
        highlight ? "border-[var(--gold)]/40 ring-1 ring-[var(--gold)]/40" : "border-border"
      }`}
      style={highlight ? { background: "var(--gradient-gold)" } : { background: "var(--card)" }}
    >
      <div className="flex items-start justify-between">
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-xl ${
            tone === "gold"
              ? "bg-white/20 text-gold-foreground"
              : "bg-[var(--gradient-primary)] text-primary-foreground"
          }`}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className={`mt-4 text-xs uppercase tracking-wider ${highlight ? "text-gold-foreground/80" : "text-muted-foreground"}`}>
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${highlight ? "text-gold-foreground" : "text-foreground"}`}>
        {fmtMoney(n)}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; Icon: any; bg: string; fg: string }> = {
    successful: { label: "Successful", Icon: CheckCircle2, bg: "color-mix(in oklab, var(--success) 18%, transparent)", fg: "var(--success)" },
    approved: { label: "Successful", Icon: CheckCircle2, bg: "color-mix(in oklab, var(--success) 18%, transparent)", fg: "var(--success)" },
    pending: { label: "Pending", Icon: Clock, bg: "color-mix(in oklab, var(--warning) 22%, transparent)", fg: "oklch(0.45 0.13 75)" },
    failed: { label: "Failed", Icon: XCircle, bg: "color-mix(in oklab, var(--destructive) 18%, transparent)", fg: "var(--destructive)" },
    declined: { label: "Failed", Icon: XCircle, bg: "color-mix(in oklab, var(--destructive) 18%, transparent)", fg: "var(--destructive)" },
    rejected: { label: "Reversed", Icon: RotateCcw, bg: "color-mix(in oklab, var(--muted) 50%, transparent)", fg: "var(--muted-foreground)" },
  };
  const s = map[status.toLowerCase()] ?? map.pending;
  const I = s.Icon;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      <I className="h-3 w-3" /> {s.label}
    </span>
  );
}

/* ------------------------------ dialogs ------------------------------ */

function ReviewFloatDialog({
  open,
  onOpenChange,
  pending,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pending: { id: string; amount: number; reference: string | null } | null;
  onDone: () => void;
}) {
  const approve = useServerFn(approveFloat);
  const reject = useServerFn(rejectFloat);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");

  if (!pending) return null;

  const handleApprove = async () => {
    setBusy(true);
    try {
      await approve({ data: { assignment_id: pending.id } });
      toast.success("Float approved. You can now open the day.");
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (!reason.trim()) return toast.error("Provide a reason");
    setBusy(true);
    try {
      await reject({ data: { assignment_id: pending.id, reason: reason.trim() } });
      toast.success("Float rejected");
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Review Assigned Float</DialogTitle>
          <DialogDescription>
            Finance has assigned float to your account. Approve to make it available, or reject with a reason.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg bg-muted p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Amount</p>
            <p className="text-2xl font-bold text-foreground">{fmtMoney(pending.amount)}</p>
            {pending.reference && <p className="text-xs text-muted-foreground">Ref: {pending.reference}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="reason">Rejection reason (only if rejecting)</Label>
            <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. amount mismatch" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={busy} onClick={handleReject}>
            Reject
          </Button>
          <Button disabled={busy} onClick={handleApprove}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve Float"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OpenDayDialog({
  open,
  onOpenChange,
  defaultAmount,
  branchId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultAmount: number;
  branchId: string | null;
  onDone: () => void;
}) {
  const fn = useServerFn(openDay);
  const [amount, setAmount] = useState<string>(String(defaultAmount));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setAmount(String(defaultAmount || 0));
  }, [open, defaultAmount]);

  const submit = async () => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n < 0) return toast.error("Invalid amount");
    setBusy(true);
    try {
      await fn({ data: { floatAmount: n, branchId, device: deviceString() } });
      toast.success("Operational day opened");
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open Operational Day</DialogTitle>
          <DialogDescription>
            Confirm the opening float for today's session. You'll be locked out of transactions until you do.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="float">Opening float</Label>
          <Input id="float" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={submit}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Open Day"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CloseDayDialog({
  open,
  onOpenChange,
  defaultCash,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultCash: number;
  onDone: () => void;
}) {
  const fn = useServerFn(closeDay);
  const [cash, setCash] = useState<string>(String(defaultCash.toFixed(2)));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setCash(defaultCash.toFixed(2));
  }, [open, defaultCash]);

  const submit = async () => {
    const n = Number(cash);
    if (!Number.isFinite(n) || n < 0) return toast.error("Invalid amount");
    setBusy(true);
    try {
      await fn({ data: { cashAtHand: n, device: deviceString() } });
      toast.success("Operational day successfully closed");
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Are you sure you want to close your operational day?</DialogTitle>
          <DialogDescription>
            This action is permanent for today. All transaction modules will be locked until a new day is opened with finance-approved float.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="cash">Closing cash at hand</Label>
          <Input id="cash" type="number" min="0" step="0.01" value={cash} onChange={(e) => setCash(e.target.value)} />
          <p className="text-xs text-muted-foreground"><Receipt className="mr-1 inline h-3 w-3" /> Recorded with timestamp, session ID, and device.</p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={busy} onClick={submit}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Yes, Close Day"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
