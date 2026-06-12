import logoMark from "@/assets/logo-mark.png";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { useDashboardState } from "@/hooks/useDashboardState";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard,
  ArrowDownToLine,
  ArrowUpFromLine,
  Smartphone,
  Repeat,
  RefreshCcw,
  Clock,
  XCircle,
  FileBarChart,
  UserCircle2,
  Settings as SettingsIcon,
  LogOut,
  ShieldCheck,
  Lock,
} from "lucide-react";

const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, requiresDay: false },
  { title: "My Float", url: "/teller-float", icon: ShieldCheck, requiresDay: false },
  { title: "Payments", url: "/payments", icon: ArrowDownToLine, requiresDay: true },
  { title: "Withdrawals", url: "/withdrawals", icon: ArrowUpFromLine, requiresDay: true },
  { title: "Ecocash", url: "/ecocash", icon: Smartphone, requiresDay: true },
  { title: "Internal Transactions", url: "/internal-transactions", icon: Repeat, requiresDay: true },
  { title: "Changes and Refunds", url: "/changes-refunds", icon: RefreshCcw, requiresDay: true },
  { title: "Pending", url: "/pending", icon: Clock, requiresDay: false },
  { title: "Failed", url: "/failed", icon: XCircle, requiresDay: false },
  { title: "End Day Summary", url: "/end-day", icon: FileBarChart, requiresDay: false },
  { title: "My Account", url: "/account", icon: UserCircle2, requiresDay: false },
  { title: "Settings", url: "/settings", icon: SettingsIcon, requiresDay: false },
];

export const SIDEBAR_WIDTH = "18rem";

export function TellerSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { user, roles, isAdmin, isFinanceManager, signOut } = useAuth();
  const { isDayOpen, isEcocashMode } = useDashboardState(20000);
  const primaryRole = roles.includes("admin")
    ? "admin"
    : roles.includes("finance_manager")
      ? "finance_manager"
      : roles.includes("manager")
        ? "manager"
        : roles[0] ?? "teller";

  // Pending transfer-approval count for current teller
  const [pendingTransferCount, setPendingTransferCount] = useState(0);
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const fetchCount = async () => {
      const { count } = await supabase
        .from("teller_transfers")
        .select("id", { count: "exact", head: true })
        .eq("sending_user_id", user.id)
        .eq("status", "pending");
      if (!cancelled) setPendingTransferCount(count ?? 0);
    };
    fetchCount();
    const ch = supabase
      .channel("sidebar_teller_transfers")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "teller_transfers" },
        () => fetchCount(),
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [user?.id]);


  return (
    <aside
      style={{
        background: "var(--gradient-hero)",
        color: "var(--sidebar-fg)",
        width: SIDEBAR_WIDTH,
      }}
      className="fixed left-0 top-0 z-40 h-screen shadow-[var(--shadow-elegant)]"
    >
      <div className="flex h-full flex-col">
        {/* Brand */}
        <div className="border-b border-white/10 px-6 py-6">
          <div className="flex items-center gap-3">
            <img src={logoMark} alt="Authentic Financial Services" className="h-14 w-14 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.4)]" />
            <div>
              <p className="text-xs uppercase tracking-widest text-[var(--gold)]">
                Teller Portal
              </p>
              <h1 className="text-base font-semibold leading-tight">
                Authentic Financial<br />Services
              </h1>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {items.map((item) => {
              const active = pathname === item.url;
              const Icon = item.icon;
              const ecocashLocked = isEcocashMode && !isAdmin && [
                "/payments", "/withdrawals",
                "/changes-refunds", "/end-day",
              ].includes(item.url);
              const locked = ecocashLocked || (item.requiresDay && !isDayOpen && !isEcocashMode && !isAdmin);
              const cls = `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                active
                  ? "bg-[var(--gold)] text-gold-foreground shadow-[var(--shadow-gold)]"
                  : locked
                    ? "cursor-not-allowed text-white/30"
                    : "text-white/80 hover:bg-white/10 hover:text-white"
              }`;
              return (
                <li key={item.url}>
                  {locked ? (
                    <div
                      className={cls}
                      title={
                        ecocashLocked
                          ? "Locked: EcoCash Day is open"
                          : "Open your operational day to transact"
                      }
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.title}</span>
                      <Lock className="ml-auto h-3 w-3" />
                    </div>
                  ) : (
                    <Link to={item.url} className={cls}>
                      <Icon className="h-4 w-4" />
                      <span>{item.title}</span>
                      {item.url === "/internal-transactions" && pendingTransferCount > 0 && (
                        <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                          {pendingTransferCount}
                        </span>
                      )}
                      {active && item.url !== "/internal-transactions" && <span className="ml-auto h-2 w-2 rounded-full bg-[var(--primary)]" />}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer */}
        <div className="border-t border-white/10 p-4">
          {(isAdmin || isFinanceManager) && (
            <Link
              to="/admin"
              className="mb-2 flex items-center gap-3 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
            >
              <ShieldCheck className="h-4 w-4" />
              {isAdmin ? "Open Admin Portal" : "Open Finance Portal"}
            </Link>
          )}
          {(roles.includes("manager") || isAdmin) && (
            <Link
              to="/manager"
              className="mb-2 flex items-center gap-3 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
            >
              <ShieldCheck className="h-4 w-4" />
              Open Manager Portal
            </Link>
          )}
          {user && (
            <div className="mb-3 px-1">
              <p className="truncate text-xs text-white/60">{user.email}</p>
              <p className="text-[10px] uppercase tracking-widest text-[var(--gold)]">{primaryRole}</p>
            </div>
          )}
          <button
            onClick={async () => {
              await signOut();
              navigate({ to: "/login" });
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
          <p className="mt-3 px-1 text-xs text-white/40">
            v1.0 · Teller workstation
          </p>
        </div>
      </div>
    </aside>
  );
}
