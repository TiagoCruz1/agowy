import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { useAdminContext } from "@/contexts/AdminContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  Calendar,
  Users,
  Scissors,
  Clock,
  Ban,
  Settings,
  LogOut,
  Sparkles,
  MessageCircle,
  Star,
  Wrench,
  Shield,
  DollarSign,
  ArrowLeftRight,
  X,
  UserCog,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export function AppSidebar() {
  const { signOut } = useAuth();
  const { isAdmin, isStudioOwner } = useUserRole();
  const { impersonatedUser, setImpersonatedUser } = useAdminContext();
  const location = useLocation();

  const { data: allProfiles = [] } = useQuery({
    queryKey: ["admin-all-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, account_type, business_name")
        .order("full_name");
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  const { data: allRoles = [] } = useQuery({
    queryKey: ["admin-all-roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, role");
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  const nonAdminProfiles = allProfiles.filter((p: any) => 
    !allRoles.some((r: any) => r.user_id === p.user_id && r.role === "admin")
  );

  const { isManicure } = useUserRole();
  const staffItem = isStudioOwner ? [{ title: "Funcionários", url: "/dashboard/staff", icon: UserCog }] : [];

  const allMenuItems = [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, showManicure: true },
    { title: "Agendamentos", url: "/dashboard/appointments", icon: Calendar, showManicure: true },
    { title: "Clientes", url: "/dashboard/clients", icon: Users, showManicure: true },
    { title: "Serviços", url: "/dashboard/services", icon: Scissors, showManicure: true },
    { title: "Horários", url: "/dashboard/working-hours", icon: Clock, showManicure: true },
    { title: "Bloqueios", url: "/dashboard/blocks", icon: Ban, showManicure: true },
    { title: "Faturamento", url: "/dashboard/financial", icon: DollarSign, showManicure: true },
    { title: "Manutenção", url: "/dashboard/maintenance", icon: Wrench, showManicure: true },
    { title: "Avaliações", url: "/dashboard/reviews", icon: Star, showManicure: false },
    { title: "WhatsApp", url: "/dashboard/whatsapp", icon: MessageCircle, showManicure: false },
    { title: "Configurações", url: "/dashboard/settings", icon: Settings, showManicure: false },
    ...staffItem.map(s => ({ ...s, showManicure: false })),
  ];

  const menuItems = isManicure
    ? allMenuItems.filter(item => item.showManicure)
    : allMenuItems;

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg" style={{ fontFamily: "'Playfair Display', serif" }}>
            NailBook
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {/* Admin impersonation */}
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center gap-1">
              <ArrowLeftRight className="w-3 h-3" />
              Trocar Visão
            </SidebarGroupLabel>
            <SidebarGroupContent className="px-2">
              {impersonatedUser ? (
                <div className="bg-primary/10 rounded-lg p-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-primary">Visualizando como:</span>
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setImpersonatedUser(null)}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                  <p className="text-sm font-semibold">{impersonatedUser.fullName}</p>
                  {impersonatedUser.businessName && (
                    <p className="text-xs text-muted-foreground">{impersonatedUser.businessName}</p>
                  )}
                  <Badge variant="outline" className="text-[10px]">
                    {impersonatedUser.accountType === "studio" ? "Estúdio" : "Solo"}
                  </Badge>
                </div>
              ) : (
                <Select onValueChange={(userId) => {
                  const profile = nonAdminProfiles.find((p: any) => p.user_id === userId);
                  if (profile) {
                    setImpersonatedUser({
                      userId: profile.user_id,
                      fullName: profile.full_name,
                      accountType: profile.account_type,
                      businessName: profile.business_name || undefined,
                    });
                  }
                }}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Selecionar estúdio/manicure..." />
                  </SelectTrigger>
                  <SelectContent>
                    {nonAdminProfiles.map((p: any) => (
                      <SelectItem key={p.user_id} value={p.user_id}>
                        {p.full_name} {p.business_name ? `(${p.business_name})` : ""} — {p.account_type === "studio" ? "Estúdio" : "Solo"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === item.url}
                  >
                    <Link to={item.url}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Administração</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === "/dashboard/admin"}
                  >
                    <Link to="/dashboard/admin">
                      <Shield className="w-4 h-4" />
                      <span>Painel Admin</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="p-4">
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-muted-foreground"
          onClick={signOut}
        >
          <LogOut className="w-4 h-4" />
          Sair
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
