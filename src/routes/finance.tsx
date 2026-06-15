import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { FinanceSidebar } from "@/components/FinanceSidebar";

export const Route = createFileRoute("/finance")({
  component: FinanceLayout,
});

function FinanceLayout() {
  const { loading, isAdmin, isFinanceManager } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!isAdmin && !isFinanceManager) return <Navigate to="/" />;
  return (
    <div className="min-h-screen bg-background">
      <FinanceSidebar />
      <div className="pl-72">
        <Outlet />
      </div>
    </div>
  );
}
