import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock, Wrench, MessageCircle, CheckCircle } from "lucide-react";
import { format, differenceInDays, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface MaintenanceItem {
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  serviceName: string;
  serviceId: string;
  appointmentId: string;
  lastDate: string;
  maintenanceDays: number;
  alertDays: number;
  dueDate: Date;
  daysUntilDue: number;
  status: "overdue" | "due_soon";
  lastNotified: string | null;
  maintenanceStatus: string | null;
  maintenanceAlertId: string | null;
}

export default function Maintenance() {
  const { user } = useAuth();
  const { effectiveUserId } = useEffectiveUser();
  const { isManicure } = useUserRole();
  const userId = effectiveUserId || user?.id;
  const queryClient = useQueryClient();

  const { data: maintenanceList = [], isLoading } = useQuery({
    queryKey: ["maintenance", userId],
    queryFn: async () => {
      // Busca agendamentos concluídos
      let apptQuery = supabase
        .from("appointments")
        .select("id, start_at, client_id, service_id, manicure_id, clients(full_name, phone), services(name, maintenance_interval_days, maintenance_alert_days)")
        .eq("status", "completed")
        .order("start_at", { ascending: false });

      if (isManicure) {
        const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", userId!).single();
        apptQuery = apptQuery.eq("manicure_id", profile?.id);
      } else {
        apptQuery = apptQuery.eq("user_id", userId!);
      }

      const { data: appointments, error } = await apptQuery;
      if (error) throw error;

      // Busca alertas existentes
      const { data: alerts } = await supabase
        .from("maintenance_alerts")
        .select("*")
        .eq("user_id", userId!);

      const alertMap = new Map<string, any>();
      for (const alert of alerts || []) {
        alertMap.set(`${alert.client_id}-${alert.service_id}`, alert);
      }

      // Group by client+service, keep only the latest
      const latestMap = new Map<string, any>();
      for (const apt of appointments || []) {
        if (!apt.services?.maintenance_interval_days) continue;
        const key = `${apt.client_id}-${apt.service_id}`;
        if (!latestMap.has(key)) latestMap.set(key, apt);
      }

      const today = new Date();
      const items: MaintenanceItem[] = [];

      for (const apt of latestMap.values()) {
        const interval = apt.services.maintenance_interval_days;
        const alertDays = apt.services.maintenance_alert_days || 15;
        const lastDate = new Date(apt.start_at);
        const dueDate = addDays(lastDate, interval);
        const daysUntilDue = differenceInDays(dueDate, today);

        if (daysUntilDue > alertDays) continue;

        const alertKey = `${apt.client_id}-${apt.service_id}`;
        const alert = alertMap.get(alertKey);

        // Verifica dismissed_until
        if (alert?.dismissed_until && new Date(alert.dismissed_until) > today) continue;

        const status: "overdue" | "due_soon" = daysUntilDue < 0 ? "overdue" : "due_soon";

        items.push({
          clientId: apt.client_id,
          clientName: apt.clients?.full_name || "—",
          clientPhone: apt.clients?.phone,
          serviceName: apt.services?.name || "—",
          serviceId: apt.service_id,
          appointmentId: apt.id,
          lastDate: apt.start_at,
          maintenanceDays: interval,
          alertDays,
          dueDate,
          daysUntilDue,
          status,
          lastNotified: alert?.last_notified_at || null,
          maintenanceStatus: alert?.status || null,
          maintenanceAlertId: alert?.id || null,
        });
      }

      return items.sort((a, b) => a.daysUntilDue - b.daysUntilDue);
    },
    enabled: !!userId,
  });

  const notifyMutation = useMutation({
    mutationFn: async (item: MaintenanceItem) => {
      if (!item.clientPhone) throw new Error("Cliente sem telefone cadastrado");

      // Verifica limite de 3 dias
      if (item.lastNotified) {
        const daysSinceNotified = differenceInDays(new Date(), new Date(item.lastNotified));
        if (daysSinceNotified < 3) {
          throw new Error(`Já foi avisado há ${daysSinceNotified} dia(s). Aguarde ${3 - daysSinceNotified} dia(s) para avisar novamente.`);
        }
      }

      const phone = item.clientPhone.replace(/\D/g, "");
      const daysText = item.daysUntilDue < 0
        ? `está ${Math.abs(item.daysUntilDue)} dias atrasada`
        : item.daysUntilDue === 0
        ? "vence hoje"
        : `vence em ${item.daysUntilDue} dias`;

      const message = `Olá ${item.clientName}! 💅\n\nPassando para lembrar que sua manutenção de *${item.serviceName}* ${daysText}.\n\nAgende seu horário para manter suas unhas sempre lindas! ✨`;

      // Busca config Evolution
      const { data: ownerProfile } = await supabase
        .from("profiles").select("user_id").eq("account_type", "studio").limit(1).single();

      const { data: aiSettings } = await supabase
        .from("ai_settings").select("*").eq("user_id", ownerProfile?.user_id || userId!).maybeSingle();

      // Envia WhatsApp via Evolution
      const evolutionUrl = Deno?.env?.get?.("EVOLUTION_URL") || "";
      const evolutionKey = Deno?.env?.get?.("EVOLUTION_KEY") || "";

      // Chama edge function send-whatsapp
      const { error: sendError } = await supabase.functions.invoke("send-whatsapp", {
        body: { phone, message },
      });
      if (sendError) throw sendError;

      // Atualiza ou cria alert
      const now = new Date().toISOString();
      if (item.maintenanceAlertId) {
        await supabase.from("maintenance_alerts").update({
          last_notified_at: now,
          status: "notified",
        }).eq("id", item.maintenanceAlertId);
      } else {
        await supabase.from("maintenance_alerts").insert({
          user_id: userId!,
          client_id: item.clientId,
          service_id: item.serviceId,
          appointment_id: item.appointmentId,
          next_due_at: item.dueDate.toISOString(),
          last_notified_at: now,
          status: "notified",
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenance"] });
      queryClient.invalidateQueries({ queryKey: ["maintenance-badge"] });
      toast.success("Aviso enviado pelo WhatsApp!");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const dismissMutation = useMutation({
    mutationFn: async (item: MaintenanceItem) => {
      const dismissedUntil = addDays(new Date(), 5).toISOString();
      if (item.maintenanceAlertId) {
        await supabase.from("maintenance_alerts").update({ dismissed_until: dismissedUntil }).eq("id", item.maintenanceAlertId);
      } else {
        await supabase.from("maintenance_alerts").insert({
          user_id: userId!,
          client_id: item.clientId,
          service_id: item.serviceId,
          appointment_id: item.appointmentId,
          next_due_at: item.dueDate.toISOString(),
          status: "dismissed",
          dismissed_until: dismissedUntil,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenance"] });
      queryClient.invalidateQueries({ queryKey: ["maintenance-badge"] });
      toast.success("Notificação dispensada por 5 dias");
    },
  });

  const overdueCount = maintenanceList.filter(m => m.status === "overdue").length;
  const dueSoonCount = maintenanceList.filter(m => m.status === "due_soon").length;

  const canNotify = (item: MaintenanceItem) => {
    if (!item.lastNotified) return true;
    return differenceInDays(new Date(), new Date(item.lastNotified)) >= 3;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Wrench className="w-8 h-8 text-primary" />
          Manutenção
        </h1>
        <p className="text-muted-foreground">Clientes que precisam de manutenção nos serviços</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="border-destructive/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Atrasadas</CardTitle>
            <AlertTriangle className="w-4 h-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{overdueCount}</div>
          </CardContent>
        </Card>
        <Card className="border-yellow-500/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Próximas</CardTitle>
            <Clock className="w-4 h-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{dueSoonCount}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : maintenanceList.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Wrench className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>Nenhuma manutenção pendente 🎉</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Serviço</TableHead>
                  <TableHead>Último Atend.</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {maintenanceList.map((item, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{item.clientName}</p>
                        {item.clientPhone && <p className="text-xs text-muted-foreground">{item.clientPhone}</p>}
                      </div>
                    </TableCell>
                    <TableCell>{item.serviceName}</TableCell>
                    <TableCell>{format(new Date(item.lastDate), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                    <TableCell>{format(item.dueDate, "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                    <TableCell>
                      {item.status === "overdue" ? (
                        <Badge variant="destructive">{Math.abs(item.daysUntilDue)} dias atrasado</Badge>
                      ) : (
                        <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
                          Vence em {item.daysUntilDue} dias
                        </Badge>
                      )}
                      {item.lastNotified && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Avisado {differenceInDays(new Date(), new Date(item.lastNotified))}d atrás
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          disabled={!item.clientPhone || !canNotify(item) || notifyMutation.isPending}
                          onClick={() => notifyMutation.mutate(item)}
                          title={!canNotify(item) ? "Aguarde 3 dias para avisar novamente" : "Enviar aviso pelo WhatsApp"}
                        >
                          <MessageCircle className="w-3 h-3" />
                          Avisar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs gap-1 text-muted-foreground"
                          onClick={() => dismissMutation.mutate(item)}
                          title="Dispensar por 5 dias"
                        >
                          <CheckCircle className="w-3 h-3" />
                          Dispensar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
