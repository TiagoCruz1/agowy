import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, Users, XCircle, Clock, DollarSign, ChevronLeft, ChevronRight, Percent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from "date-fns";
import { formatBrasilia } from "@/lib/utils";
import { ptBR } from "date-fns/locale";

type StaffRevenueRow = {
  user_id: string;
  full_name: string;
  is_active: boolean;
  revenue: number;
  completed: number;
  commission: number;
};

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export default function Financial() {
  const { user } = useAuth();
  const { effectiveUserId } = useEffectiveUser();
  const { isStudioOwner, isManicure } = useUserRole();
  const userId = effectiveUserId || user?.id;
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth).toISOString();
  const monthEnd = endOfMonth(currentMonth).toISOString();

  // Para submanicure: busca o owner do estúdio
  const { data: manicureStudioLink } = useQuery({
    queryKey: ["manicure-studio-link", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("studio_manicures")
        .select("studio_profile_id, profiles!studio_profile_id(user_id)")
        .eq("manicure_user_id", userId!)
        .eq("is_active", true)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!userId && isManicure,
  });

  const ownerUserId = isManicure
    ? (manicureStudioLink?.profiles as any)?.user_id
    : userId;

  const { data: monthData, isLoading } = useQuery({
    queryKey: ["financial", userId, monthStart, isManicure],
    queryFn: async () => {
      let query = supabase
        .from("appointments")
        .select("*, clients(full_name), services(name, commission_percentage)")
        .gte("start_at", monthStart)
        .lte("start_at", monthEnd)
        .order("start_at", { ascending: false });

      if (isManicure) {
        // Submanicure vê só os dela pelo manicure_id
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", userId!)
          .single();
        query = query.eq("manicure_id", profile?.id);
      } else {
        query = query.eq("user_id", userId!);
      }

      const { data: appointments, error } = await query;
      if (error) throw error;

      const completed = (appointments || []).filter((a: any) => a.status === "completed");
      const cancelled = (appointments || []).filter((a: any) => a.status === "cancelled");
      const noShow = (appointments || []).filter((a: any) => a.status === "no_show");
      const revenue = completed.reduce((sum: number, a: any) => sum + (a.price || 0), 0);
      const commission = completed.reduce((sum: number, a: any) => {
        const pct = a.services?.commission_percentage || 0;
        return sum + (a.price || 0) * (pct / 100);
      }, 0);

      return {
        appointments: appointments || [],
        totalAppointments: (appointments || []).length,
        completedCount: completed.length,
        cancelledCount: cancelled.length,
        noShowCount: noShow.length,
        revenue,
        commission,
      };
    },
    enabled: !!userId && (!isManicure || !!manicureStudioLink !== undefined),
  });

  // Yearly overview
  const { data: yearlyData } = useQuery({
    queryKey: ["financial-yearly", userId, currentMonth.getFullYear(), isManicure],
    queryFn: async () => {
      const year = currentMonth.getFullYear();
      const yearStart = `${year}-01-01T00:00:00`;
      const yearEnd = `${year}-12-31T23:59:59`;

      let query = supabase
        .from("appointments")
        .select("start_at, status, price, services(commission_percentage)")
        .gte("start_at", yearStart)
        .lte("start_at", yearEnd);

      if (isManicure) {
        const { data: profile } = await supabase
          .from("profiles").select("id").eq("user_id", userId!).single();
        query = query.eq("manicure_id", profile?.id);
      } else {
        query = query.eq("user_id", userId!);
      }

      const { data, error } = await query;
      if (error) throw error;

      const byMonth: Record<number, { revenue: number; commission: number; completed: number; cancelled: number; noShow: number; total: number }> = {};
      for (let m = 0; m < 12; m++) {
        byMonth[m] = { revenue: 0, commission: 0, completed: 0, cancelled: 0, noShow: 0, total: 0 };
      }
      (data || []).forEach((a: any) => {
        const m = new Date(a.start_at).getMonth();
        byMonth[m].total++;
        if (a.status === "completed") {
          byMonth[m].completed++;
          byMonth[m].revenue += a.price || 0;
          const pct = a.services?.commission_percentage || 0;
          byMonth[m].commission += (a.price || 0) * (pct / 100);
        } else if (a.status === "cancelled") {
          byMonth[m].cancelled++;
        } else if (a.status === "no_show") {
          byMonth[m].noShow++;
        }
      });
      return byMonth;
    },
    enabled: !!userId,
  });

  const { data: ownerProfile } = useQuery({
    queryKey: ["financial-owner-profile", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, business_name")
        .eq("user_id", userId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!userId && isStudioOwner,
  });

  const { data: studioRevenue = [] } = useQuery({
    queryKey: ["financial-studio-revenue", userId, monthStart, monthEnd],
    queryFn: async () => {
      if (!ownerProfile?.id) return [] as StaffRevenueRow[];

      const { data: links, error: linksError } = await supabase
        .from("studio_manicures")
        .select("manicure_user_id, is_active")
        .eq("studio_profile_id", ownerProfile.id);
      if (linksError) throw linksError;
      if (!links || links.length === 0) return [] as StaffRevenueRow[];

      // Remove a própria dona do estúdio da lista de funcionárias
      const userIds = links
        .map((l: any) => l.manicure_user_id)
        .filter((id: string) => id !== userId);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, user_id, full_name")
        .in("user_id", userIds);

      const rows: StaffRevenueRow[] = [];
      for (const profile of profiles || []) {
        const { data: appointments } = await supabase
          .from("appointments")
          .select("id, price, services(commission_percentage)")
          .eq("status", "completed")
          .or(`user_id.eq.${profile.user_id},manicure_id.eq.${profile.id}`)
          .gte("start_at", monthStart)
          .lte("start_at", monthEnd);

        const revenue = (appointments || []).reduce((sum: number, a: any) => sum + (Number(a.price) || 0), 0);
        const commission = (appointments || []).reduce((sum: number, a: any) => {
          const pct = a.services?.commission_percentage || 0;
          return sum + (Number(a.price) || 0) * (pct / 100);
        }, 0);

        rows.push({
          user_id: profile.user_id,
          full_name: profile.full_name,
          is_active: links.find((l: any) => l.manicure_user_id === profile.user_id)?.is_active ?? true,
          revenue,
          completed: appointments?.length || 0,
          commission,
        });
      }
      return rows.sort((a, b) => b.revenue - a.revenue);
    },
    enabled: !!userId && isStudioOwner && !!ownerProfile?.id,
  });

  const studioStaffRevenue = studioRevenue.reduce((sum, s) => sum + s.revenue, 0);
  const studioTotalRevenue = (monthData?.revenue || 0) + studioStaffRevenue;
  const totalCommissionsOwed = studioRevenue.reduce((sum, s) => sum + s.commission, 0);

  const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Faturamento</h1>
        <p className="text-muted-foreground">Controle financeiro e estatísticas</p>
      </div>

      {/* Month Navigation */}
      <div className="flex items-center justify-center gap-4">
        <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="font-semibold text-lg min-w-[200px] text-center">
          {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
        </span>
        <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
          <ChevronRight className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(new Date())}>Hoje</Button>
      </div>

      {/* Month Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Faturamento</CardTitle>
            <DollarSign className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBRL(monthData?.revenue || 0)}</div>
            <p className="text-xs text-muted-foreground">Apenas concluídos</p>
          </CardContent>
        </Card>
        {isManicure && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Minha comissão</CardTitle>
              <Percent className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{formatBRL(monthData?.commission || 0)}</div>
              <p className="text-xs text-muted-foreground">A receber no mês</p>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Atendidos</CardTitle>
            <Users className="w-4 h-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{monthData?.completedCount || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cancelados</CardTitle>
            <XCircle className="w-4 h-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{monthData?.cancelledCount || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Não Compareceu</CardTitle>
            <Clock className="w-4 h-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{monthData?.noShowCount || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Studio owner: resumo + comissões a pagar */}
      {isStudioOwner && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Meu faturamento</CardTitle>
                <DollarSign className="w-4 h-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatBRL(monthData?.revenue || 0)}</div>
              </CardContent>
            </Card>
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Faturamento do estúdio</CardTitle>
                <TrendingUp className="w-4 h-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatBRL(studioTotalRevenue)}</div>
                <p className="text-xs text-muted-foreground">
                  Seu: {formatBRL(monthData?.revenue || 0)} + Funcionárias: {formatBRL(studioStaffRevenue)}
                </p>
              </CardContent>
            </Card>
            <Card className="border-destructive/20 bg-destructive/5">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Comissões a pagar</CardTitle>
                <Percent className="w-4 h-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">{formatBRL(totalCommissionsOwed)}</div>
                <p className="text-xs text-muted-foreground">Total para funcionárias</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Faturamento por funcionária
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {studioRevenue.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">Nenhuma funcionária encontrada no estúdio</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Funcionária</TableHead>
                      <TableHead className="text-right">Concluídos</TableHead>
                      <TableHead className="text-right">Faturamento</TableHead>
                      <TableHead className="text-right">Comissão</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {studioRevenue.map((staff) => (
                      <TableRow key={staff.user_id}>
                        <TableCell className="font-medium">{staff.full_name}</TableCell>
                        <TableCell className="text-right">{staff.completed}</TableCell>
                        <TableCell className="text-right">{formatBRL(staff.revenue)}</TableCell>
                        <TableCell className="text-right text-destructive font-medium">{formatBRL(staff.commission)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {staff.is_active ? "Ativa" : "Inativa"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Yearly Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Visão Anual — {currentMonth.getFullYear()}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mês</TableHead>
                <TableHead className="text-right">Faturamento</TableHead>
                {isManicure && <TableHead className="text-right">Comissão</TableHead>}
                <TableHead className="text-right">Atendidos</TableHead>
                <TableHead className="text-right">Cancelados</TableHead>
                <TableHead className="text-right">Não Comp.</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {yearlyData && Object.entries(yearlyData).map(([m, data]) => (
                <TableRow key={m} className={Number(m) === currentMonth.getMonth() ? "bg-muted/50" : ""}>
                  <TableCell className="font-medium">{monthNames[Number(m)]}</TableCell>
                  <TableCell className="text-right">{formatBRL(data.revenue)}</TableCell>
                  {isManicure && <TableCell className="text-right text-primary">{formatBRL(data.commission)}</TableCell>}
                  <TableCell className="text-right">{data.completed}</TableCell>
                  <TableCell className="text-right">{data.cancelled}</TableCell>
                  <TableCell className="text-right">{data.noShow}</TableCell>
                  <TableCell className="text-right">{data.total}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Month Appointments Detail */}
      <Card>
        <CardHeader>
          <CardTitle>Agendamentos do Mês</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : (monthData?.appointments || []).length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">Nenhum agendamento neste mês</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Serviço</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  {isManicure && <TableHead className="text-right">Comissão</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(monthData?.appointments || []).map((apt: any) => {
                  const pct = apt.services?.commission_percentage || 0;
                  const commission = apt.status === "completed" ? (apt.price || 0) * (pct / 100) : 0;
                  return (
                    <TableRow key={apt.id}>
                      <TableCell>{formatBrasilia(apt.start_at, "datetime")}</TableCell>
                      <TableCell>{apt.clients?.full_name}</TableCell>
                      <TableCell>{apt.services?.name}</TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          apt.status === "completed" ? "bg-success/10 text-success" :
                          apt.status === "cancelled" ? "bg-destructive/10 text-destructive" :
                          apt.status === "no_show" ? "bg-warning/10 text-warning" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {apt.status === "completed" ? "Concluído" :
                           apt.status === "cancelled" ? "Cancelado" :
                           apt.status === "no_show" ? "Não compareceu" :
                           apt.status === "confirmed" ? "Confirmado" : "Agendado"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {apt.status === "completed" ? formatBRL(Number(apt.price || 0)) : "—"}
                      </TableCell>
                      {isManicure && (
                        <TableCell className="text-right text-primary">
                          {apt.status === "completed" ? formatBRL(commission) : "—"}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
