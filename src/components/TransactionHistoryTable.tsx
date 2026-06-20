import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/supabase";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export type HistoryColumn<T = Record<string, unknown>> = {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  render?: (row: T) => React.ReactNode;
};

interface Props<T extends Record<string, unknown>> {
  table: string;
  columns: HistoryColumn<T>[];
  dayOpenedAt: string | null;
  /** Extra equality filters (e.g. { bank: 'ZB' }). */
  match?: Record<string, string | number>;
  /** Card title override */
  title?: string;
  description?: string;
  /** Bumped by parent after a successful insert to force a refresh. */
  refreshKey?: number;
  /** Optional client-side filter applied after fetch. */
  clientFilter?: (row: T) => boolean;
}

export function TransactionHistoryTable<T extends Record<string, unknown> & { id: string; created_at: string }>(
  { table, columns, dayOpenedAt, match, title = "Transaction History", description, refreshKey = 0, clientFilter }: Props<T>,
) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const matchKey = JSON.stringify(match ?? {});

  const load = useCallback(async () => {
    if (!dayOpenedAt) {
      setRows([]);
      return;
    }
    setLoading(true);
    let q = (supabase.from(table as never) as any).select("*")
      .gte("created_at", dayOpenedAt)
      .order("created_at", { ascending: false });
    if (match) {
      for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
    }
    const { data, error } = await q;
    setLoading(false);
    if (error) {
      console.error(`Failed to load ${table} history`, error);
      return;
    }
    setRows(((data ?? []) as unknown) as T[]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, dayOpenedAt, matchKey, refreshKey]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!dayOpenedAt) return;
    const ch = supabase
      .channel(`hist_${table}_${matchKey}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, dayOpenedAt, matchKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => (clientFilter ? clientFilter(r) : true))
      .filter((r) => {
        if (!q) return true;
        return columns.some((c) => {
          const v = c.render ? "" : String((r as Record<string, unknown>)[c.key] ?? "");
          if (v.toLowerCase().includes(q)) return true;
          // fallback: stringify the row for search across rendered columns
          return JSON.stringify(r).toLowerCase().includes(q);
        });
      });
  }, [rows, search, columns, clientFilter]);

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>
            {description ?? "Transactions saved during the current open day. Newest first."}
          </CardDescription>
        </div>
        <div className="w-64">
          <Input
            placeholder="Search history…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </CardHeader>
      <CardContent>
        {!dayOpenedAt ? (
          <p className="text-sm text-muted-foreground">No open day — history will appear here once you open your day.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transaction Date</TableHead>
                  <TableHead>Transaction Time</TableHead>
                  {columns.map((c) => (
                    <TableHead key={c.key} className={c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : ""}>
                      {c.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={columns.length + 2} className="text-center text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                )}
                {!loading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={columns.length + 2} className="text-center text-muted-foreground">
                      No transactions yet for the current open day.
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((row) => {
                  const d = new Date(row.created_at);
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap">{d.toLocaleDateString()}</TableCell>
                      <TableCell className="whitespace-nowrap">{d.toLocaleTimeString()}</TableCell>
                      {columns.map((c) => (
                        <TableCell
                          key={c.key}
                          className={c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : ""}
                        >
                          {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? "—")}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
