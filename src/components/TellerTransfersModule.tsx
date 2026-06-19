import { useEffect, useMemo, useState, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { useDayStatus } from "@/hooks/useDayStatus";
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
import { Textarea } from "@/components/ui/textarea";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Bell, Printer, FileDown, Search, Plus, CheckCircle2, XCircle, Ban } from "lucide-react";
import {
  listOpenTellers,
  listTransfers,
  requestTransfer,
  approveTransfer,
  rejectTransfer,
  cancelTransfer,
  type TellerTransfer,
  type TransferTeller,
  type TransferStatus,
} from "@/lib/teller-transfers.functions";

const deviceLabel = () =>
  typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : "unknown";

function StatusBadge({ s }: { s: TransferStatus }) {
  const map: Record<TransferStatus, string> = {
    pending: "bg-amber-100 text-amber-800 border-amber-200",
    approved: "bg-green-100 text-green-800 border-green-200",
    rejected: "bg-red-100 text-red-800 border-red-200",
    cancelled: "bg-gray-100 text-gray-700 border-gray-200",
  };
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${map[s]}`}>
      {s}
    </span>
  );
}

function fmtUsd(n: number) {
  return `$${n.toFixed(2)}`;
}
function fmtTs(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString();
}

export function TellerTransfersModule() {
  const { user } = useAuth();
  const uid = user?.id ?? "";
  const { dayOpenedAt } = useDayStatus(15000);

  const fetchTellers = useServerFn(listOpenTellers);
  const fetchTransfers = useServerFn(listTransfers);
  const requestFn = useServerFn(requestTransfer);
  const approveFn = useServerFn(approveTransfer);
  const rejectFn = useServerFn(rejectTransfer);
  const cancelFn = useServerFn(cancelTransfer);

  const [tellers, setTellers] = useState<TransferTeller[]>([]);
  const [transfers, setTransfers] = useState<TellerTransfer[]>([]);
  const [loading, setLoading] = useState(false);

  // Request modal
  const [openRequest, setOpenRequest] = useState(false);
  const [sendingUserId, setSendingUserId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Approve / reject modals
  const [approveTarget, setApproveTarget] = useState<TellerTransfer | null>(null);
  const [rejectTarget, setRejectTarget] = useState<TellerTransfer | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // Receipt modal
  const [receiptTarget, setReceiptTarget] = useState<TellerTransfer | null>(null);

  // Filters
  const [search, setSearch] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [t, x] = await Promise.all([fetchTellers(), fetchTransfers()]);
      setTellers(t);
      setTransfers(x);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [fetchTellers, fetchTransfers]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime — refresh on any teller_transfers change affecting this user
  useEffect(() => {
    const ch = supabase
      .channel("teller_transfers_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "teller_transfers" },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [refresh]);

  const pendingForMe = useMemo(
    () => transfers.filter((t) => t.status === "pending" && t.sending_user_id === uid),
    [transfers, uid],
  );

  const filterRows = (status: TransferStatus | "all") => {
    let rows = status === "all" ? transfers : transfers.filter((t) => t.status === status);
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (t) =>
          t.reference_code.toLowerCase().includes(q) ||
          (t.requesting_username ?? "").toLowerCase().includes(q) ||
          (t.sending_username ?? "").toLowerCase().includes(q) ||
          (t.reason ?? "").toLowerCase().includes(q),
      );
    }
    return rows;
  };

  const onSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!sendingUserId) return toast.error("Select the sending teller");
    if (!amt || amt <= 0) return toast.error("Enter a valid USD amount");
    if (!reason.trim()) return toast.error("Reason is required");
    setSubmitting(true);
    try {
      await requestFn({
        data: { sendingUserId, amount: amt, reason: reason.trim(), device: deviceLabel() },
      });
      toast.success("Transfer request sent for approval");
      setOpenRequest(false);
      setSendingUserId("");
      setAmount("");
      setReason("");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSubmitting(false);
    }
  };

  const onApprove = async () => {
    if (!approveTarget) return;
    setSubmitting(true);
    try {
      await approveFn({ data: { id: approveTarget.id, device: deviceLabel() } });
      toast.success("Transfer approved");
      setApproveTarget(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to approve");
    } finally {
      setSubmitting(false);
    }
  };

  const onReject = async () => {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) return toast.error("Reason required");
    setSubmitting(true);
    try {
      await rejectFn({
        data: { id: rejectTarget.id, reason: rejectReason.trim(), device: deviceLabel() },
      });
      toast.success("Transfer rejected");
      setRejectTarget(null);
      setRejectReason("");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reject");
    } finally {
      setSubmitting(false);
    }
  };

  const onCancel = async (tx: TellerTransfer) => {
    if (!confirm("Cancel this transfer request?")) return;
    try {
      await cancelFn({ data: { id: tx.id, device: deviceLabel() } });
      toast.success("Request cancelled");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to cancel");
    }
  };

  const exportPdf = () => {
    // Use browser print as a no-dependency PDF export
    window.print();
  };

  const renderTable = (rows: TellerTransfer[]) => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Reference</TableHead>
            <TableHead>Requested</TableHead>
            <TableHead>Requester</TableHead>
            <TableHead>Sender</TableHead>
            <TableHead className="text-right">USD Amount</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                No transfers
              </TableCell>
            </TableRow>
          )}
          {rows.map((t) => {
            const isSender = t.sending_user_id === uid;
            const isRequester = t.requesting_user_id === uid;
            const canDecide = isSender && t.status === "pending";
            const canCancel = isRequester && t.status === "pending";
            return (
              <TableRow key={t.id}>
                <TableCell className="font-mono text-xs">{t.reference_code}</TableCell>
                <TableCell className="text-xs">{fmtTs(t.requested_at)}</TableCell>
                <TableCell>{t.requesting_username ?? "—"}</TableCell>
                <TableCell>{t.sending_username ?? "—"}</TableCell>
                <TableCell className="text-right font-semibold">{fmtUsd(t.amount)}</TableCell>
                <TableCell className="max-w-[240px] truncate" title={t.reason ?? ""}>
                  {t.reason ?? "—"}
                </TableCell>
                <TableCell>
                  <StatusBadge s={t.status} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1.5">
                    {canDecide && (
                      <>
                        <Button size="sm" onClick={() => setApproveTarget(t)}>
                          Approve
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => setRejectTarget(t)}>
                          Reject
                        </Button>
                      </>
                    )}
                    {canCancel && (
                      <Button size="sm" variant="outline" onClick={() => onCancel(t)}>
                        <Ban className="mr-1 h-3 w-3" /> Cancel
                      </Button>
                    )}
                    {t.status === "approved" && (
                      <Button size="sm" variant="outline" onClick={() => setReceiptTarget(t)}>
                        <Printer className="mr-1 h-3 w-3" /> Receipt
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Internal Teller Transfers</h2>
          <p className="text-sm text-muted-foreground">
            Request cash from another teller. Transfers only complete after the sending teller approves.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportPdf}>
            <FileDown className="mr-2 h-4 w-4" /> Export / Print
          </Button>
          <Button onClick={() => setOpenRequest(true)}>
            <Plus className="mr-2 h-4 w-4" /> Request Transfer
          </Button>
        </div>
      </div>

      {/* Pending for me — notification widget */}
      {pendingForMe.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/60">
          <CardHeader className="flex flex-row items-center gap-3 space-y-0">
            <Bell className="h-5 w-5 text-amber-700" />
            <div>
              <CardTitle className="text-amber-900">
                {pendingForMe.length} pending transfer{pendingForMe.length > 1 ? "s" : ""} awaiting your approval
              </CardTitle>
              <CardDescription>You are the sending teller. Review and approve or reject.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>{renderTable(pendingForMe)}</CardContent>
        </Card>
      )}

      {/* All transfers, tabbed */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Transfer History</CardTitle>
            <CardDescription>Your sent requests and incoming approval requests.</CardDescription>
          </div>
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search reference, teller, reason"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="pending">
            <TabsList>
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="approved">Approved</TabsTrigger>
              <TabsTrigger value="rejected">Rejected</TabsTrigger>
              <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
            <TabsContent value="pending">{renderTable(filterRows("pending"))}</TabsContent>
            <TabsContent value="approved">{renderTable(filterRows("approved"))}</TabsContent>
            <TabsContent value="rejected">{renderTable(filterRows("rejected"))}</TabsContent>
            <TabsContent value="cancelled">{renderTable(filterRows("cancelled"))}</TabsContent>
            <TabsContent value="all">{renderTable(filterRows("all"))}</TabsContent>
          </Tabs>
          {loading && <p className="mt-3 text-xs text-muted-foreground">Refreshing…</p>}
        </CardContent>
      </Card>

      {/* Request modal */}
      <Dialog open={openRequest} onOpenChange={setOpenRequest}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Internal Transfer</DialogTitle>
            <DialogDescription>
              Send a request to another teller to outflow cash to you. Only the sending teller can approve.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmitRequest} className="space-y-4">
            <div className="space-y-2">
              <Label>Sending Teller (Outflow) *</Label>
              <Select value={sendingUserId} onValueChange={setSendingUserId}>
                <SelectTrigger>
                  <SelectValue placeholder={tellers.length ? "Select teller" : "No tellers on open day"} />
                </SelectTrigger>
                <SelectContent>
                  {tellers.map((t) => (
                    <SelectItem key={t.user_id} value={t.user_id}>
                      {t.username || t.display_name || t.user_id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Only tellers currently on an open day are listed.</p>
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Input value="USD" disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="amt">USD Amount *</Label>
              <Input
                id="amt"
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rsn">Reason / Narration *</Label>
              <Textarea
                id="rsn"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenRequest(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Sending…" : "Send Request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Approve modal */}
      <Dialog open={!!approveTarget} onOpenChange={(o) => !o && setApproveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Approve Transfer
            </DialogTitle>
            <DialogDescription>
              You will outflow <strong>{approveTarget ? fmtUsd(approveTarget.amount) : ""}</strong> USD to{" "}
              <strong>{approveTarget?.requesting_username}</strong>.
            </DialogDescription>
          </DialogHeader>
          {approveTarget && (
            <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
              <div>Reference: <span className="font-mono">{approveTarget.reference_code}</span></div>
              <div>Requested at: {fmtTs(approveTarget.requested_at)}</div>
              <div>Reason: {approveTarget.reason ?? "—"}</div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)}>
              Cancel
            </Button>
            <Button onClick={onApprove} disabled={submitting}>
              {submitting ? "Approving…" : "Confirm Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject modal */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && (setRejectTarget(null), setRejectReason(""))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-600" />
              Reject Transfer
            </DialogTitle>
            <DialogDescription>
              Provide a reason — this is recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for rejection"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            maxLength={500}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectTarget(null); setRejectReason(""); }}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onReject} disabled={submitting}>
              {submitting ? "Rejecting…" : "Confirm Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt modal */}
      <Dialog open={!!receiptTarget} onOpenChange={(o) => !o && setReceiptTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Transfer Receipt</DialogTitle>
          </DialogHeader>
          {receiptTarget && (
            <div id="transfer-receipt" className="space-y-2 rounded-md border p-4 text-sm">
              <div className="text-center">
                <p className="text-lg font-semibold">Authentic Financial Services</p>
                <p className="text-xs text-muted-foreground">Internal Teller Transfer</p>
              </div>
              <hr />
              <div className="flex justify-between"><span>Reference</span><span className="font-mono">{receiptTarget.reference_code}</span></div>
              <div className="flex justify-between"><span>From (Sender)</span><span>{receiptTarget.sending_username}</span></div>
              <div className="flex justify-between"><span>To (Requester)</span><span>{receiptTarget.requesting_username}</span></div>
              <div className="flex justify-between"><span>Amount</span><span className="font-semibold">{fmtUsd(receiptTarget.amount)} USD</span></div>
              <div className="flex justify-between"><span>Requested</span><span>{fmtTs(receiptTarget.requested_at)}</span></div>
              <div className="flex justify-between"><span>Approved</span><span>{fmtTs(receiptTarget.approved_at)}</span></div>
              <div><span className="text-muted-foreground">Reason:</span> {receiptTarget.reason ?? "—"}</div>
              <hr />
              <p className="text-center text-xs text-muted-foreground">System-generated. Both ledger entries linked by reference.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiptTarget(null)}>Close</Button>
            <Button onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
