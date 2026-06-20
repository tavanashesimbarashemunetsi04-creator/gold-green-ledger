import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { approveFloat, rejectFloat } from "@/lib/float.functions";
import { openDay } from "@/lib/teller-day.functions";

export const Route = createFileRoute("/teller-float")({ component: TellerFloatPage });

function deviceString() {
  if (typeof navigator === "undefined") return "server";
  const ua = navigator.userAgent || "";
  const plat = (navigator as unknown as { platform?: string }).platform || "web";
  return `${plat} · ${ua.slice(0, 160)}`;
}

type Assignment = {
  id: string; assigned_by_user_id: string; assigned_to_user_id: string; amount: number;
  reference: string | null; status: "pending"|"approved"|"rejected"|"cancelled"; created_at: string;
  approved_at: string | null; rejected_at: string | null; rejection_reason: string | null;
  notes: string | null;
};

function TellerFloatPage() {
  const { user } = useAuth();
  const approve = useServerFn(approveFloat);
  const reject = useServerFn(rejectFloat);
  const openDayFn = useServerFn(openDay);

  const [rows, setRows] = useState<Assignment[]>([]);
  const [historyRows, setHistoryRows] = useState<Assignment[]>([]);
  const [funderNames, setFunderNames] = useState<Record<string, string>>({});
  const [balance, setBalance] = useState(0);
  const [dayOpenedAt, setDayOpenedAt] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Assignment | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [openDayPrompt, setOpenDayPrompt] = useState<{ amount: number } | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;

    // Determine current open day window (teller or ecocash session)
    const [ts, es] = await Promise.all([
      supabase.from("teller_sessions").select("opened_at")
        .eq("user_id", user.id).eq("status", "open")
        .order("opened_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("ecocash_sessions").select("opened_at")
        .eq("user_id", user.id).eq("status", "open")
        .order("opened_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const openedAt: string | null = ts.data?.opened_at ?? es.data?.opened_at ?? null;
    setDayOpenedAt(openedAt);

    const [a, bal, prof] = await Promise.all([
      supabase.from("float_assignments").select("*")
        .eq("assigned_to_user_id", user.id).order("created_at", { ascending: false }).limit(50),
      supabase.from("user_float_balances").select("balance").eq("user_id", user.id).maybeSingle(),
      supabase.from("profiles").select("branch_id").eq("user_id", user.id).maybeSingle(),
    ]);
    setBranchId((prof.data?.branch_id as string | null) ?? null);
    const all = (a.data ?? []) as Assignment[];
    setRows(all);

    // History limited to current open day only
    const history = openedAt ? all.filter(r => r.created_at >= openedAt) : [];
    setHistoryRows(history);

    const funderIds = Array.from(new Set(history.map(r => r.assigned_by_user_id)));
    if (funderIds.length > 0) {
      const { data: profs } = await supabase.from("profiles")
        .select("user_id, username, display_name, email").in("user_id", funderIds);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p: { user_id: string; username: string | null; display_name: string | null; email: string | null }) => {
        map[p.user_id] = p.username || p.display_name || p.email || p.user_id;
      });
      setFunderNames(map);
    } else {
      setFunderNames({});
    }

    setBalance(Number(bal.data?.balance ?? 0));
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const ch = supabase.channel("teller_float")
      .on("postgres_changes", { event: "*", schema: "public", table: "float_assignments" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "teller_sessions" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "ecocash_sessions" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const doApprove = async (assignment: Assignment) => {
    setBusy(true);
    try {
      await approve({ data: { assignment_id: assignment.id } });
      toast.success("Float approved");
      await load();
      if (!dayOpenedAt) {
        setOpenDayPrompt({ amount: Number(assignment.amount) });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(false); }
  };

  const submitOpenDay = async () => {
    if (!openDayPrompt) return;
    setBusy(true);
    try {
      await openDayFn({ data: { floatAmount: openDayPrompt.amount, branchId, device: deviceString() } });
      toast.success("Operational day opened");
      setOpenDayPrompt(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(false); }
  };

  const doReject = async () => {
    if (!rejecting || !reason.trim()) return;
    setBusy(true);
    try {
      await reject({ data: { assignment_id: rejecting.id, reason } });
      toast.success("Float rejected");
      setRejecting(null); setReason("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(false); }
  };

  const pending = rows.filter(r => r.status === "pending");

  return (
    <div className="space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-semibold">My Float</h1>
        <p className="text-sm text-muted-foreground">
          Review float assigned to you. You must approve before opening your day.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Current cash balance</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-semibold">${balance.toFixed(2)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Pending approvals</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-semibold">{pending.length}</p></CardContent>
        </Card>
      </div>

      {pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending float requests</CardTitle>
            <CardDescription>Approve to receive the float, or reject with a reason.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pending.map(r => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="text-lg font-semibold">${Number(r.amount).toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.reference || "no reference"} · {new Date(r.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => doApprove(r.id)} disabled={busy}>Approve</Button>
                  <Button variant="destructive" onClick={() => setRejecting(r)} disabled={busy}>Reject</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>History — Current Open Day</CardTitle>
          <CardDescription>
            {dayOpenedAt
              ? `Float funding transactions since ${new Date(dayOpenedAt).toLocaleString()}`
              : "No open day. Open your day to start a new history view."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Total funded today</p>
              <p className="text-xl font-semibold">
                ${historyRows.reduce((s, r) => s + Number(r.amount), 0).toFixed(2)}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Transactions today</p>
              <p className="text-xl font-semibold">{historyRows.length}</p>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date &amp; Time</TableHead>
                <TableHead>Float Type</TableHead>
                <TableHead className="text-right">Amount Funded</TableHead>
                <TableHead>Funding Username</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historyRows.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">
                  {dayOpenedAt ? "No float funding yet for this open day" : "No open day"}
                </TableCell></TableRow>
              )}
              {historyRows.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell className="text-xs">{r.notes || r.reference || "Float assignment"}</TableCell>
                  <TableCell className="text-right font-medium">${Number(r.amount).toFixed(2)}</TableCell>
                  <TableCell className="text-xs">{funderNames[r.assigned_by_user_id] || "—"}</TableCell>
                  <TableCell><Badge variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"}>{r.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>


      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject float</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Reason</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. amount incorrect" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button variant="destructive" onClick={doReject} disabled={!reason.trim() || busy}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
