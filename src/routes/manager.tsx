import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { ManagerSidebar } from "@/components/manager/ManagerSidebar";

export const Route = createFileRoute("/manager")({
  component: ManagerLayout,
});

function ManagerLayout() {
  const { loading, isAdmin, hasRole } = useAuth();
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
      <ManagerSidebar />
      <div className="pl-72 print:pl-0">
        <Outlet />
      </div>
    </div>
  );
}
