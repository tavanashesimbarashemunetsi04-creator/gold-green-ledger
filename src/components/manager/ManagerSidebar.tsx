import logoMark from "@/assets/logo-mark.png";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { LayoutDashboard, Scale, ScrollText, ArrowLeftRight, LogOut } from "lucide-react";

const items = [
  { title: "Dashboard", url: "/manager", icon: LayoutDashboard, exact: true },
  { title: "Balancing", url: "/manager/balancing", icon: Scale },
  { title: "Audit Logs", url: "/manager/audit", icon: ScrollText },
];

export const MANAGER_SIDEBAR_WIDTH = "18rem";

export function ManagerSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  return (
    <aside
      style={{
        background: "var(--gradient-hero)",
        color: "var(--sidebar-fg)",
        width: MANAGER_SIDEBAR_WIDTH,
      }}
      className="fixed left-0 top-0 z-40 h-screen shadow-[var(--shadow-elegant)] print:hidden"
    >
      <div className="flex h-full flex-col">
        <div className="border-b border-white/10 px-6 py-6">
          <div className="flex items-center gap-3">
            <img src={logoMark} alt="AFS" className="h-14 w-14 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.4)]" />
            <div>
              <p className="text-xs uppercase tracking-widest text-[var(--gold)]">Manager Portal</p>
              <h1 className="text-base font-semibold leading-tight">
                Authentic Financial<br />Services
              </h1>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {items.map((item) => {
              const active = item.exact ? pathname === item.url : pathname.startsWith(item.url);
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
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-white/10 p-4 space-y-2">
          <Link
            to="/"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ArrowLeftRight className="h-4 w-4" />
            Switch to Teller Portal
          </Link>
          {user && (
            <div className="px-1">
              <p className="truncate text-xs text-white/60">{user.email}</p>
              <p className="text-[10px] uppercase tracking-widest text-[var(--gold)]">manager</p>
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
        </div>
      </div>
    </aside>
  );
}
