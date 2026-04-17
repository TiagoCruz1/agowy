import { useAuth } from "@/contexts/AuthContext";
import { AdminProvider } from "@/contexts/AdminContext";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

export default function DashboardLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const impersonating = sessionStorage.getItem("admin_impersonate");
  const impersonateData = impersonating ? JSON.parse(impersonating) : null;
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return (
    <AdminProvider realUserId={user.id} initialImpersonateUserId={impersonateData?.userId || null} initialImpersonateName={impersonateData?.name || null}>
      <SidebarProvider>
        {impersonateData && (
          <div className="bg-destructive text-destructive-foreground text-xs px-4 py-2 flex items-center justify-between fixed top-0 left-0 right-0 z-50">
            <span>👁 Visualizando como: <strong>{impersonateData.name}</strong></span>
            <button className="underline font-medium" onClick={() => { sessionStorage.removeItem("admin_impersonate"); navigate("/admin-tiago"); }}>
              ← Voltar ao Admin
            </button>
          </div>
        )}
        <div className={`min-h-screen flex w-full ${impersonateData ? "mt-8" : ""}`}>
          <AppSidebar />
          <main className="flex-1 overflow-auto">
            <div className="p-4 md:p-6 lg:p-8">
              <div className="md:hidden mb-4">
                <SidebarTrigger />
              </div>
              <Outlet />
            </div>
          </main>
        </div>
      </SidebarProvider>
    </AdminProvider>
  );
}
