import { useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ArrowDownToLine,
  ArrowUpFromLine,
  Smartphone,
  Clock,
  XCircle,
  FileBarChart,
  UserCircle2,
  Settings as SettingsIcon,
  Menu,
  LogOut,
} from "lucide-react";

const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Payments", url: "/payments", icon: ArrowDownToLine },
  { title: "Withdrawals", url: "/withdrawals", icon: ArrowUpFromLine },
  { title: "Ecocash Internals", url: "/ecocash", icon: Smartphone },
  { title: "Pending", url: "/pending", icon: Clock },
  { title: "Failed", url: "/failed", icon: XCircle },
  { title: "End Day Summary", url: "/end-day", icon: FileBarChart },
  { title: "My Account", url: "/account", icon: UserCircle2 },
  { title: "Settings", url: "/settings", icon: SettingsIcon },
];

export function TellerSidebar() {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (e.clientX <= 16) setOpen(true);
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const handleLeave = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 200);
  };
  const handleEnter = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
  };

  return (
    <>
      {/* Edge hint strip */}
      <div
        aria-hidden
        className="fixed left-0 top-0 z-30 h-screen w-2 bg-gradient-to-b from-[var(--gold)] via-[var(--primary)] to-[var(--gold)] opacity-70"
      />

      {/* Floating menu trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed left-4 top-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--gradient-gold)] text-gold-foreground shadow-[var(--shadow-gold)] transition-transform hover:scale-105"
        aria-label="Toggle menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-30 bg-black/40 backdrop-blur-sm transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Off-canvas panel */}
      <aside
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        style={{
          background: "var(--gradient-hero)",
          color: "var(--sidebar-fg)",
        }}
        className={`fixed left-0 top-0 z-40 h-screen w-72 transform shadow-[var(--shadow-elegant)] transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
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
            <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white">
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
            <p className="mt-3 px-1 text-xs text-white/40">
              v1.0 · Teller workstation
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
