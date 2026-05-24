import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { useDashboardState } from "@/hooks/useDashboardState";
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
  const primaryRole = roles.includes("admin")
    ? "admin"
    : roles.includes("finance_manager")
      ? "finance_manager"
      : roles.includes("manager")
        ? "manager"
        : roles[0] ?? "teller";

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
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--gradient-gold)] font-bold text-gold-foreground shadow-[var(--shadow-gold)]">
              A
            </div>
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
              return (
                <li key={item.url}>
                  <Link
                    to={item.url}
                    className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                      active
                        ? "bg-[var(--gold)] text-gold-foreground shadow-[var(--shadow-gold)]"
                        : "text-white/80 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.title}</span>
                    {active && (
                      <span className="ml-auto h-2 w-2 rounded-full bg-[var(--primary)]" />
                    )}
                  </Link>
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
