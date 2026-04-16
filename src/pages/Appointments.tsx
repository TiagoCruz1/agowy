import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Plus, Calendar, ChevronLeft, ChevronRight, Pencil, AlertTriangle } from "lucide-react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, isPast } from "date-fns";
import { formatBrasilia } from "@/lib/utils";
import { ptBR } from "date-fns/locale";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  scheduled: { label: "Agendado", color: "bg-muted text-muted-foreground" },
  confirmed: { label: "Confirmado", color: "bg-success/10 text-success" },
  completed: { label: "Concluído", color: "bg-primary/10 text-primary" },
  cancelled: { label: "Cancelado", color: "bg-destructive/10 text-destructive" },
  no_show: { label: "Não compareceu", color: "bg-warning/10 text-warning" },
};

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
};

export default function Appointments() {
  const { user } = useAuth();
  const { effectiveUserId } = useEffectiveUser();
  const userId = effectiveUserId || user?.id;
  const { isStudioOwner, isManicure } = useUserRole();

  const { data: studioOwner } = useQuery({
    queryKey: ["studio-owner-appt"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id").eq("account_type", "studio").single();
      return data;
    },
    enabled: !!isManicure,
  });

  const ownerUserId = isManicure ? studioOwner?.user_id : userId;
  const queryClient = useQueryClient();
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [form, setForm] = useState({
    client_id: "",
    service_id: "",
    manicure_id: "",
    date: "",
    time: "",
    notes: "",
    status: "scheduled" as string,
  });

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });

  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ["appointments", userId, weekStart.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, clients(full_name, phone), services(name, duration_minutes), manicure:profiles!appointments_manicure_id_fkey(full_name)")
        .eq("user_id", userId!)
        .gte("start_at", weekStart.toISOString())
        .lte("start_at", weekEnd.toISOString())
        .order("start_at");
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const { data: allOverdueRaw = [], refetch: refetchOverdue } = useQuery({
    queryKey: ["overdue-appointments", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, clients(full_name, phone), services(name, duration_minutes)")
        .eq("user_id", userId!)
        .in("status", ["scheduled", "confirmed"])
        .lt("end_at", new Date().toISOString())
        .order("start_at");
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });

  // Combina vencidos da semana atual + outras semanas, sem duplicar
  const overdueAppointments = useMemo(() => {
    const weekOverdue = appointments.filter((apt: any) =>
      isPast(new Date(apt.end_at)) && (apt.status === "scheduled" || apt.status === "confirmed")
    );
    const weekIds = new Set(weekOverdue.map((a: any) => a.id));
    const otherOverdue = allOverdueRaw.filter((a: any) => !weekIds.has(a.id));
    return [...weekOverdue, ...otherOverdue].sort((a: any, b: any) =>
      new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
    );
  }, [appointments, allOverdueRaw]);

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-select", ownerUserId || userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, full_name")
        .eq("user_id", ownerUserId || userId!)
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data;
    },
    enabled: !!(ownerUserId || userId),
  });

  const { data: services = [] } = useQuery({
    queryKey: ["services-select", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, duration_minutes, price")
        .eq("user_id", userId!)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  // Fetch studio manicures if studio owner
  const { data: studioManicures = [] } = useQuery({
    queryKey: ["studio-manicures-select", userId],
    queryFn: async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, user_id, full_name")
        .eq("user_id", userId!)
        .single();
      if (!profile) return [];

      const { data, error } = await supabase
        .from("studio_manicures")
        .select("manicure_user_id")
        .eq("studio_profile_id", profile.id)
        .eq("is_active", true);
      if (error) return [profile];

      // Include studio owner as a selectable manicure as well.
      const userIds = Array.from(new Set([...(data || []).map((d: any) => d.manicure_user_id), profile.user_id]));
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, user_id, full_name")
        .in("user_id", userIds);

      const rows = (profiles || []).map((p: any) => ({
        ...p,
        is_owner: p.user_id === profile.user_id,
      }));

      return rows.sort((a: any, b: any) => Number(b.is_owner) - Number(a.is_owner));
    },
    enabled: !!userId && isStudioOwner,
  });

  // Fetch blocks for validation
  const { data: blocks = [] } = useQuery({
    queryKey: ["blocks-all", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schedule_blocks")
        .select("*")
        .eq("user_id", userId!)
        .gte("end_at", new Date().toISOString());
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  // Busca TODOS os agendamentos vencidos (sem filtro de semana)
  const { data: overdueAppointments = [] } = useQuery({
    queryKey: ["overdue-appointments", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, clients(full_name, phone), services(name, duration_minutes)")
        .eq("user_id", userId!)
        .in("status", ["scheduled", "confirmed"])
        .lt("end_at", new Date().toISOString())
        .order("start_at");
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
    refetchInterval: 60000,
  });

  const checkBlockConflict = (date: string, time: string, durationMinutes: number): string | null => {
    if (!date || !time) return null;
    const start = new Date(`${date}T${time}:00`);
    const end = new Date(start.getTime() + durationMinutes * 60000);

    for (const block of blocks) {
      const blockStart = new Date(block.start_at);
      const blockEnd = new Date(block.end_at);
      if (start < blockEnd && end > blockStart) {
        return `Existe um bloqueio "${(block as any).title}" neste horário (${format(blockStart, "dd/MM HH:mm")} — ${format(blockEnd, "dd/MM HH:mm")})`;
      }
    }
    return null;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const selectedService = services.find((s: any) => s.id === form.service_id);
      const duration = selectedService?.duration_minutes || 30;

      // Check block conflict
      const conflict = checkBlockConflict(form.date, form.time, duration);
      if (conflict) {
        throw new Error(conflict);
      }

      // Salva com offset -03:00 para garantir fuso Brasília
      const start_at = `${form.date}T${form.time}:00-03:00`;
      // Calcula end_at somando duração aos minutos do horário digitado
      const [startH, startM] = form.time.split(":").map(Number);
      const totalMinutes = startH * 60 + startM + duration;
      const endH = Math.floor(totalMinutes / 60) % 24;
      const endMin = totalMinutes % 60;
      const endHStr = String(endH).padStart(2, "0");
      const endMinStr = String(endMin).padStart(2, "0");
      const end_at = `${form.date}T${endHStr}:${endMinStr}:00-03:00`;

      const payload: any = {
        user_id: userId!,
        client_id: form.client_id,
        service_id: form.service_id,
        start_at,
        end_at,
        notes: form.notes || null,
        status: form.status as any,
        price: selectedService?.price ? Number(selectedService.price) : null,
        source: "manual" as const,
      };

      if (form.manicure_id) {
        // Find the profile id for this manicure
        const manicure = studioManicures.find((m: any) => m.user_id === form.manicure_id);
        if (manicure) payload.manicure_id = manicure.id;
      }

      if (editingId) {
        const { error } = await supabase.from("appointments").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("appointments").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success(editingId ? "Agendamento atualizado!" : "Agendamento criado!");
      setDialogOpen(false);
      setBlockError(null);
      resetForm();
    },
    onError: (err: any) => {
      setBlockError(err.message);
      toast.error(err.message);
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("appointments").update({ status: status as any }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["overdue-appointments"] });
      queryClient.invalidateQueries({ queryKey: ["maintenance"] });
      queryClient.invalidateQueries({ queryKey: ["maintenance-badge"] });
      toast.success("Status atualizado!");
    },
  });

  const resetForm = () => {
    setForm({ client_id: "", service_id: "", manicure_id: "", date: "", time: "", notes: "", status: "scheduled" });
    setEditingId(null);
    setBlockError(null);
  };

  const openEdit = (apt: any) => {
    const selectedManicure = studioManicures.find((m: any) => m.id === apt.manicure_id);

    // Converte para Brasília para exibir no formulário
    // Converte UTC para Brasília antes de formatar para o input
    const startDate = new Date(apt.start_at);
    const brasiliaOffset = -3 * 60;
    const brasiliaTime = new Date(startDate.getTime() + brasiliaOffset * 60000);
    const dateForInput = brasiliaTime.toISOString().split("T")[0];
    setForm({
      client_id: apt.client_id,
      service_id: apt.service_id,
      manicure_id: selectedManicure?.user_id || "",
      date: dateForInput,
      time: formatBrasilia(apt.start_at, "time"),
      notes: apt.notes || "",
      status: apt.status,
    });
    setEditingId(apt.id);
    setDialogOpen(true);
  };

  // Validate on date/time change
  const handleDateTimeChange = (field: "date" | "time", value: string) => {
    const newForm = { ...form, [field]: value };
    setForm(newForm);
    const selectedService = services.find((s: any) => s.id === newForm.service_id);
    const conflict = checkBlockConflict(newForm.date, newForm.time, selectedService?.duration_minutes || 30);
    setBlockError(conflict);
  };

  return (
    <div className="space-y-6">
      {/* Overdue notifications */}
      {overdueAppointments.length > 0 && (
        <Alert variant="destructive" className="border-warning bg-warning/10">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>{overdueAppointments.length} agendamento(s) vencido(s)</strong> precisam ser atualizados.
            Marque como Concluído, Cancelado ou Não Compareceu.
            <div className="mt-2 space-y-1">
              {overdueAppointments.map((apt: any) => (
                <div key={apt.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>{apt.clients?.full_name} — {apt.services?.name} ({formatBrasilia(apt.start_at, "datetime")})</span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-6 text-xs"
                      onClick={() => statusMutation.mutate({ id: apt.id, status: "completed" })}>
                      Concluído
                    </Button>
                    <Button size="sm" variant="outline" className="h-6 text-xs"
                      onClick={() => statusMutation.mutate({ id: apt.id, status: "no_show" })}>
                      Não veio
                    </Button>
                    <Button size="sm" variant="outline" className="h-6 text-xs"
                      onClick={() => statusMutation.mutate({ id: apt.id, status: "cancelled" })}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Agendamentos</h1>
          <p className="text-muted-foreground">{appointments.length} agendamentos nesta semana</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Novo Agendamento</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Agendamento" : "Novo Agendamento"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-4">
              <div className="space-y-2">
                <Label>Cliente *</Label>
                <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {clients.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Serviço *</Label>
                <Select value={form.service_id} onValueChange={(v) => setForm({ ...form, service_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {services.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} ({s.duration_minutes}min — R$ {Number(s.price).toFixed(2)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Manicure selector for studios */}
              {isStudioOwner && studioManicures.length > 0 && (
                <div className="space-y-2">
                  <Label>Manicure</Label>
                  <Select value={form.manicure_id} onValueChange={(v) => setForm({ ...form, manicure_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione a manicure..." /></SelectTrigger>
                    <SelectContent>
                      {studioManicures.map((m: any) => (
                        <SelectItem key={m.user_id} value={m.user_id}>
                          {m.full_name}{m.is_owner ? " (dona)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data *</Label>
                  <Input type="date" value={form.date} onChange={(e) => handleDateTimeChange("date", e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Horário *</Label>
                  <Input type="time" value={form.time} onChange={(e) => handleDateTimeChange("time", e.target.value)} required />
                </div>
              </div>

              {blockError && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{blockError}</AlertDescription>
                </Alert>
              )}

              {editingId && (
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABELS).map(([key, { label }]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <Button type="submit" className="w-full" disabled={saveMutation.isPending || !form.client_id || !form.service_id || !!blockError}>
                {saveMutation.isPending ? "Salvando..." : editingId ? "Atualizar" : "Agendar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Week navigation */}
      <div className="flex items-center justify-center gap-4">
        <Button variant="outline" size="icon" onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="font-medium text-sm">
          {format(weekStart, "dd/MM", { locale: ptBR })} — {format(weekEnd, "dd/MM/yyyy", { locale: ptBR })}
        </span>
        <Button variant="outline" size="icon" onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}>
          <ChevronRight className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setCurrentWeek(new Date())}>Hoje</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : appointments.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Calendar className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>Nenhum agendamento nesta semana</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Serviço</TableHead>
                  <TableHead>Status</TableHead>
                  {isStudioOwner && <TableHead className="hidden md:table-cell">Manicure</TableHead>}
                  <TableHead className="hidden md:table-cell">Origem</TableHead>
                  <TableHead className="w-[80px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {appointments.map((apt: any) => {
                  const status = STATUS_LABELS[apt.status] || STATUS_LABELS.scheduled;
                  const isOverdue = isPast(new Date(apt.end_at)) && (apt.status === "scheduled" || apt.status === "confirmed");
                  return (
                    <TableRow key={apt.id} className={isOverdue ? "bg-warning/5 border-l-2 border-l-warning" : ""}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{formatBrasilia(apt.start_at, "date")}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatBrasilia(apt.start_at, "time")} — {formatBrasilia(apt.end_at, "time")}
                          </p>
                          {isOverdue && (
                            <span className="text-xs text-warning font-medium">⚠ Vencido</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{apt.clients?.full_name}</p>
                          <p className="text-xs text-muted-foreground">{apt.clients?.phone}</p>
                        </div>
                      </TableCell>
                      <TableCell>{apt.services?.name}</TableCell>
                      <TableCell>
                        <Select
                          value={apt.status}
                          onValueChange={(v) => statusMutation.mutate({ id: apt.id, status: v })}
                        >
                          <SelectTrigger className={`w-[140px] h-7 text-xs ${status.color}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(STATUS_LABELS).map(([key, { label }]) => (
                              <SelectItem key={key} value={key}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      {isStudioOwner && (
                        <TableCell className="hidden md:table-cell text-sm">
                          {(apt as any).manicure?.full_name || "—"}
                        </TableCell>
                      )}
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="outline">{SOURCE_LABELS[apt.source] || apt.source}</Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(apt)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                      </TableCell>
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
