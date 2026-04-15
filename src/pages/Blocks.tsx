import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Plus, Trash2, Ban, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { formatBrasilia } from "@/lib/utils";
import { ptBR } from "date-fns/locale";

interface BlockForm {
  title: string;
  reason: string;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  all_day: boolean;
}

const emptyForm: BlockForm = {
  title: "", reason: "",
  start_date: "", start_time: "08:00",
  end_date: "", end_time: "18:00",
  all_day: false,
};

export default function Blocks() {
  const { user } = useAuth();
  const { effectiveUserId } = useEffectiveUser();
  const userId = effectiveUserId || user?.id;
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<BlockForm>(emptyForm);
  const [conflictingAppointments, setConflictingAppointments] = useState<any[]>([]);
  const [showConflictWarning, setShowConflictWarning] = useState(false);

  const { data: blocks = [], isLoading } = useQuery({
    queryKey: ["blocks", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schedule_blocks")
        .select("*")
        .eq("user_id", userId!)
        .gte("end_at", new Date().toISOString())
        .order("start_at");
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const checkConflicts = async (startAt: string, endAt: string) => {
    const { data, error } = await supabase
      .from("appointments")
      .select("*, clients(full_name), services(name)")
      .eq("user_id", userId!)
      .neq("status", "cancelled")
      .lt("start_at", endAt)
      .gt("end_at", startAt);
    if (error) return [];
    return data || [];
  };

  const saveMutation = useMutation({
    mutationFn: async (force: boolean) => {
      const start_at = form.all_day
        ? `${form.start_date}T00:00:00`
        : `${form.start_date}T${form.start_time}:00`;
      const end_at = form.all_day
        ? `${form.end_date || form.start_date}T23:59:59`
        : `${form.end_date || form.start_date}T${form.end_time}:00`;

      if (!force) {
        const conflicts = await checkConflicts(start_at, end_at);
        if (conflicts.length > 0) {
          setConflictingAppointments(conflicts);
          setShowConflictWarning(true);
          throw new Error("CONFLICT");
        }
      }

      const { error } = await supabase.from("schedule_blocks").insert({
        user_id: userId!,
        title: form.title,
        reason: form.reason || null,
        start_at,
        end_at,
        all_day: form.all_day,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blocks"] });
      toast.success("Bloqueio criado!");
      setDialogOpen(false);
      setForm(emptyForm);
      setShowConflictWarning(false);
      setConflictingAppointments([]);
    },
    onError: (err: any) => {
      if (err.message !== "CONFLICT") toast.error(err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("schedule_blocks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blocks"] });
      toast.success("Bloqueio removido!");
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Bloqueios de Agenda</h1>
          <p className="text-muted-foreground">
            Bloqueie datas e horários em que não poderá atender
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) { setForm(emptyForm); setShowConflictWarning(false); setConflictingAppointments([]); }
        }}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Novo Bloqueio</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Novo Bloqueio</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(false); }} className="space-y-4">
              <div className="space-y-2">
                <Label>Título *</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex: Férias, Compromisso pessoal" required />
              </div>
              <div className="space-y-2">
                <Label>Motivo</Label>
                <Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Opcional..." />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.all_day} onCheckedChange={(checked) => setForm({ ...form, all_day: checked })} />
                <Label>Dia inteiro</Label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data início *</Label>
                  <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Data fim</Label>
                  <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
                </div>
              </div>
              {!form.all_day && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Hora início</Label>
                    <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Hora fim</Label>
                    <Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
                  </div>
                </div>
              )}

              {showConflictWarning && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <p className="font-semibold mb-2">
                      ⚠ Existem {conflictingAppointments.length} agendamento(s) neste período:
                    </p>
                    <ul className="text-sm space-y-1 mb-3">
                      {conflictingAppointments.map((apt: any) => (
                        <li key={apt.id}>
                          • {apt.clients?.full_name} — {apt.services?.name} ({formatBrasilia(apt.start_at, "datetime")})
                        </li>
                      ))}
                    </ul>
                    <p className="text-sm mb-2">
                      As clientes serão notificadas e precisarão reagendar. Deseja continuar?
                    </p>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant="destructive"
                        onClick={() => saveMutation.mutate(true)}
                        disabled={saveMutation.isPending}>
                        Sim, criar bloqueio
                      </Button>
                      <Button type="button" size="sm" variant="outline"
                        onClick={() => { setShowConflictWarning(false); setConflictingAppointments([]); }}>
                        Cancelar
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {!showConflictWarning && (
                <Button type="submit" className="w-full" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Salvando..." : "Criar Bloqueio"}
                </Button>
              )}
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        </div>
      ) : blocks.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <Ban className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>Nenhum bloqueio futuro cadastrado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {blocks.map((block: any) => (
            <Card key={block.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <div className="w-1 h-10 rounded-full bg-destructive" />
                  <div>
                    <p className="font-medium">{block.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {block.all_day
                        ? format(new Date(block.start_at), "dd/MM/yyyy", { locale: ptBR })
                        : `${format(new Date(block.start_at), "dd/MM/yyyy HH:mm")} — ${format(new Date(block.end_at), "dd/MM/yyyy HH:mm")}`}
                      {block.start_at.slice(0, 10) !== block.end_at.slice(0, 10) && !block.all_day
                        ? ""
                        : block.all_day && block.start_at.slice(0, 10) !== block.end_at.slice(0, 10)
                        ? ` — ${format(new Date(block.end_at), "dd/MM/yyyy", { locale: ptBR })}`
                        : ""}
                    </p>
                    {block.reason && <p className="text-xs text-muted-foreground mt-1">{block.reason}</p>}
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(block.id)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
