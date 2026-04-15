import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, DollarSign, Calendar, TrendingUp } from "lucide-react";
import { formatBrasilia } from "@/lib/utils";

export default function Staff() {
  const { user } = useAuth();
  const { isStudioOwner } = useUserRole();

  // Busca o profile da owner para pegar o studio_profile_id
  const { data: ownerProfile } = useQuery({
    queryKey: ["owner-profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, business_name")
        .eq("user_id", user!.id)
        .single();
      return data;
    },
    enabled: !!user && isStudioOwner,
  });

  // Busca manicures do estúdio
  const { data: manicures = [], isLoading } = useQuery({
    queryKey: ["studio-staff", ownerProfile?.id],
    queryFn: async () => {
      const { data: links } = await supabase
        .from("studio_manicures")
        .select("manicure_user_id, is_active")
        .eq("studio_profile_id", ownerProfile!.id);

      if (!links || links.length === 0) return [];

      const userIds = links.map((l: any) => l.manicure_user_id);

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, phone, business_name")
        .in("user_id", userIds);

      return (profiles || []).map((p: any) => ({
        ...p,
        is_active: links.find((l: any) => l.manicure_user_id === p.user_id)?.is_active,
      }));
    },
    enabled: !!ownerProfile?.id,
  });

  // Busca todos os agendamentos do estúdio (último 30 dias + futuros)
  const { data: allAppointments = [] } = useQuery({
    queryKey: ["studio-all-appointments", user?.id],
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data } = await supabase
        .from("appointments")
        .select("*, clients(full_name, phone), services(name), profiles!appointments_manicure_id_fkey(full_name, user_id)")
        .eq("user_id", user!.id)
        .gte("start_at", thirtyDaysAgo.toISOString())
        .order("start_at", { ascending: false });

      return data || [];
    },
    enabled: !!user,
  });

  // Calcula stats por manicure
  const getManicureStats = (manicureUserId: string) => {
    // Busca profile id da manicure
    const manicure = manicures.find((m: any) => m.user_id === manicureUserId);
    const manicureProfileId = manicure?.id;

    const manicureAppts = allAppointments.filter((a: any) =>
      a.manicure_id && a.manicure_id === manicureProfileId
    );

    const completed = manicureAppts.filter((a: any) => a.status === "completed");
    const scheduled = manicureAppts.filter((a: any) => ["scheduled", "confirmed"].includes(a.status));
    const cancelled = manicureAppts.filter((a: any) => ["cancelled", "no_show"].includes(a.status));
    const revenue = completed.reduce((sum: number, a: any) => sum + (Number(a.price) || 0), 0);

    return { manicureAppts, completed, scheduled, cancelled, revenue };
  };

  // Stats gerais do estúdio
  const totalRevenue = allAppointments
    .filter((a: any) => a.status === "completed")
    .reduce((sum: number, a: any) => sum + (Number(a.price) || 0), 0);

  const totalScheduled = allAppointments.filter((a: any) =>
    ["scheduled", "confirmed"].includes(a.status)
  ).length;

  if (!isStudioOwner) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Acesso restrito ao dono do estúdio.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Funcionários</h1>
        <p className="text-muted-foreground">Visão geral do {ownerProfile?.business_name}</p>
      </div>

      {/* Cards de resumo geral */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Users className="w-4 h-4" /> Funcionários
            </div>
            <p className="text-2xl font-bold">{manicures.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <DollarSign className="w-4 h-4" /> Faturamento (30d)
            </div>
            <p className="text-2xl font-bold">R$ {totalRevenue.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Calendar className="w-4 h-4" /> Agendamentos
            </div>
            <p className="text-2xl font-bold">{totalScheduled}</p>
            <p className="text-xs text-muted-foreground">futuros</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <TrendingUp className="w-4 h-4" /> Concluídos (30d)
            </div>
            <p className="text-2xl font-bold">
              {allAppointments.filter((a: any) => a.status === "completed").length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs por funcionária */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        </div>
      ) : manicures.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>Nenhuma manicure cadastrada no estúdio ainda.</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue={manicures[0]?.user_id}>
          <TabsList className="flex flex-wrap gap-1 h-auto">
            {manicures.map((m: any) => (
              <TabsTrigger key={m.user_id} value={m.user_id} className="gap-2">
                {m.full_name}
                {!m.is_active && <Badge variant="outline" className="text-[10px]">Inativa</Badge>}
              </TabsTrigger>
            ))}
          </TabsList>

          {manicures.map((m: any) => {
            const stats = getManicureStats(m.user_id);
            return (
              <TabsContent key={m.user_id} value={m.user_id} className="space-y-4 mt-4">
                {/* Stats da manicure */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground">Faturamento (30d)</p>
                      <p className="text-xl font-bold text-primary">R$ {stats.revenue.toFixed(2)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground">Concluídos</p>
                      <p className="text-xl font-bold">{stats.completed.length}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground">Agendados</p>
                      <p className="text-xl font-bold">{stats.scheduled.length}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground">Cancelados</p>
                      <p className="text-xl font-bold text-destructive">{stats.cancelled.length}</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Info da manicure */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Informações</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex gap-2">
                      <span className="text-muted-foreground w-20">Nome:</span>
                      <span className="font-medium">{m.full_name}</span>
                    </div>
                    {m.phone && (
                      <div className="flex gap-2">
                        <span className="text-muted-foreground w-20">Telefone:</span>
                        <span>{m.phone}</span>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <span className="text-muted-foreground w-20">Status:</span>
                      <Badge variant={m.is_active ? "default" : "outline"}>
                        {m.is_active ? "Ativa" : "Inativa"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                {/* Agendamentos da manicure */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Agendamentos (últimos 30 dias)</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {stats.manicureAppts.length === 0 ? (
                      <p className="text-center py-8 text-muted-foreground text-sm">
                        Nenhum agendamento encontrado
                      </p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Data/Hora</TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Serviço</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Valor</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {stats.manicureAppts.map((apt: any) => (
                            <TableRow key={apt.id}>
                              <TableCell>
                                <p className="font-medium">{formatBrasilia(apt.start_at, "date")}</p>
                                <p className="text-xs text-muted-foreground">
                                  {formatBrasilia(apt.start_at, "time")} — {formatBrasilia(apt.end_at, "time")}
                                </p>
                              </TableCell>
                              <TableCell>
                                <p className="font-medium">{apt.clients?.full_name}</p>
                                <p className="text-xs text-muted-foreground">{apt.clients?.phone}</p>
                              </TableCell>
                              <TableCell>{apt.services?.name}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">
                                  {apt.status === "completed" ? "✅ Concluído" :
                                   apt.status === "scheduled" ? "📅 Agendado" :
                                   apt.status === "confirmed" ? "✔ Confirmado" :
                                   apt.status === "cancelled" ? "❌ Cancelado" :
                                   apt.status === "no_show" ? "👻 Não veio" : apt.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {apt.price ? `R$ ${Number(apt.price).toFixed(2)}` : "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>

                {/* Bloqueios da manicure */}
                <ManicureBlocks manicureUserId={m.user_id} manicureName={m.full_name} />
              </TabsContent>
            );
          })}
        </Tabs>
      )}
    </div>
  );
}

function ManicureBlocks({ manicureUserId, manicureName }: { manicureUserId: string; manicureName: string }) {
  const { data: blocks = [] } = useQuery({
    queryKey: ["manicure-blocks", manicureUserId],
    queryFn: async () => {
      const { data } = await supabase
        .from("schedule_blocks")
        .select("*")
        .eq("user_id", manicureUserId)
        .order("start_at", { ascending: false })
        .limit(10);
      return data || [];
    },
  });

  if (blocks.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Bloqueios de {manicureName}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Início</TableHead>
              <TableHead>Fim</TableHead>
              <TableHead>Motivo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {blocks.map((b: any) => (
              <TableRow key={b.id}>
                <TableCell className="font-medium">{b.title}</TableCell>
                <TableCell>{formatBrasilia(b.start_at, "datetime")}</TableCell>
                <TableCell>{formatBrasilia(b.end_at, "datetime")}</TableCell>
                <TableCell className="text-muted-foreground">{b.reason || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
