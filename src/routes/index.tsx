import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Smartphone,
  Clock,
  XCircle,
  TrendingUp,
  Wallet,
  Receipt,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { addDoc, collection, doc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebase";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

const stats = [
  { label: "Today's Payments", value: "$12,450.00", change: "+18%", icon: ArrowDownToLine, tone: "primary" },
  { label: "Today's Withdrawals", value: "$8,320.00", change: "+6%", icon: ArrowUpFromLine, tone: "gold" },
  { label: "Ecocash Internals", value: "$3,180.00", change: "+24%", icon: Smartphone, tone: "primary" },
  { label: "Cash on Hand", value: "$5,210.00", change: "Float", icon: Wallet, tone: "gold" },
];

const queues = [
  { label: "Pending", count: 4, icon: Clock, color: "warning" },
  { label: "Failed", count: 1, icon: XCircle, color: "destructive" },
  { label: "Completed", count: 38, icon: Receipt, color: "success" },
];

const recent = [
  { ref: "TX-10394", type: "Payment", client: "Tendai Moyo", amount: "+$340.00", time: "10:42", status: "Completed" },
  { ref: "TX-10393", type: "Withdrawal", client: "Rumbi Chикwa", amount: "-$120.00", time: "10:31", status: "Completed" },
  { ref: "TX-10392", type: "Ecocash", client: "0772 451 882", amount: "+$45.00", time: "10:18", status: "Pending" },
  { ref: "TX-10391", type: "Payment", client: "Brighton N.", amount: "+$1,200.00", time: "09:55", status: "Completed" },
  { ref: "TX-10390", type: "Withdrawal", client: "Faith S.", amount: "-$60.00", time: "09:40", status: "Failed" },
];

function Dashboard() {
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  return (
    <main className="min-h-screen pl-6 pr-4 md:pl-20 md:pr-10 py-8">
      {/* Header */}
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--gold)]">
            Teller Workstation
          </p>
          <h1 className="mt-1 text-3xl font-bold text-foreground md:text-4xl">
            Good day, Tafadzwa
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{today}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-success/15 px-3 py-1.5 text-xs font-medium text-success">
            <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
            Till open · Drawer #3
          </span>
          <button
            className="rounded-lg bg-[var(--gradient-primary)] px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-soft)] transition-transform hover:scale-[1.02]"
          >
            New Transaction
          </button>
        </div>
      </header>

      {/* Stat cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          const isGold = s.tone === "gold";
          return (
            <div
              key={s.label}
              className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-elegant)]"
            >
              <div className="flex items-start justify-between">
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                    isGold
                      ? "bg-[var(--gradient-gold)] text-gold-foreground"
                      : "bg-[var(--gradient-primary)] text-primary-foreground"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
                  <TrendingUp className="h-3 w-3" /> {s.change}
                </span>
              </div>
              <p className="mt-4 text-xs uppercase tracking-wider text-muted-foreground">
                {s.label}
              </p>
              <p className="mt-1 text-2xl font-bold text-foreground">{s.value}</p>
              <div
                aria-hidden
                className="absolute -bottom-12 -right-12 h-32 w-32 rounded-full bg-[var(--gold)] opacity-0 blur-3xl transition-opacity group-hover:opacity-20"
              />
            </div>
          );
        })}
      </section>

      {/* Queues + Recent */}
      <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Queues */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Transaction Queues
          </h2>
          {queues.map((q) => {
            const Icon = q.icon;
            return (
              <div
                key={q.label}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg bg-${q.color}/15 text-${q.color}`}
                    style={{
                      backgroundColor: `color-mix(in oklab, var(--${q.color}) 15%, transparent)`,
                      color: `var(--${q.color})`,
                    }}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{q.label}</p>
                    <p className="text-xs text-muted-foreground">Today</p>
                  </div>
                </div>
                <span className="text-2xl font-bold text-foreground">{q.count}</span>
              </div>
            );
          })}
        </div>

        {/* Recent transactions */}
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold text-foreground">
              Recent Transactions
            </h2>
            <button className="text-xs font-medium text-primary hover:underline">
              View all
            </button>
          </div>
          <div className="divide-y divide-border">
            {recent.map((t) => (
              <div
                key={t.ref}
                className="flex items-center justify-between px-5 py-3.5 transition-colors hover:bg-muted/50"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">{t.client}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.ref} · {t.type} · {t.time}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-sm font-bold ${
                      t.amount.startsWith("+") ? "text-success" : "text-foreground"
                    }`}
                  >
                    {t.amount}
                  </span>
                  <span
                    className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                    style={{
                      backgroundColor:
                        t.status === "Completed"
                          ? "color-mix(in oklab, var(--success) 18%, transparent)"
                          : t.status === "Pending"
                          ? "color-mix(in oklab, var(--warning) 22%, transparent)"
                          : "color-mix(in oklab, var(--destructive) 18%, transparent)",
                      color:
                        t.status === "Completed"
                          ? "var(--success)"
                          : t.status === "Pending"
                          ? "oklch(0.45 0.13 75)"
                          : "var(--destructive)",
                    }}
                  >
                    {t.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <p className="mt-10 text-center text-xs text-muted-foreground">
        Hover the left edge of the screen, or tap the gold button, to open the menu.
      </p>
    </main>
  );
}
