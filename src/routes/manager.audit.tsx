import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getManagerAuditFeed } from "@/lib/manager-portal.functions";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/manager/audit")({ component: AuditFeed });

function AuditFeed() {
  const fetcher = useServerFn(getManagerAuditFeed);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetcher().then((r) => {
      setLogs(r.logs);
      setLoading(false);
    });
  }, [fetcher]);

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Manager Audit Log</h1>
        <p className="text-sm text-muted-foreground">All manager review and balancing actions.</p>
      </header>
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2 text-left text-[11px] uppercase tracking-wider text-muted-foreground">Time</th>
                  <th className="p-2 text-left text-[11px] uppercase tracking-wider text-muted-foreground">Action</th>
                  <th className="p-2 text-left text-[11px] uppercase tracking-wider text-muted-foreground">Manager</th>
                  <th className="p-2 text-left text-[11px] uppercase tracking-wider text-muted-foreground">Teller</th>
                  <th className="p-2 text-left text-[11px] uppercase tracking-wider text-muted-foreground">Amount</th>
                  <th className="p-2 text-left text-[11px] uppercase tracking-wider text-muted-foreground">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="p-2">{new Date(l.created_at).toLocaleString()}</td>
                    <td className="p-2">{l.action}</td>
                    <td className="p-2 font-mono text-xs">{l.actor_user_id?.slice(0, 8) ?? "—"}</td>
                    <td className="p-2 font-mono text-xs">{l.target_user_id?.slice(0, 8) ?? "—"}</td>
                    <td className="p-2">{l.amount ? `$${Number(l.amount).toFixed(2)}` : "—"}</td>
                    <td className="p-2 text-xs text-muted-foreground">{JSON.stringify(l.new_data ?? {})}</td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">No manager actions yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
