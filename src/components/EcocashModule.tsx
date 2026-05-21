import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";

type TxType = "inflow" | "outflow";
type Source = "manual_entry" | "internal_transaction";

type EcocashTx = {
  id: string;
  description: string;
  amount: number;
  transaction_type: TxType;
  inflow_amount: number;
  outflow_amount: number;
  source: Source;
  created_by: string | null;
  created_by_label: string | null;
  imported_transaction_id: string | null;
  imported_at: string | null;
  created_at: string;
};

type FilterKind = "all" | "inflows" | "outflows" | "imported" | "manual";

const fmt = (n: number) =>
  n ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";

export function EcocashModule() {
  const { user } = useAuth();
  const [rows, setRows] = useState<EcocashTx[]>([]);
  const [loading, setLoading] = useState(false);

  // form
  const [txDate, setTxDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [txType, setTxType] = useState<TxType | "">("");
  const [submitting, setSubmitting] = useState(false);

  // filters
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [kind, setKind] = useState<FilterKind>("all");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("ecocash_transactions")
      .select("*")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast.error("Failed to load Ecocash transactions");
      return;
    }
    setRows((data ?? []) as EcocashTx[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const ch = supabase
      .channel("ecocash_tx_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ecocash_transactions" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const desc = description.trim();
    const amt = Number(amount);
    if (!txDate) return toast.error("Date is required");
    if (!desc) return toast.error("Description is required");
    if (!txType) return toast.error("Select a transaction type");
    if (!Number.isFinite(amt) || amt <= 0)
      return toast.error("Amount must be greater than 0");

    try {
      setSubmitting(true);
      const { error } = await supabase.from("ecocash_transactions").insert({
        description: desc,
        amount: amt,
        transaction_type: txType,
        source: "manual_entry",
        created_by: user?.id ?? null,
        created_by_label: user?.email ?? "manual",
        created_at: new Date(txDate).toISOString(),
      });
      if (error) throw error;
      toast.success("Transaction added");
      setTxDate(new Date().toISOString().slice(0, 10));
      setDescription("");
      setAmount("");
      setTxType("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add transaction");
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.description.toLowerCase().includes(q) &&
          !(r.created_by_label ?? "").toLowerCase().includes(q)) return false;
      if (dateFilter && !r.created_at.startsWith(dateFilter)) return false;
      if (kind === "inflows" && r.transaction_type !== "inflow") return false;
      if (kind === "outflows" && r.transaction_type !== "outflow") return false;
      if (kind === "imported" && r.source !== "internal_transaction") return false;
      if (kind === "manual" && r.source !== "manual_entry") return false;
      return true;
    });
  }, [rows, search, dateFilter, kind]);

  const totals = useMemo(() => {
    const inflow = filtered.reduce((s, r) => s + Number(r.inflow_amount || 0), 0);
    const outflow = filtered.reduce((s, r) => s + Number(r.outflow_amount || 0), 0);
    return { inflow, outflow, net: inflow - outflow };
  }, [filtered]);

  return (
    <div className="space-y-6">
      {/* Entry form */}
      <Card>
        <CardHeader>
          <CardTitle>Add Ecocash Transaction</CardTitle>
          <CardDescription>Record a manual inflow or outflow.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
            <div className="space-y-2">
              <Label htmlFor="tx-date">Date *</Label>
              <Input
                id="tx-date"
                type="date"
                value={txDate}
                onChange={(e) => setTxDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label htmlFor="desc">Description *</Label>
              <Input
                id="desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Airtime top-up"
                maxLength={200}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="amt">Amount *</Label>
              <Input
                id="amt"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Transaction Type *</Label>
              <Select value={txType} onValueChange={(v) => setTxType(v as TxType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inflow">Inflow</SelectItem>
                  <SelectItem value="outflow">Outflow</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Adding..." : "Add Transaction"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Trial balance */}
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-1">
            <CardTitle>Trial Balance</CardTitle>
            <CardDescription>
              Manual entries plus auto-imported approved internal transactions flagged as Ecocash-related.
            </CardDescription>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search description / user"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
            <Select value={kind} onValueChange={(v) => setKind(v as FilterKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="inflows">Inflows</SelectItem>
                <SelectItem value="outflows">Outflows</SelectItem>
                <SelectItem value="imported">Imported</SelectItem>
                <SelectItem value="manual">Manual entries</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => {
                setSearch(""); setDateFilter(""); setKind("all");
              }}
            >
              Clear filters
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Inflows</TableHead>
                  <TableHead className="text-right">Outflows</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Added By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">Loading...</TableCell>
                  </TableRow>
                )}
                {!loading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">No transactions</TableCell>
                  </TableRow>
                )}
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">
                      {new Date(r.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>{r.description}</TableCell>
                    <TableCell className="text-right font-medium text-[var(--success,green)]">
                      {fmt(Number(r.inflow_amount))}
                    </TableCell>
                    <TableCell className="text-right font-medium text-[var(--destructive,red)]">
                      {fmt(Number(r.outflow_amount))}
                    </TableCell>
                    <TableCell>
                      {r.source === "internal_transaction" ? (
                        <Badge variant="secondary">Imported</Badge>
                      ) : (
                        <Badge>Manual</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {r.created_by_label ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2} className="font-semibold">Totals</TableCell>
                  <TableCell className="text-right font-semibold">{fmt(totals.inflow)}</TableCell>
                  <TableCell className="text-right font-semibold">{fmt(totals.outflow)}</TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
                <TableRow>
                  <TableCell colSpan={4} className="text-right font-semibold">
                    Net Balance
                  </TableCell>
                  <TableCell
                    colSpan={2}
                    className={`font-bold ${totals.net >= 0 ? "text-[var(--success,green)]" : "text-[var(--destructive,red)]"}`}
                  >
                    {fmt(totals.net)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
