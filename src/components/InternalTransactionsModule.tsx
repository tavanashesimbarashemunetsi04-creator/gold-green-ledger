import { useEffect, useMemo, useState, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Supabase tables required:
 *
 *  create table public.tellers (
 *    id uuid primary key default gen_random_uuid(),
 *    username text unique not null,
 *    created_at timestamptz default now()
 *  );
 *
 *  create type request_type as enum ('inflow','outflow');
 *  create type tx_status as enum ('pending','approved','declined');
 *  create type decision as enum ('pending','approved','declined');
 *
 *  create table public.internal_transactions (
 *    id uuid primary key default gen_random_uuid(),
 *    date date not null,
 *    initiating_teller_id uuid not null references public.tellers(id),
 *    target_teller_id uuid not null references public.tellers(id),
 *    request_type request_type not null,
 *    amount numeric(14,2) not null check (amount > 0),
 *    status tx_status not null default 'pending',
 *    initiator_decision decision not null default 'approved',
 *    receiver_decision decision not null default 'pending',
 *    created_at timestamptz default now(),
 *    check (initiating_teller_id <> target_teller_id)
 *  );
 */

type Teller = { id: string; username: string };
type RequestType = "inflow" | "outflow";
type TxStatus = "pending" | "approved" | "declined";
type Decision = "pending" | "approved" | "declined";

type Tx = {
  id: string;
  date: string;
  initiating_teller_id: string;
  target_teller_id: string;
  request_type: RequestType;
  amount: number;
  status: TxStatus;
  initiator_decision: Decision;
  receiver_decision: Decision;
  created_at: string;
};

const CURRENT_TELLER_KEY = "internal_tx_current_teller";

function resolveStatus(initiator: Decision, receiver: Decision): TxStatus {
  if (initiator === "declined" || receiver === "declined") return "declined";
  if (initiator === "approved" && receiver === "approved") return "approved";
  return "pending";
}

export function InternalTransactionsModule() {
  const [tellers, setTellers] = useState<Teller[]>([]);
  const [currentTellerId, setCurrentTellerId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // form state
  const [date, setDate] = useState("");
  const [targetId, setTargetId] = useState("");
  const [requestType, setRequestType] = useState<RequestType | "">("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // table state
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [filter, setFilter] = useState<TxStatus | "all">("all");

  const tellerMap = useMemo(() => {
    const m = new Map<string, string>();
    tellers.forEach((t) => m.set(t.id, t.username));
    return m;
  }, [tellers]);

  // Load tellers + restore current teller
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("tellers")
        .select("id, username")
        .order("username");
      if (error) {
        console.error("Failed to load tellers", error);
        toast.error("Failed to load tellers");
        return;
      }
      setTellers(data ?? []);
      const stored = typeof window !== "undefined"
        ? localStorage.getItem(CURRENT_TELLER_KEY)
        : null;
      if (stored && data?.some((t) => t.id === stored)) {
        setCurrentTellerId(stored);
      }
    })();
  }, []);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("internal_transactions")
      .select("*")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      console.error("Failed to load transactions", error);
      toast.error("Failed to load transactions");
      return;
    }
    setTransactions((data ?? []) as Tx[]);
  }, []);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("internal_transactions_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "internal_transactions" },
        () => loadTransactions(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadTransactions]);

  const handleCurrentTellerChange = (id: string) => {
    setCurrentTellerId(id);
    if (typeof window !== "undefined") {
      localStorage.setItem(CURRENT_TELLER_KEY, id);
    }
  };

  const resetForm = () => {
    setDate("");
    setTargetId("");
    setRequestType("");
    setAmount("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTellerId) return toast.error("Select your teller identity first");
    if (!date) return toast.error("Date is required");
    if (!targetId) return toast.error("Select a target teller");
    if (targetId === currentTellerId)
      return toast.error("You cannot transact with yourself");
    if (!requestType) return toast.error("Select a request type");
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error("Amount must be greater than 0");

    // status is system-managed by a database trigger — never set from client
    const payload = {
      date,
      initiating_teller_id: currentTellerId,
      target_teller_id: targetId,
      request_type: requestType,
      amount: amt,
      initiator_decision: "approved" as Decision,
      receiver_decision: "pending" as Decision,
    };

    try {
      setSubmitting(true);
      const { error } = await supabase.from("internal_transactions").insert(payload);
      if (error) throw error;
      toast.success("Internal transaction submitted");
      resetForm();
      loadTransactions();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReceiverDecision = async (tx: Tx, decision: "approved" | "declined") => {
    if (tx.target_teller_id !== currentTellerId) {
      toast.error("Only the receiving teller can approve or decline");
      return;
    }
    if (tx.receiver_decision !== "pending") {
      toast.error("Decision already made");
      return;
    }
    try {
      // status is system-managed — only send the receiver decision
      const { error } = await supabase
        .from("internal_transactions")
        .update({ receiver_decision: decision })
        .eq("id", tx.id)
        .eq("receiver_decision", "pending") // optimistic lock
        .eq("status", "pending"); // cannot edit finalised rows
      if (error) throw error;
      toast.success(
        decision === "approved" ? "Transaction approved" : "Transaction declined",
      );
      loadTransactions();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to update");
    }
  };

  const filtered = useMemo(
    () => (filter === "all" ? transactions : transactions.filter((t) => t.status === filter)),
    [transactions, filter],
  );

  const statusBadge = (s: TxStatus) => {
    const styles: Record<TxStatus, string> = {
      pending:
        "bg-[color-mix(in_oklab,var(--warning)_22%,transparent)] text-[oklch(0.45_0.13_75)]",
      approved:
        "bg-[color-mix(in_oklab,var(--success)_18%,transparent)] text-[var(--success)]",
      declined:
        "bg-[color-mix(in_oklab,var(--destructive)_18%,transparent)] text-[var(--destructive)]",
    };
    return (
      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${styles[s]}`}>
        {s}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Current teller selector */}
      <Card>
        <CardHeader>
          <CardTitle>Active Teller</CardTitle>
          <CardDescription>
            Select which teller you are operating as. Used to determine initiator and
            permissions for approving incoming requests.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-sm space-y-2">
            <Label>Current teller</Label>
            <Select value={currentTellerId} onValueChange={handleCurrentTellerChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select teller" />
              </SelectTrigger>
              <SelectContent>
                {tellers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Entry form */}
      <Card>
        <CardHeader>
          <CardTitle>Internal Transaction Entry</CardTitle>
          <CardDescription>
            Record a teller-to-teller fund movement. Requires dual approval.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="date">Date *</Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Teller (Recipient/Sender) *</Label>
                <Select value={targetId} onValueChange={setTargetId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select teller" />
                  </SelectTrigger>
                  <SelectContent>
                    {tellers
                      .filter((t) => t.id !== currentTellerId)
                      .map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.username}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Request Type *</Label>
                <Select
                  value={requestType}
                  onValueChange={(v) => setRequestType(v as RequestType)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inflow">Inflow</SelectItem>
                    <SelectItem value="outflow">Outflow</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount *</Label>
                <Input
                  id="amount"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Status is system-controlled. New entries start as <strong>pending</strong>.
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetForm}
                  disabled={submitting}
                >
                  Reset
                </Button>
                <Button type="submit" disabled={submitting || !currentTellerId}>
                  {submitting ? "Submitting..." : "Submit Transaction"}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Transactions table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Transactions</CardTitle>
            <CardDescription>All internal transactions and their status.</CardDescription>
          </div>
          <div className="w-44">
            <Select value={filter} onValueChange={(v) => setFilter(v as TxStatus | "all")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="declined">Declined</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Initiating</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                )}
                {!loading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No transactions
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((tx) => {
                  const isReceiver = tx.target_teller_id === currentTellerId;
                  const canDecide = isReceiver && tx.receiver_decision === "pending";
                  return (
                    <TableRow
                      key={tx.id}
                      className={
                        tx.status === "declined"
                          ? "bg-[color-mix(in_oklab,var(--destructive)_8%,transparent)]"
                          : tx.status === "approved"
                            ? "bg-[color-mix(in_oklab,var(--success)_8%,transparent)]"
                            : "bg-[color-mix(in_oklab,var(--warning)_8%,transparent)]"
                      }
                    >
                      <TableCell>{tx.date}</TableCell>
                      <TableCell>{tellerMap.get(tx.initiating_teller_id) ?? "—"}</TableCell>
                      <TableCell>{tellerMap.get(tx.target_teller_id) ?? "—"}</TableCell>
                      <TableCell className="capitalize">{tx.request_type}</TableCell>
                      <TableCell className="text-right font-medium">
                        {Number(tx.amount).toFixed(2)}
                      </TableCell>
                      <TableCell>{statusBadge(tx.status)}</TableCell>
                      <TableCell className="text-right">
                        {canDecide ? (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleReceiverDecision(tx, "approved")}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleReceiverDecision(tx, "declined")}
                            >
                              Decline
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {isReceiver ? `You: ${tx.receiver_decision}` : "—"}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
