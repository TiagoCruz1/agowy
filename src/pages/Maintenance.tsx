import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Clock, Wrench, MessageCircle, CheckCircle, CalendarPlus } from "lucide-react";
import { format, differenceInDays, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { formatBrasilia } from "@/lib/utils";

interface MaintenanceItem {
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  serviceName: string;
  serviceId: string;
  manicureId: string | null;
  manicureName: string | null;
  appointmentId: string;
  lastDate: string;
  maintenanceDays: number;
  alertDays: number;
  dueDate: Date;
  daysUntilDue: number;
  status: "overdue" | "due_soon";
  lastNotified: string | null;
  maintenanceAlertId: string | null;
}

export default function Maintenance() {
  const { user } = useAuth();
  const { effectiveUserId } = useEffectiveUser();
  const { isManicure, isStudioOwner } = useUserRole();
  const userId = effectiveUserId || user?.id;
  const queryClient = useQueryClient();
  const [scheduleItem, setScheduleItem] = useState<MaintenanceItem | null>(null);
  const [scheduleForm, setScheduleForm] = useState({ date: "", time: "", notes: "" });
  const [blockError, setBlockError] = useState<string | null>(null);

  const { data: studioManicures = [] } = useQuery({
    queryKey: ["studio-manicures-select", userId],
    queryFn: async () => {
      const { data: profile } = await supabase.from("profiles").select("id, user_id, full_name").eq("user_id", userId!).single();
      if (!profile) return [];
      const { data } = await supabase.from("studio_manicures").select("manicure_user_id").eq("studio_profile_id", profile.id).eq("is_active", true);
      const userIds = Array.from(new Set([...(data || []).map((d: any) => d.manicure_user_id), profile.user_id]));
      const { data: profiles } = await supabase.from("profiles").select("id, user_id, full_name").in("user_id", userIds);
      return (profiles || []).map((p: any) => ({ ...p, is_owner: p.user_id === profile.user_id }))
        .sort((a: any, b: any) => Number(b.is_owner) - Number(a.is_owner));
    },
    enabled: !!userId && isStudioOwner,
  });

  const { data: services = [] } = useQuery({
    queryKey: ["services-select-maint", userId],
    queryFn: async () => {
      const { data } = await supabase.from("services").select("id, name, duration_minutes, price").eq("user_id", userId!).eq("is_active", true).order("name");
      return data || [];
    },
    enabled: !!userId,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-select-maint", userId],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, full_name").eq("user_id", userId!).eq("is_active", true).order("full_name");
      return data || [];
    },
    enabled: !!userId,
  });

  const { data: maintenanceList = [], isLoading } = useQuery({
    queryKey: ["maintenance", userId],
    queryFn: async () => {
      let apptQuery = supabase
        .from("appointments")
        .select("id, start_at, client_id, service_id, manicure_id, clients(full_name, phone), services(name, maintenance_interval_days, maintenance_alert_days), manicure:profiles!appointments_manicure_id_fkey(full_name, user_id)")
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

      // Busca alertas resolvidos para filtrar
      const { data: alerts } = await supabase
        .from("maintenance_alerts")
        .select("*")
        .eq("user_id", userId!);

      const alertMap = new Map<string, any>();
      for (const alert of alerts || []) {
        alertMap.set(`${alert.client_id}-${alert.service_id}`, alert);
      }

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

        // Filtra alertas resolvidos (agendamento já criado)
        if (alert?.status === "resolved") continue;

        // Verifica dismissed_until
        if (alert?.dismissed_until && new Date(alert.dismissed_until) > today) continue;

        const status: "overdue" | "due_soon" = daysUntilDue < 0 ? "overdue" : "due_soon";

        items.push({
          clientId: apt.client_id,
          clientName: apt.clients?.full_name || "—",
          clientPhone: apt.clients?.phone,
          serviceName: apt.services?.name || "—",
          serviceId: apt.service_id,
          manicureId: (apt.manicure as any)?.user_id || null,
          manicureName: (apt.manicure as any)?.full_name || null,
          appointmentId: apt.id,
          lastDate: apt.start_at,
          maintenanceDays: interval,
          alertDays,
          dueDate,
          daysUntilDue,
          status,
          lastNotified: alert?.last_notified_at || null,
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
      if (item.lastNotified) {
        const daysSince = differenceInDays(new Date(), new Date(item.lastNotified));
        if (daysSince < 3) throw new Error(`Aguarde ${3 - daysSince} dia(s) para avisar novamente.`);
      }
      const phone = item.clientPhone.replace(/\D/g, "");
      const daysText = item.daysUntilDue < 0
        ? `está ${Math.abs(item.daysUntilDue)} dias atrasada`
        : item.daysUntilDue === 0 ? "vence hoje"
        : `vence em ${item.daysUntilDue} dias`;
      const message = `Olá ${item.clientName}! 💅\n\nPassando para lembrar que sua manutenção de *${item.serviceName}* ${daysText}.\n\nAgende seu horário para manter suas unhas sempre lindas! ✨`;
      const { error } = await supabase.functions.invoke("send-whatsapp", { body: { phone, message } });
      if (error) throw error;
      const now = new Date().toISOString();
      if (item.maintenanceAlertId) {
        await supabase.from("maintenance_alerts").update({ last_notified_at: now, status: "notified" }).eq("id", item.maintenanceAlertId);
      } else {
        await supabase.from("maintenance_alerts").insert({ user_id: userId!, client_id: item.clientId, service_id: item.serviceId, appointment_id: item.appointmentId, next_due_at: item.dueDate.toISOString(), last_notified_at: now, status: "notified" });
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["maintenance"] }); queryClient.invalidateQueries({ queryKey: ["maintenance-badge"] }); toast.success("Aviso enviado pelo WhatsApp!"); },
    onError: (err: any) => toast.error(err.message),
  });

  const dismissMutation = useMutation({
    mutationFn: async (item: MaintenanceItem) => {
      const dismissedUntil = addDays(new Date(), 5).toISOString();
      if (item.maintenanceAlertId) {
        await supabase.from("maintenance_alerts").update({ dismissed_until: dismissedUntil }).eq("id", item.maintenanceAlertId);
      } else {
        await supabase.from("maintenance_alerts").insert({ user_id: userId!, client_id: item.clientId, service_id: item.serviceId, appointment_id: item.appointmentId, next_due_at: item.dueDate.toISOString(), status: "dismissed", dismissed_until: dismissedUntil });
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["maintenance"] }); queryClient.invalidateQueries({ queryKey: ["maintenance-badge"] }); toast.success("Dispensado por 5 dias"); },
  });

  const scheduleMutation = useMutation({
    mutationFn: async () => {
      if (!scheduleItem || !scheduleForm.date || !scheduleForm.time) throw new Error("Preencha data e horário");
      const service = services.find((s: any) => s.id === scheduleItem.serviceId);
      const duration = service?.duration_minutes || 30;
      const [startH, startM] = scheduleForm.time.split(":").map(Number);
      const totalMinutes = startH * 60 + startM + duration;
      const endH = Math.floor(totalMinutes / 60) % 24;
      const endMin = totalMinutes % 60;
      const start_at = `${scheduleForm.date}T${scheduleForm.time}:00-03:00`;
      const end_at = `${scheduleForm.date}T${String(endH).padStart(2,"0")}:${String(endMin).padStart(2,"0")}:00-03:00`;

      const payload: any = {
        user_id: userId!,
        client_id: scheduleItem.clientId,
        service_id: scheduleItem.serviceId,
        start_at, end_at,
        status: "scheduled",
        source: "manual",
        price: service?.price ? Number(service.price) : null,
        notes: scheduleForm.notes || null,
      };

      if (scheduleItem.manicureId) {
        const manicure = studioManicures.find((m: any) => m.user_id === scheduleItem.manicureId);
        if (manicure) payload.manicure_id = manicure.id;
      }

      const { error } = await supabase.from("appointments").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenance"] });
      queryClient.invalidateQueries({ queryKey: ["maintenance-badge"] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["overdue-appointments"] });
      toast.success("Agendamento criado!");
      setScheduleItem(null);
      setScheduleForm({ date: "", time: "", notes: "" });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const openSchedule = (item: MaintenanceItem) => {
    // Data sugerida = data de vencimento
    const suggestedDate = format(item.dueDate, "yyyy-MM-dd");
    setScheduleForm({ date: suggestedDate, time: "", notes: "" });
    setScheduleItem(item);
  };

  const canNotify = (item: MaintenanceItem) => {
    if (!item.lastNotified) return true;
    return differenceInDays(new Date(), new Date(item.lastNotified)) >= 3;
  };

  const overdueCount = maintenanceList.filter(m => m.status === "overdue").length;
  const dueSoonCount = maintenanceList.filter(m => m.status === "due_soon").length;

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
          <div className="p-6 flex flex-row items-center justify-between pb-2">
            <span className="text-sm font-medium text-muted-foreground">Atrasadas</span>
            <AlertTriangle className="w-4 h-4 text-destructive" />
          </div>
          <div className="px-6 pb-6"><div className="text-2xl font-bold text-destructive">{overdueCount}</div></div>
        </Card>
        <Card className="border-yellow-500/30">
          <div className="p-6 flex flex-row items-center justify-between pb-2">
            <span className="text-sm font-medium text-muted-foreground">Próximas</span>
            <Clock className="w-4 h-4 text-yellow-500" />
          </div>
          <div className="px-6 pb-6"><div className="text-2xl font-bold text-yellow-600">{dueSoonCount}</div></div>
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
                        <Button size="sm" variant="default" className="h-7 text-xs gap-1"
                          onClick={() => openSchedule(item)}
                          title="Criar agendamento para manutenção">
                          <CalendarPlus className="w-3 h-3" />
                          Agendar
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                          disabled={!item.clientPhone || !canNotify(item) || notifyMutation.isPending}
                          onClick={() => notifyMutation.mutate(item)}
                          title={!canNotify(item) ? "Aguarde 3 dias" : "Enviar aviso pelo WhatsApp"}>
                          <MessageCircle className="w-3 h-3" />
                          Avisar
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-muted-foreground"
                          onClick={() => dismissMutation.mutate(item)}
                          title="Dispensar por 5 dias">
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

      {/* Modal de agendamento */}
      <Dialog open={!!scheduleItem} onOpenChange={(o) => { if (!o) { setScheduleItem(null); setScheduleForm({ date: "", time: "", notes: "" }); }}}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agendar Manutenção</DialogTitle>
          </DialogHeader>
          {scheduleItem && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
                <p><span className="text-muted-foreground">Cliente:</span> <strong>{scheduleItem.clientName}</strong></p>
                <p><span className="text-muted-foreground">Serviço:</span> {scheduleItem.serviceName}</p>
                {scheduleItem.manicureName && <p><span className="text-muted-foreground">Manicure:</span> {scheduleItem.manicureName}</p>}
                <p><span className="text-muted-foreground">Data sugerida:</span> {format(scheduleItem.dueDate, "dd/MM/yyyy", { locale: ptBR })}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data *</Label>
                  <Input type="date" value={scheduleForm.date} onChange={(e) => setScheduleForm({ ...scheduleForm, date: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Horário *</Label>
                  <Input type="time" value={scheduleForm.time} onChange={(e) => setScheduleForm({ ...scheduleForm, time: e.target.value })} required />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea value={scheduleForm.notes} onChange={(e) => setScheduleForm({ ...scheduleForm, notes: e.target.value })} placeholder="Opcional..." />
              </div>

              <Button className="w-full" onClick={() => scheduleMutation.mutate()}
                disabled={scheduleMutation.isPending || !scheduleForm.date || !scheduleForm.time}>
                {scheduleMutation.isPending ? "Agendando..." : "Confirmar Agendamento"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
