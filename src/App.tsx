import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import DashboardLayout from "./layouts/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import Clients from "./pages/Clients";
import Services from "./pages/Services";
import Appointments from "./pages/Appointments";
import WorkingHours from "./pages/WorkingHours";
import Blocks from "./pages/Blocks";
import WhatsAppConfig from "./pages/WhatsAppConfig";
import SettingsPage from "./pages/Settings";
import Admin from "./pages/Admin";
import Reviews from "./pages/Reviews";
import Maintenance from "./pages/Maintenance";
import Financial from "./pages/Financial";
import Staff from "./pages/Staff";
import Payments from "./pages/Payments";
import AdminTiago from "./pages/AdminTiago";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/dashboard" element={<DashboardLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="clients" element={<Clients />} />
              <Route path="services" element={<Services />} />
              <Route path="appointments" element={<Appointments />} />
              <Route path="working-hours" element={<WorkingHours />} />
              <Route path="blocks" element={<Blocks />} />
              <Route path="whatsapp" element={<WhatsAppConfig />} />
              <Route path="ai-settings" element={<Navigate to="/dashboard/settings" replace />} />
              <Route path="reviews" element={<Reviews />} />
              <Route path="financial" element={<Financial />} />
              <Route path="maintenance" element={<Maintenance />} />
              <Route path="admin" element={<Admin />} />
              <Route path="staff" element={<Staff />} />
              <Route path="payments" element={<Payments />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
            <Route path="/admin-tiago" element={<AdminTiago />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
