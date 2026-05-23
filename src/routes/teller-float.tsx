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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { approveFloat, rejectFloat } from "@/lib/float.functions";

export const Route = createFileRoute("/teller-float")({ component: TellerFloatPage });

type Assignment = {
  id: string; assigned_by_user_id: string; assigned_to_user_id: string; amount: number;
  reference: string | null; status: "pending"|"approved"|"rejected"|"cancelled"; created_at: string;
  approved_at: string | null; rejected_at: string | null; rejection_reason: string | null;
};

function TellerFloatPage() {
  const { user } = useAuth();
  const approve = useServerFn(approveFloat);
  const reject = useServerFn(rejectFloat);

  const [rows, setRows] = useState<Assignment[]>([]);
  const [balance, setBalance] = useState(0);
  const [rejecting, setRejecting] = useState<Assignment | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const [a, bal] = await Promise.all([
      supabase.from("float_assignments").select("*")
        .eq("assigned_to_user_id", user.id).order("created_at", { ascending: false }).limit(50),
      supabase.from("user_float_balances").select("balance").eq("user_id", user.id).maybeSingle(),
    ]);
    setRows((a.data ?? []) as Assignment[]);
    setBalance(Number(bal.data?.balance ?? 0));
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const ch = supabase.channel("teller_float")
      .on("postgres_changes", { event: "*", schema: "public", table: "float_assignments" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const doApprove = async (id: string) => {
    setBusy(true);
    try {
      await approve({ data: { assignment_id: id } });
      toast.success("Float approved — you may open the day");
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
        <CardHeader><CardTitle>History</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No float yet</TableCell></TableRow>
              )}
              {rows.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell className="text-right font-medium">${Number(r.amount).toFixed(2)}</TableCell>
                  <TableCell className="text-xs">{r.reference || "—"}</TableCell>
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
