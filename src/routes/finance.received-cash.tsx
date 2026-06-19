import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Wallet, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/finance/received-cash")({
  component: ReceivedCashPage,
});

type ClosedSession = {
  id: string;
  user_id: string;
  branch_id: string | null;
  session_code: string;
  opened_at: string;
  closed_at: string;
  opened_float_amount: number;
  closing_cash_at_hand: number | null;
  session_type: "teller" | "ecocash";
};

type ReceivedRow = {
  id: string;
  teller_user_id: string;
  session_id: string;
  session_type: string;
  business_date: string;
  expected_amount: number;
  received_amount: number;
  variance_amount: number;
  variance_reason: string | null;
  notes: string | null;
  received_by_user_id: string;
  received_at: string;
};

function ReceivedCashPage() {
  const { user } = useAuth();
  const [pending, setPending] = useState<ClosedSession[]>([]);
  const [history, setHistory] = useState<ReceivedRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<ClosedSession | null>(null);
  const [received, setReceived] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [ts, es, rc] = await Promise.all([
      supabase
        .from("teller_sessions")
        .select("id,user_id,branch_id,session_code,opened_at,closed_at,opened_float_amount,closing_cash_at_hand")
        .eq("status", "closed")
        .order("closed_at", { ascending: false })
        .limit(100),
      supabase
        .from("ecocash_sessions")
        .select("id,user_id,branch_id,session_code,opened_at,closed_at,opened_float_amount,closing_cash_at_hand")
        .eq("status", "closed")
        .order("closed_at", { ascending: false })
        .limit(100),
      supabase
        .from("received_cash")
        .select("*")
        .order("received_at", { ascending: false })
        .limit(200),
    ]);

    const recorded = new Set((rc.data ?? []).map((r: any) => `${r.session_type}:${r.session_id}`));
    const closed: ClosedSession[] = [
      ...(ts.data ?? []).map((s: any) => ({ ...s, session_type: "teller" as const })),
      ...(es.data ?? []).map((s: any) => ({ ...s, session_type: "ecocash" as const })),
    ]
      .filter((s) => s.closed_at && !recorded.has(`${s.session_type}:${s.id}`))
      .sort((a, b) => (a.closed_at < b.closed_at ? 1 : -1));

    setPending(closed);
    setHistory((rc.data ?? []) as ReceivedRow[]);

    const uids = Array.from(
      new Set<string>([
        ...closed.map((c) => c.user_id),
        ...(rc.data ?? []).map((r: any) => r.teller_user_id),
        ...(rc.data ?? []).map((r: any) => r.received_by_user_id),
      ])
    );
    if (uids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id,username,display_name,email")
        .in("user_id", uids);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p: any) => {
        map[p.user_id] = p.username || p.display_name || p.email || p.user_id;
      });
      setNames(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("received_cash")
      .on("postgres_changes", { event: "*", schema: "public", table: "received_cash" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "teller_sessions" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "ecocash_sessions" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  const openDialog = (s: ClosedSession) => {
    setTarget(s);
    setReceived(String(s.closing_cash_at_hand ?? ""));
    setReason("");
    setNotes("");
  };

  const expected = useMemo(() => Number(target?.closing_cash_at_hand ?? 0), [target]);
  const variance = useMemo(() => Number(received || 0) - expected, [received, expected]);

  const submit = async () => {
    if (!target || !user?.id) return;
    const amt = Number(received);
    if (!Number.isFinite(amt) || amt < 0) {
      toast.error("Enter a valid received amount");
      return;
    }
    if (Math.abs(variance) > 0.005 && reason.trim() === "") {
      toast.error("Variance reason is required when amount does not match expected");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("received_cash").insert({
      teller_user_id: target.user_id,
      branch_id: target.branch_id,
      session_id: target.id,
      session_type: target.session_type,
      business_date: (target.closed_at ?? new Date().toISOString()).slice(0, 10),
      expected_amount: expected,
      received_amount: amt,
      variance_amount: variance,
      variance_reason: reason.trim() || null,
      notes: notes.trim() || null,
      received_by_user_id: user.id,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Cash receipt recorded");
    setTarget(null);
    load();
  };

  const totalReceived = history.reduce((s, r) => s + Number(r.received_amount), 0);

  return (
    <div className="p-8 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Wallet className="h-6 w-6" /> Received Cash
          </h1>
          <p className="text-sm text-muted-foreground">
            Record actual cash physically received from each teller after they close their day.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard label="Awaiting collection" value={String(pending.length)} />
        <SummaryCard label="Receipts recorded" value={String(history.length)} />
        <SummaryCard label="Total received" value={`$${totalReceived.toFixed(2)}`} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Closed days awaiting collection</CardTitle>
          <CardDescription>
            Tellers and EcoCash agents who closed their day but have not yet handed over physical cash.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">No outstanding collections.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Teller</TableHead>
                    <TableHead>Session</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Closed at</TableHead>
                    <TableHead className="text-right">Expected (USD)</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pending.map((s) => (
                    <TableRow key={`${s.session_type}-${s.id}`}>
                      <TableCell className="font-medium">{names[s.user_id] || s.user_id.slice(0, 8)}</TableCell>
                      <TableCell className="font-mono text-xs">{s.session_code}</TableCell>
                      <TableCell>
                        <Badge variant={s.session_type === "ecocash" ? "secondary" : "outline"}>
                          {s.session_type === "ecocash" ? "EcoCash" : "Standard"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{new Date(s.closed_at).toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        ${Number(s.closing_cash_at_hand ?? 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" onClick={() => openDialog(s)}>
                          Record receipt
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Received cash history</CardTitle>
          <CardDescription>All physical cash collections recorded by finance.</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No records yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Teller</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Expected</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead>Reason / Notes</TableHead>
                    <TableHead>Received by</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((r) => {
                    const d = new Date(r.received_at);
                    const v = Number(r.variance_amount);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs">{d.toLocaleDateString()}</TableCell>
                        <TableCell className="text-xs">{d.toLocaleTimeString()}</TableCell>
                        <TableCell>{names[r.teller_user_id] || r.teller_user_id.slice(0, 8)}</TableCell>
                        <TableCell>
                          <Badge variant={r.session_type === "ecocash" ? "secondary" : "outline"}>
                            {r.session_type === "ecocash" ? "EcoCash" : "Standard"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">${Number(r.expected_amount).toFixed(2)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          ${Number(r.received_amount).toFixed(2)}
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums ${
                            Math.abs(v) < 0.005 ? "" : v < 0 ? "text-destructive" : "text-amber-600"
                          }`}
                        >
                          {v >= 0 ? "+" : ""}
                          {v.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-xs max-w-[240px] truncate" title={[r.variance_reason, r.notes].filter(Boolean).join(" · ")}>
                          {[r.variance_reason, r.notes].filter(Boolean).join(" · ") || "—"}
                        </TableCell>
                        <TableCell className="text-xs">{names[r.received_by_user_id] || "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record received cash</DialogTitle>
          </DialogHeader>
          {target && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <p><span className="text-muted-foreground">Teller:</span> {names[target.user_id] || target.user_id.slice(0, 8)}</p>
                <p><span className="text-muted-foreground">Session:</span> <span className="font-mono">{target.session_code}</span></p>
                <p><span className="text-muted-foreground">Closed:</span> {new Date(target.closed_at).toLocaleString()}</p>
                <p><span className="text-muted-foreground">Expected (declared at close):</span> ${expected.toFixed(2)}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rc-amount">Cash received (USD)</Label>
                <Input
                  id="rc-amount"
                  inputMode="decimal"
                  value={received}
                  onChange={(e) => setReceived(e.target.value)}
                  placeholder="0.00"
                />
                <p className={`text-xs ${Math.abs(variance) < 0.005 ? "text-muted-foreground" : variance < 0 ? "text-destructive" : "text-amber-600"}`}>
                  Variance: {variance >= 0 ? "+" : ""}{variance.toFixed(2)}
                </p>
              </div>
              {Math.abs(variance) > 0.005 && (
                <div className="space-y-2">
                  <Label htmlFor="rc-reason">Variance reason (required)</Label>
                  <Input id="rc-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="rc-notes">Notes (optional)</Label>
                <Textarea id="rc-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy || received === ""}>
              {busy ? "Saving..." : "Confirm receipt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
