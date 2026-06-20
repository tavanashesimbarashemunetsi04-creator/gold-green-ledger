import { Outlet, Link, createRootRoute, HeadContent, Scripts, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { TellerSidebar } from "@/components/TellerSidebar";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { Toaster } from "@/components/ui/sonner";
import { AnnouncementGate } from "@/components/AnnouncementGate";


import appCss from "../styles.css?url";

const PUBLIC_ROUTES = new Set(["/login"]);

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const isPublic = PUBLIC_ROUTES.has(pathname);

  useEffect(() => {
    if (!loading && !user && !isPublic) {
      navigate({ to: "/login" });
    }
  }, [loading, user, isPublic, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (isPublic) return <>{children}</>;
  if (!user) return null;
  return <>{children}</>;
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Authentic Financial Services — Teller Portal" },
      { name: "description", content: "Daily transactions workstation for Authentic Financial Services tellers." },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function useInitTheme() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const apply = () => {
      let theme: "light" | "dark" | "system" = "system";
      try {
        const raw = localStorage.getItem("teller_prefs");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.theme) theme = parsed.theme;
        }
      } catch {
        /* ignore */
      }
      const isDark =
        theme === "dark" ||
        (theme === "system" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", isDark);
    };
    apply();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    window.addEventListener("storage", apply);
    return () => {
      mq.removeEventListener("change", apply);
      window.removeEventListener("storage", apply);
    };
  }, []);
}

function RootComponent() {
  useInitTheme();
  return (
    <AuthProvider>
      <AuthGate>
        <Shell />
      </AuthGate>
      <AnnouncementGate />
      <Toaster />
    </AuthProvider>

  );
}

function Shell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (PUBLIC_ROUTES.has(pathname)) {
    return <Outlet />;
  }
  // Full-screen routes (no sidebar) for focused workflows
  if (pathname === "/end-day") {
    return <Outlet />;
  }
  // Admin routes render their own layout (AdminSidebar) via /admin route
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return <Outlet />;
  }
  // Manager portal renders its own layout (ManagerSidebar) via /manager route
  if (pathname === "/manager" || pathname.startsWith("/manager/")) {
    return <Outlet />;
  }
  return (
    <div className="min-h-screen bg-background">
      <TellerSidebar />
      <div className="pl-72">
        <Outlet />
      </div>
    </div>
  );
}
