import { useAuth } from "@/contexts/AuthContext";
import { AdminProvider } from "@/contexts/AdminContext";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

export default function DashboardLayout() {
  const { user, loading } = useAuth();
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
    <AdminProvider realUserId={user.id}>
      <SidebarProvider>
        <div className="min-h-screen flex w-full">
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
