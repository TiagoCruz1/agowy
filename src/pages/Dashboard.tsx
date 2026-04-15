import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Calendar, Users, CheckCircle, Clock, TrendingUp, Scissors, Building2 } from "lucide-react";
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth } from "date-fns";
import { formatBrasilia } from "@/lib/utils";
import { ptBR } from "date-fns/locale";

export default function Dashboard() {
  const { user } = useAuth();
  const { isStudioOwner, profile } = useUserRole();
  const { effectiveUserId, isImpersonating } = useEffectiveUser();
  const userId = effectiveUserId || user?.id;
  const today = new Date();

  // Get the effective user's profile
  const { data: effectiveProfile } = useQuery({
    queryKey: ["effective-profile", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!userId && isImpersonating,
  });

  const activeProfile = isImpersonating ? effectiveProfile : profile;
  const isEffectiveStudio = isImpersonating 
    ? effectiveProfile?.account_type === "studio" 
    : isStudioOwner;

  // Check if this user is a manicure linked to a studio
  const { data: studioInfo } = useQuery({
    queryKey: ["manicure-studio-info", userId],
    queryFn: async () => {
      const { data: prof } = await supabase
        .from("profiles")
        .select("id, studio_id")
        .eq("user_id", userId!)
        .single();
      if (!prof?.studio_id) return null;
      const { data: studio } = await supabase
        .from("profiles")
        .select("full_name, business_name")
        .eq("id", prof.studio_id)
        .single();
      return studio;
    },
    enabled: !!userId,
  });

  const { data: todayAppointments = [] } = useQuery({
    queryKey: ["appointments-today", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, clients(full_name), services(name)")
        .eq("user_id", userId!)
        .gte("start_at", startOfDay(today).toISOString())
        .lte("start_at", endOfDay(today).toISOString())
        .neq("status", "cancelled")
        .order("start_at");
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const { data: monthStats } = useQuery({
    queryKey: ["month-stats", userId],
    queryFn: async () => {
      const start = startOfMonth(today).toISOString();
      const end = endOfMonth(today).toISOString();

      const { count: totalMonth } = await supabase
        .from("appointments")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId!)
        .gte("start_at", start)
        .lte("start_at", end)
        .neq("status", "cancelled");

      const { count: completedMonth } = await supabase
        .from("appointments")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId!)
        .eq("status", "completed")
        .gte("start_at", start)
        .lte("start_at", end);

      const { count: totalClients } = await supabase
        .from("clients")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId!)
        .eq("is_active", true);

      const { data: revenue } = await supabase
        .from("appointments")
        .select("price")
        .eq("user_id", userId!)
        .eq("status", "completed")
        .gte("start_at", start)
        .lte("start_at", end);

      const totalRevenue = (revenue || []).reduce((sum, a) => sum + (a.price || 0), 0);

      return {
        totalMonth: totalMonth || 0,
        completedMonth: completedMonth || 0,
        totalClients: totalClients || 0,
        totalRevenue,
      };
    },
    enabled: !!userId,
  });

  // Studio manicures
  const { data: studioManicures = [] } = useQuery({
    queryKey: ["studio-manicures-dashboard", userId],
    queryFn: async () => {
      const { data: prof } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", userId!)
        .single();
      if (!prof) return [];
      const { data } = await supabase
        .from("studio_manicures")
        .select("manicure_user_id, is_active")
        .eq("studio_profile_id", prof.id);
      if (!data || data.length === 0) return [];
      const userIds = data.map((d: any) => d.manicure_user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, phone")
        .in("user_id", userIds);
      return (profiles || []).map((p: any) => ({
        ...p,
        is_active: data.find((d: any) => d.manicure_user_id === p.user_id)?.is_active ?? true,
      }));
    },
    enabled: !!userId && isEffectiveStudio,
  });

  // Studio total revenue (for studio owner)
  const { data: studioTotalRevenue } = useQuery({
    queryKey: ["studio-total-revenue", userId],
    queryFn: async () => {
      const { data: prof } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", userId!)
        .single();
      if (!prof) return 0;
      const { data: links } = await supabase
        .from("studio_manicures")
        .select("manicure_user_id")
        .eq("studio_profile_id", prof.id);
      if (!links || links.length === 0) return 0;
      const manicureUserIds = links.map((l: any) => l.manicure_user_id);
      const { data: manicureProfiles } = await supabase
        .from("profiles")
        .select("id, user_id")
        .in("user_id", manicureUserIds);
      const manicureProfileIds = (manicureProfiles || []).map((profile: any) => profile.id);
      
      const start = startOfMonth(today).toISOString();
      const end = endOfMonth(today).toISOString();
      
      let total = 0;
      for (const manicureId of manicureProfileIds) {
        const { data: rev } = await supabase
          .from("appointments")
          .select("price")
          .eq("manicure_id", manicureId)
          .eq("status", "completed")
          .gte("start_at", start)
          .lte("start_at", end);
        total += (rev || []).reduce((sum, a) => sum + (a.price || 0), 0);
      }
      return total;
    },
    enabled: !!userId && isEffectiveStudio,
  });

  const displayName = activeProfile?.business_name || activeProfile?.full_name || "Dashboard";

  const stats = [
    {
      title: "Agendamentos Hoje",
      value: todayAppointments.length,
      icon: Calendar,
      color: "text-primary",
    },
    {
      title: "Clientes Ativos",
      value: monthStats?.totalClients || 0,
      icon: Users,
      color: "text-accent",
    },
    {
      title: "Atendimentos no Mês",
      value: monthStats?.completedMonth || 0,
      icon: CheckCircle,
      color: "text-success",
    },
    {
      title: "Meu Faturamento",
      value: `R$ ${(monthStats?.totalRevenue || 0).toFixed(2)}`,
      icon: TrendingUp,
      color: "text-primary",
      subtitle: "Apenas concluídos",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{displayName}</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-muted-foreground">
            {format(today, "EEEE, d 'de' MMMM", { locale: ptBR })}
          </p>
          {isEffectiveStudio && <Badge variant="outline">Estúdio</Badge>}
          {studioInfo && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              {studioInfo.business_name || studioInfo.full_name}
            </Badge>
          )}
          {isImpersonating && <Badge variant="destructive" className="text-[10px]">Admin View</Badge>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              {"subtitle" in stat && stat.subtitle && (
                <p className="text-xs text-muted-foreground">{stat.subtitle}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Studio total revenue */}
      {isEffectiveStudio && studioTotalRevenue !== undefined && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Faturamento Total do Estúdio (Mês)
            </CardTitle>
            <TrendingUp className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R$ {((monthStats?.totalRevenue || 0) + (studioTotalRevenue || 0)).toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              Seu: R$ {(monthStats?.totalRevenue || 0).toFixed(2)} + Manicures: R$ {(studioTotalRevenue || 0).toFixed(2)}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Studio manicures section */}
      {isEffectiveStudio && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scissors className="w-5 h-5 text-primary" />
              Manicures do Estúdio
            </CardTitle>
          </CardHeader>
          <CardContent>
            {studioManicures.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                Nenhuma manicure cadastrada no estúdio. Adicione na aba de Configurações.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {studioManicures.map((m: any) => (
                    <TableRow key={m.user_id}>
                      <TableCell className="font-medium">{m.full_name}</TableCell>
                      <TableCell>{m.phone || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={m.is_active ? "default" : "secondary"}>
                          {m.is_active ? "Ativa" : "Inativa"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Agenda de Hoje
          </CardTitle>
        </CardHeader>
        <CardContent>
          {todayAppointments.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Nenhum agendamento para hoje 💅
            </p>
          ) : (
            <div className="space-y-3">
              {todayAppointments.map((apt: any) => (
                <div
                  key={apt.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-1 h-10 rounded-full bg-primary" />
                    <div>
                      <p className="font-medium">{apt.clients?.full_name}</p>
                      <p className="text-sm text-muted-foreground">{apt.services?.name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">
                      {formatBrasilia(apt.start_at, "time")}
                    </p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      apt.status === "confirmed"
                        ? "bg-success/10 text-success"
                        : apt.status === "completed"
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {apt.status === "scheduled" ? "Agendado" :
                       apt.status === "confirmed" ? "Confirmado" :
                       apt.status === "completed" ? "Concluído" : apt.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
