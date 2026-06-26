import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { assignFloat, selfAssignFloat } from "@/lib/float.functions";
import { DAILY_ROLES, DAILY_ROLE_LABEL, type DailyRole } from "@/lib/daily-role.functions";

export const Route = createFileRoute("/admin/float")({ component: FloatPage });

type Profile = { user_id: string; full_name: string | null; email: string | null; username: string | null };
type Branch = { id: string; name: string };
type Assignment = {
  id: string;
  assigned_by_user_id: string;
  assigned_to_user_id: string;
  amount: number;
  reference: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  branch_id: string | null;
  created_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
};

function FloatPage() {
  const { loading, isAdmin, isFinanceManager, user } = useAuth();
  const assign = useServerFn(assignFloat);
  const self = useServerFn(selfAssignFloat);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [eligibleIds, setEligibleIds] = useState<Set<string>>(new Set());
  const [branches, setBranches] = useState<Branch[]>([]);
  const [rows, setRows] = useState<Assignment[]>([]);
  const [balance, setBalance] = useState<number>(0);

  const [tellerId, setTellerId] = useState("");
  const [amount, setAmount] = useState("");
  const [branchId, setBranchId] = useState<string>("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [dailyRole, setDailyRole] = useState<DailyRole | "">("");
  const [submitting, setSubmitting] = useState(false);

  const [selfAmount, setSelfAmount] = useState("");
  const [selfRef, setSelfRef] = useState("");

  const load = useCallback(async () => {
    const [p, b, a, bal, roles] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, email, username").order("full_name"),
      supabase.from("branches").select("id, name").order("name"),
      supabase.from("float_assignments").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("finance_balances" as never).select("balance").eq("user_id", user?.id ?? "").maybeSingle(),
      supabase.from("user_roles").select("user_id, role").in("role", ["teller", "finance_manager"]),
    ]);
    setProfiles((p.data ?? []) as Profile[]);
    setBranches((b.data ?? []) as Branch[]);
    setRows((a.data ?? []) as Assignment[]);
    setBalance(Number((bal.data as { balance?: number } | null)?.balance ?? 0));
    setEligibleIds(new Set(((roles.data ?? []) as { user_id: string }[]).map((r) => r.user_id)));
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const ch = supabase
      .channel("float_assignments_admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "float_assignments" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "user_internal_transactions" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/" />;

  const submit = async () => {
    const amt = Number(amount);
    if (!tellerId) return toast.error("Select a teller");
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    if (!dailyRole) return toast.error("Select a daily role");
    setSubmitting(true);
    try {
      await assign({
        data: {
          teller_user_id: tellerId,
          amount: amt,
          branch_id: branchId || undefined,
          reference: reference || undefined,
          notes: notes || undefined,
          assigned_role: dailyRole,
        },
      });
      toast.success("Float assigned — awaiting teller approval");
      setTellerId(""); setAmount(""); setReference(""); setNotes(""); setDailyRole("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setSubmitting(false); }
  };

  const submitSelf = async () => {
    const amt = Number(selfAmount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    try {
      await self({ data: { amount: amt, reference: selfRef || undefined } });
      toast.success("Self-float recorded");
      setSelfAmount(""); setSelfRef("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const nameFor = (uid: string) => {
    const p = profiles.find((x) => x.user_id === uid);
    return p?.full_name || p?.username || p?.email || uid.slice(0, 8);
  };

  const statusBadge = (s: Assignment["status"]) => {
    const color = s === "approved" ? "bg-emerald-600" : s === "rejected" ? "bg-destructive" : s === "cancelled" ? "bg-muted-foreground" : "bg-amber-600";
    return <Badge className={`${color} hover:${color}`}>{s}</Badge>;
  };

  return (
    <div className="space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-semibold">Float Management</h1>
        <p className="text-sm text-muted-foreground">
          Assign opening float to tellers. Teller balance only increases after they approve.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Your float balance</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-semibold">${balance.toFixed(2)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Pending approvals</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-semibold">{rows.filter(r => r.status === "pending").length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Assigned today</CardTitle></CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">
              ${rows
                .filter(r => new Date(r.created_at).toDateString() === new Date().toDateString())
                .reduce((s, r) => s + Number(r.amount), 0).toFixed(2)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Assign opening float</CardTitle>
            <CardDescription>Status remains pending until the teller approves.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Teller</Label>
              <Select value={tellerId} onValueChange={setTellerId}>
                <SelectTrigger><SelectValue placeholder="Select teller" /></SelectTrigger>
                <SelectContent>
                  {profiles.filter(p => p.user_id !== user?.id && eligibleIds.has(p.user_id)).map(p => (
                    <SelectItem key={p.user_id} value={p.user_id}>
                      {p.full_name || p.username || p.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Amount</Label>
                <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Branch</Label>
                <Select value={branchId} onValueChange={setBranchId}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Daily Role <span className="text-destructive">*</span></Label>
              <Select value={dailyRole} onValueChange={(v) => setDailyRole(v as DailyRole)}>
                <SelectTrigger><SelectValue placeholder="Select daily role" /></SelectTrigger>
                <SelectContent>
                  {DAILY_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{DAILY_ROLE_LABEL[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reference</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. opening shift 09:00" />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <Button onClick={submit} disabled={submitting}>{submitting ? "Submitting..." : "Submit assignment"}</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Self-float</CardTitle>
            <CardDescription>Record float allocated to yourself (finance manager / admin).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input type="number" step="0.01" min="0" value={selfAmount} onChange={(e) => setSelfAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Reference</Label>
              <Input value={selfRef} onChange={(e) => setSelfRef(e.target.value)} />
            </div>
            <Button onClick={submitSelf} variant="outline">Record self-float</Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent assignments</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Assigned by</TableHead>
                <TableHead>Teller</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No assignments yet</TableCell></TableRow>
              )}
              {rows.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell>{nameFor(r.assigned_by_user_id)}</TableCell>
                  <TableCell>{nameFor(r.assigned_to_user_id)}</TableCell>
                  <TableCell className="text-right font-medium">${Number(r.amount).toFixed(2)}</TableCell>
                  <TableCell className="text-xs">{r.reference || "—"}</TableCell>
                  <TableCell>{statusBadge(r.status)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
