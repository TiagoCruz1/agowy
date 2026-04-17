import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Users, CheckCircle, Clock, TrendingUp, Scissors, Building2, DollarSign, Percent, ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, subMonths, addMonths } from "date-fns";
import { formatBrasilia } from "@/lib/utils";
import { ptBR } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

const COLORS = ["#e91e8c", "#9c27b0", "#3f51b5", "#2196f3", "#00bcd4", "#4caf50"];
const monthNames = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

export default function Dashboard() {
  const { user } = useAuth();
  const { isStudioOwner, isManicure, profile } = useUserRole();
  const { effectiveUserId, isImpersonating } = useEffectiveUser();
  const userId = effectiveUserId || user?.id;
  const today = new Date();
  const [chartMonth, setChartMonth] = useState(new Date());

  const { data: effectiveProfile } = useQuery({
    queryKey: ["effective-profile", userId],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("user_id", userId!).single();
      return data;
    },
    enabled: !!userId && isImpersonating,
  });

  const activeProfile = isImpersonating ? effectiveProfile : profile;
  const isEffectiveStudio = isImpersonating ? effectiveProfile?.account_type === "studio" : isStudioOwner;

  const { data: studioInfo } = useQuery({
    queryKey: ["manicure-studio-info", userId],
    queryFn: async () => {
      const { data: prof } = await supabase.from("profiles").select("id, studio_id").eq("user_id", userId!).single();
      if (!prof?.studio_id) return null;
      const { data: studio } = await supabase.from("profiles").select("full_name, business_name").eq("id", prof.studio_id).single();
      return studio;
    },
    enabled: !!userId,
  });

  // Hoje
  const { data: todayAppointments = [] } = useQuery({
    queryKey: ["appointments-today", userId, isManicure],
    queryFn: async () => {
      let query = supabase
        .from("appointments")
        .select("*, clients(full_name), services(name)")
        .gte("start_at", startOfDay(today).toISOString())
        .lte("start_at", endOfDay(today).toISOString())
        .neq("status", "cancelled")
        .order("start_at");

      if (isManicure) {
        const { data: prof } = await supabase.from("profiles").select("id").eq("user_id", userId!).single();
        query = query.eq("manicure_id", prof?.id);
      } else {
        query = query.eq("user_id", userId!);
      }
      const { data } = await query;
      return data || [];
    },
    enabled: !!userId,
  });

  // Stats do mês
  const { data: monthStats } = useQuery({
    queryKey: ["month-stats", userId, isManicure, startOfMonth(today).toISOString()],
    queryFn: async () => {
      const start = startOfMonth(today).toISOString();
      const end = endOfMonth(today).toISOString();

      if (isManicure) {
        const { data: prof } = await supabase.from("profiles").select("id").eq("user_id", userId!).single();
        const { data: apts } = await supabase
          .from("appointments").select("price, status, client_id, services(commission_percentage)")
          .eq("manicure_id", prof?.id).gte("start_at", start).lte("start_at", end);

        const completed = (apts || []).filter((a: any) => a.status === "completed");
        const revenue = completed.reduce((s: number, a: any) => s + (a.price || 0), 0);
        const commission = completed.reduce((s: number, a: any) => s + (a.price || 0) * ((a.services?.commission_percentage || 0) / 100), 0);
        const uniqueClients = new Set(completed.map((a: any) => a.client_id)).size;
        return { totalMonth: (apts || []).length, completedMonth: completed.length, totalRevenue: revenue, commission, uniqueClients, totalClients: 0 };
      } else {
        const [{ count: totalMonth }, { count: completedMonth }, { count: totalClients }, { data: revenue }] = await Promise.all([
          supabase.from("appointments").select("*", { count: "exact", head: true }).eq("user_id", userId!).gte("start_at", start).lte("start_at", end).neq("status", "cancelled"),
          supabase.from("appointments").select("*", { count: "exact", head: true }).eq("user_id", userId!).eq("status", "completed").gte("start_at", start).lte("start_at", end),
          supabase.from("clients").select("*", { count: "exact", head: true }).eq("user_id", userId!).eq("is_active", true),
          supabase.from("appointments").select("price").eq("user_id", userId!).eq("status", "completed").gte("start_at", start).lte("start_at", end),
        ]);
        const totalRevenue = (revenue || []).reduce((s, a) => s + (a.price || 0), 0);
        return { totalMonth: totalMonth || 0, completedMonth: completedMonth || 0, totalClients: totalClients || 0, totalRevenue, commission: 0, uniqueClients: 0 };
      }
    },
    enabled: !!userId,
  });

  // Gráfico anual (últimos 6 meses)
  const { data: yearlyChart = [] } = useQuery({
    queryKey: ["yearly-chart", userId, isManicure, chartMonth.getFullYear()],
    queryFn: async () => {
      const year = chartMonth.getFullYear();
      const result = [];
      for (let m = 0; m < 12; m++) {
        const start = new Date(year, m, 1).toISOString();
        const end = new Date(year, m + 1, 0, 23, 59, 59).toISOString();

        let query = supabase.from("appointments").select("price, services(commission_percentage)").eq("status", "completed").gte("start_at", start).lte("start_at", end);

        if (isManicure) {
          const { data: prof } = await supabase.from("profiles").select("id").eq("user_id", userId!).single();
          query = query.eq("manicure_id", prof?.id);
        } else {
          query = query.eq("user_id", userId!);
        }

        const { data } = await query;
        const revenue = (data || []).reduce((s: number, a: any) => s + (a.price || 0), 0);
        const commission = (data || []).reduce((s: number, a: any) => s + (a.price || 0) * ((a.services?.commission_percentage || 0) / 100), 0);
        result.push({ mes: monthNames[m], faturamento: revenue, comissao: commission });
      }
      return result;
    },
    enabled: !!userId,
  });

  // Gráfico por manicure (só dona)
  const { data: manicureChart = [] } = useQuery({
    queryKey: ["manicure-chart", userId, startOfMonth(today).toISOString()],
    queryFn: async () => {
      const { data: prof } = await supabase.from("profiles").select("id, user_id, full_name").eq("user_id", userId!).single();
      if (!prof) return [];
      const { data: links } = await supabase.from("studio_manicures").select("manicure_user_id").eq("studio_profile_id", prof.id).eq("is_active", true);
      const userIds = [...(links || []).map((l: any) => l.manicure_user_id), prof.user_id];
      const { data: profiles } = await supabase.from("profiles").select("id, user_id, full_name").in("user_id", userIds);

      const start = startOfMonth(today).toISOString();
      const end = endOfMonth(today).toISOString();
      const result = [];

      for (const p of profiles || []) {
        const { data: apts } = await supabase
          .from("appointments").select("price, services(commission_percentage)")
          .eq("manicure_id", p.id).eq("status", "completed").gte("start_at", start).lte("start_at", end);
        const revenue = (apts || []).reduce((s: number, a: any) => s + (a.price || 0), 0);
        const commission = (apts || []).reduce((s: number, a: any) => s + (a.price || 0) * ((a.services?.commission_percentage || 0) / 100), 0);
        if (revenue > 0) result.push({ name: p.full_name.split(" ")[0], faturamento: revenue, comissao: commission });
      }
      return result.sort((a, b) => b.faturamento - a.faturamento);
    },
    enabled: !!userId && isEffectiveStudio,
  });

  // Serviços mais realizados
  const { data: topServices = [] } = useQuery({
    queryKey: ["top-services", userId, isManicure],
    queryFn: async () => {
      const start = startOfMonth(today).toISOString();
      const end = endOfMonth(today).toISOString();

      let query = supabase.from("appointments").select("services(name)").eq("status", "completed").gte("start_at", start).lte("start_at", end);

      if (isManicure) {
        const { data: prof } = await supabase.from("profiles").select("id").eq("user_id", userId!).single();
        query = query.eq("manicure_id", prof?.id);
      } else {
        query = query.eq("user_id", userId!);
      }

      const { data } = await query;
      const map = new Map<string, number>();
      for (const a of data || []) {
        const name = (a.services as any)?.name || "—";
        map.set(name, (map.get(name) || 0) + 1);
      }
      return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5);
    },
    enabled: !!userId,
  });

  // Studio manicures
  const { data: studioManicures = [] } = useQuery({
    queryKey: ["studio-manicures-dashboard", userId],
    queryFn: async () => {
      const { data: prof } = await supabase.from("profiles").select("id").eq("user_id", userId!).single();
      if (!prof) return [];
      const { data } = await supabase.from("studio_manicures").select("manicure_user_id, is_active").eq("studio_profile_id", prof.id);
      if (!data?.length) return [];
      const userIds = data.map((d: any) => d.manicure_user_id);
      const { data: profiles } = await supabase.from("profiles").select("id, user_id, full_name, phone").in("user_id", userIds);
      return (profiles || []).map((p: any) => ({ ...p, is_active: data.find((d: any) => d.manicure_user_id === p.user_id)?.is_active ?? true }));
    },
    enabled: !!userId && isEffectiveStudio,
  });

  const displayName = activeProfile?.business_name || activeProfile?.full_name || "Dashboard";

  const stats = isManicure ? [
    { title: "Agendamentos Hoje", value: todayAppointments.length, icon: Calendar, color: "text-primary" },
    { title: "Atendimentos no Mês", value: monthStats?.completedMonth || 0, icon: CheckCircle, color: "text-success" },
    { title: "Clientes Atendidos", value: monthStats?.uniqueClients || 0, icon: Users, color: "text-accent" },
    { title: "Comissão do Mês", value: formatBRL(monthStats?.commission || 0), icon: Percent, color: "text-primary", subtitle: "A receber" },
  ] : [
    { title: "Agendamentos Hoje", value: todayAppointments.length, icon: Calendar, color: "text-primary" },
    { title: "Clientes Ativos", value: monthStats?.totalClients || 0, icon: Users, color: "text-accent" },
    { title: "Atendimentos no Mês", value: monthStats?.completedMonth || 0, icon: CheckCircle, color: "text-success" },
    { title: "Faturamento do Mês", value: formatBRL(monthStats?.totalRevenue || 0), icon: DollarSign, color: "text-primary", subtitle: "Apenas concluídos" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{displayName}</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-muted-foreground">{format(today, "EEEE, d 'de' MMMM", { locale: ptBR })}</p>
          {isEffectiveStudio && <Badge variant="outline">Estúdio</Badge>}
          {studioInfo && <Badge variant="secondary" className="flex items-center gap-1"><Building2 className="w-3 h-3" />{studioInfo.business_name || studioInfo.full_name}</Badge>}
          {isImpersonating && <Badge variant="destructive" className="text-[10px]">Admin View</Badge>}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              {"subtitle" in stat && stat.subtitle && <p className="text-xs text-muted-foreground">{stat.subtitle}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Gráfico faturamento anual */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              {isManicure ? "Faturamento & Comissão" : "Faturamento Anual"}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setChartMonth(subMonths(chartMonth, 12))}>
                <ChevronLeft className="w-3 h-3" />
              </Button>
              <span className="text-sm font-medium">{chartMonth.getFullYear()}</span>
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setChartMonth(addMonths(chartMonth, 12))}>
                <ChevronRight className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={yearlyChart} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any) => formatBRL(v)} />
              <Bar dataKey="faturamento" name="Faturamento" fill="#e91e8c" radius={[4,4,0,0]} />
              {isManicure && <Bar dataKey="comissao" name="Comissão" fill="#9c27b0" radius={[4,4,0,0]} />}
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Gráfico por manicure — só dona */}
        {isEffectiveStudio && manicureChart.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Scissors className="w-5 h-5 text-primary" />
                Faturamento por Manicure (Mês)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={manicureChart} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${v}`} />
                  <Tooltip formatter={(v: any) => formatBRL(v)} />
                  <Bar dataKey="faturamento" name="Faturamento" fill="#e91e8c" radius={[4,4,0,0]} />
                  <Bar dataKey="comissao" name="Comissão" fill="#9c27b0" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Serviços mais realizados */}
        {topServices.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Scissors className="w-5 h-5 text-primary" />
                Serviços Mais Realizados (Mês)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={topServices} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name}: ${value}`}>
                    {topServices.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Manicures do estúdio */}
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
              <p className="text-muted-foreground text-center py-4">Nenhuma manicure cadastrada.</p>
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
                      <TableCell><Badge variant={m.is_active ? "default" : "secondary"}>{m.is_active ? "Ativa" : "Inativa"}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Agenda de hoje */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Agenda de Hoje
          </CardTitle>
        </CardHeader>
        <CardContent>
          {todayAppointments.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nenhum agendamento para hoje 🎉</p>
          ) : (
            <div className="space-y-3">
              {todayAppointments.map((apt: any) => (
                <div key={apt.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
                  <div className="flex items-center gap-3">
                    <div className="w-1 h-10 rounded-full bg-primary" />
                    <div>
                      <p className="font-medium">{apt.clients?.full_name}</p>
                      <p className="text-sm text-muted-foreground">{apt.services?.name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{formatBrasilia(apt.start_at, "time")}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${apt.status === "confirmed" ? "bg-success/10 text-success" : apt.status === "completed" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {apt.status === "scheduled" ? "Agendado" : apt.status === "confirmed" ? "Confirmado" : apt.status === "completed" ? "Concluído" : apt.status}
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
