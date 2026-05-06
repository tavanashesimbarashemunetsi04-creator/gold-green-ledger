import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/pending")({
  component: PendingPage,
});

type Source = "payments" | "cash_swipes" | "cash_advance";

type Row = {
  source: Source;
  id: string;
  date: string;
  created_at: string;
  status: string;
  name?: string | null;
  bank?: string | null;
  transaction_type?: string | null;
  payment_type?: string | null;
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
  signature_url?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
};

const sourceLabels: Record<Source, string> = {
  payments: "Payment",
  cash_swipes: "Cash Swipe",
  cash_advance: "Cash Advance",
};

function fmtAmount(r: Row) {
  if (r.usd_amount != null) return `USD ${Number(r.usd_amount).toFixed(2)}`;
  if (r.zwg_amount != null) return `ZWG ${Number(r.zwg_amount).toFixed(2)}`;
  if (r.amount != null) return Number(r.amount).toFixed(2);
  return "—";
}

function PendingPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Simple role + day-state controls — adjust to your real auth/session model.
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("role") === "admin";
  });
  const [dayOpen, setDayOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("day_state") !== "closed";
  });

  const load = useCallback(async () => {
    setLoading(true);
    const sources: Source[] = ["payments", "cash_swipes", "cash_advance"];
    const results = await Promise.all(
      sources.map((s) =>
        supabase.from(s).select("*").eq("status", "pending").order("created_at", { ascending: false }),
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
  }, [load]);

  const canEdit = dayOpen || isAdmin;

  const updateStatus = async (row: Row, status: "successful" | "failed") => {
    if (!canEdit) {
      toast.error("Day closed — admin only.");
      return;
    }
    setBusyId(row.id);
    const patch: Record<string, unknown> = { status };
    if (status === "successful") {
      patch.approved_by = isAdmin ? "admin" : "teller";
      patch.approved_at = new Date().toISOString();
    }
    const { error } = await supabase.from(row.source).update(patch).eq("id", row.id);
    setBusyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Marked ${status}`);
    setRows((prev) => prev.filter((r) => !(r.id === row.id && r.source === row.source)));
  };

  return (
    <main className="p-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Pending Transactions</h1>
          <p className="text-sm text-muted-foreground">
            All payments, cash swipes, and cash advances awaiting resolution.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={isAdmin}
              onChange={(e) => {
                setIsAdmin(e.target.checked);
                localStorage.setItem("role", e.target.checked ? "admin" : "teller");
              }}
            />
            Admin
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={dayOpen}
              onChange={(e) => {
                setDayOpen(e.target.checked);
                localStorage.setItem("day_state", e.target.checked ? "open" : "closed");
              }}
            />
            Day open
          </label>
          <Button size="sm" variant="outline" onClick={load}>Refresh</Button>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pending transactions.</p>
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Bank / Type</TableHead>
                <TableHead>Tx Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Account / Phone</TableHead>
                <TableHead>Card</TableHead>
                <TableHead>ID #</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={`${r.source}-${r.id}`}>
                  <TableCell className="font-medium">{sourceLabels[r.source]}</TableCell>
                  <TableCell>{r.date}</TableCell>
                  <TableCell>{r.name ?? "—"}</TableCell>
                  <TableCell>{r.bank ?? r.payment_type ?? "—"}</TableCell>
                  <TableCell>{r.transaction_type ?? r.payment_type ?? "—"}</TableCell>
                  <TableCell>{fmtAmount(r)}</TableCell>
                  <TableCell>{r.account_number ?? r.phone_number ?? "—"}</TableCell>
                  <TableCell>{r.card_last4 ? `••${r.card_last4}` : "—"}</TableCell>
                  <TableCell>{r.id_number ?? "—"}</TableCell>
                  <TableCell>{r.code ?? "—"}</TableCell>
                  <TableCell>
                    <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning">
                      {r.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        disabled={!canEdit || busyId === r.id}
                        onClick={() => updateStatus(r, "successful")}
                      >
                        <CheckCircle2 className="h-4 w-4" /> Successful
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={!canEdit || busyId === r.id}
                        onClick={() => updateStatus(r, "failed")}
                      >
                        <XCircle className="h-4 w-4" /> Failed
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
}
