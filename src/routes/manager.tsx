import { createFileRoute, Outlet, Navigate, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { ManagerSidebar } from "@/components/manager/ManagerSidebar";

export const Route = createFileRoute("/manager")({
  component: ManagerLayout,
});

function ManagerLayout() {
  const { loading, isAdmin, hasRole } = useAuth();
  const location = useLocation();
  const fullPage = location.pathname.startsWith("/manager/teller/");
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!isAdmin && !hasRole("manager")) return <Navigate to="/" />;
  return (
    <div className="min-h-screen bg-background">
      {!fullPage && <ManagerSidebar />}
      <div className={fullPage ? "" : "pl-72 print:pl-0"}>
        <Outlet />
      </div>
    </div>
  );
}
