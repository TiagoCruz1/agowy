import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Scissors, Percent } from "lucide-react";

interface ServiceForm {
  name: string;
  description: string;
  duration_minutes: number;
  price: number;
  commission_percentage: number;
  maintenance_interval_days: number;
  maintenance_alert_days: number;
}

const defaultServices = [
  { name: "Manicure Simples", description: "Cuticulagem e esmaltação", duration_minutes: 40, price: 35 },
  { name: "Pedicure Simples", description: "Cuticulagem e esmaltação dos pés", duration_minutes: 50, price: 45 },
  { name: "Manicure + Pedicure", description: "Combo mãos e pés", duration_minutes: 80, price: 70 },
  { name: "Esmaltação em Gel", description: "Aplicação de esmalte em gel com cabine UV", duration_minutes: 60, price: 60 },
  { name: "Unhas em Gel (Alongamento)", description: "Alongamento de unhas com gel moldado", duration_minutes: 120, price: 150 },
  { name: "Unhas de Fibra de Vidro", description: "Alongamento com fibra de vidro", duration_minutes: 120, price: 140 },
  { name: "Blindagem de Unhas", description: "Proteção e fortalecimento das unhas naturais", duration_minutes: 50, price: 55 },
];

const emptyForm: ServiceForm = {
  name: "", description: "", duration_minutes: 30, price: 0,
  commission_percentage: 0, maintenance_interval_days: 21, maintenance_alert_days: 15,
};

export default function Services() {
  const { user } = useAuth();
  const { effectiveUserId } = useEffectiveUser();
  const { isManicure, isStudioOwner } = useUserRole();
  const userId = effectiveUserId || user?.id;
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ServiceForm>(emptyForm);
  const [bulkCommission, setBulkCommission] = useState<number>(0);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);

  // Para submanicures, busca serviços da dona do estúdio
  const { data: ownerProfile } = useQuery({
    queryKey: ["studio-owner"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id").eq("account_type", "studio").single();
      return data;
    },
    enabled: !!isManicure,
  });

  const effectiveOwnerId = isManicure ? ownerProfile?.user_id : userId;

  const { data: services = [], isLoading } = useQuery({
    queryKey: ["services", effectiveOwnerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services").select("*").eq("user_id", effectiveOwnerId!).order("display_order").order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveOwnerId,
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      const payload = defaultServices.map((s, i) => ({ ...s, user_id: userId!, display_order: i }));
      const { error } = await supabase.from("services").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["services"] }); toast.success("Serviços padrão cadastrados!"); },
  });

  useEffect(() => {
    if (!isLoading && services.length === 0 && userId && !isManicure) seedMutation.mutate();
  }, [isLoading, services.length, userId]);

  const saveMutation = useMutation({
    mutationFn: async (form: ServiceForm) => {
      if (editingId) {
        const { error } = await supabase.from("services").update(form).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("services").insert({ ...form, user_id: userId! });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
      toast.success(editingId ? "Serviço atualizado!" : "Serviço criado!");
      setDialogOpen(false);
      resetForm();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("services").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["services"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("services").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["services"] }); toast.success("Serviço removido!"); },
    onError: () => toast.error("Não é possível remover um serviço com agendamentos"),
  });

  const resetForm = () => { setForm(emptyForm); setEditingId(null); };

  const bulkCommissionMutation = useMutation({
    mutationFn: async (pct: number) => {
      const ids = services.map((s: any) => s.id);
      for (const id of ids) {
        const { error } = await supabase.from("services").update({ commission_percentage: pct }).eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
      toast.success(`Comissão de ${bulkCommission}% aplicada a todos os serviços!`);
      setBulkDialogOpen(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const openEdit = (service: any) => {
    setForm({
      name: service.name,
      description: service.description || "",
      duration_minutes: service.duration_minutes,
      price: Number(service.price),
      commission_percentage: Number(service.commission_percentage || 0),
      maintenance_interval_days: service.maintenance_interval_days || 21,
      maintenance_alert_days: service.maintenance_alert_days || 15,
    });
    setEditingId(service.id);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Serviços</h1>
          <p className="text-muted-foreground">
            {services.filter((s: any) => s.is_active).length} serviços ativos
            {isManicure && " — somente visualização"}
          </p>
        </div>
        {!isManicure && (
          <div className="flex gap-2">
            <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline"><Percent className="w-4 h-4 mr-2" /> Comissão Geral</Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>Definir Comissão para Todos</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">Define o mesmo percentual de comissão para todos os {services.length} serviços de uma vez.</p>
                  <div className="space-y-2">
                    <Label>Comissão (%)</Label>
                    <Input
                      type="number" min={0} max={100} step={0.5}
                      value={bulkCommission}
                      onChange={(e) => setBulkCommission(Number(e.target.value))}
                      placeholder="Ex: 50"
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => bulkCommissionMutation.mutate(bulkCommission)}
                    disabled={bulkCommissionMutation.isPending}
                  >
                    {bulkCommissionMutation.isPending ? "Aplicando..." : `Aplicar ${bulkCommission}% a todos`}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
              <DialogTrigger asChild>
                <Button><Plus className="w-4 h-4 mr-2" /> Novo Serviço</Button>
              </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar Serviço" : "Novo Serviço"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Duração (minutos)</Label>
                    <Input type="number" min={5} value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Preço (R$)</Label>
                    <Input type="number" min={0} step={0.01} value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Comissão da Manicure (%)</Label>
                  <Input type="number" min={0} max={100} step={0.5} value={form.commission_percentage} onChange={(e) => setForm({ ...form, commission_percentage: Number(e.target.value) })} placeholder="Ex: 50" />
                  <p className="text-xs text-muted-foreground">
                    {form.commission_percentage > 0 && form.price > 0
                      ? `Manicure recebe R$ ${(form.price * form.commission_percentage / 100).toFixed(2)} por atendimento`
                      : "Percentual sobre o valor total do serviço"}
                  </p>
                </div>
                <div className="border-t pt-3 space-y-3">
                  <p className="text-sm font-medium">Manutenção</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Intervalo (dias)</Label>
                      <Input type="number" min={1} value={form.maintenance_interval_days} onChange={(e) => setForm({ ...form, maintenance_interval_days: Number(e.target.value) })} />
                      <p className="text-xs text-muted-foreground">A cada quantos dias precisa de retoque</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Avisar antes (dias)</Label>
                      <Input type="number" min={1} value={form.maintenance_alert_days} onChange={(e) => setForm({ ...form, maintenance_alert_days: Number(e.target.value) })} />
                      <p className="text-xs text-muted-foreground">Quantos dias antes de vencer</p>
                    </div>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Salvando..." : editingId ? "Atualizar" : "Cadastrar"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serviço</TableHead>
                  <TableHead>Duração</TableHead>
                  <TableHead>Preço</TableHead>
                  {!isManicure && <TableHead>Comissão</TableHead>}
                  {!isManicure && <TableHead>Manutenção</TableHead>}
                  {!isManicure && <TableHead>Ativo</TableHead>}
                  {!isManicure && <TableHead className="w-[100px]">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {services.map((service: any) => (
                  <TableRow key={service.id} className={!service.is_active ? "opacity-50" : ""}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{service.name}</p>
                        {service.description && <p className="text-sm text-muted-foreground">{service.description}</p>}
                      </div>
                    </TableCell>
                    <TableCell>{service.duration_minutes} min</TableCell>
                    <TableCell>R$ {Number(service.price).toFixed(2)}</TableCell>
                    {!isManicure && (
                      <TableCell>
                        {service.commission_percentage > 0
                          ? `${service.commission_percentage}% (R$ ${(Number(service.price) * Number(service.commission_percentage) / 100).toFixed(2)})`
                          : "—"}
                      </TableCell>
                    )}
                    {!isManicure && (
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          A cada {service.maintenance_interval_days || 21} dias<br />
                          Avisa {service.maintenance_alert_days || 15}d antes
                        </span>
                      </TableCell>
                    )}
                    {!isManicure && (
                      <TableCell>
                        <Switch
                          checked={service.is_active}
                          onCheckedChange={(checked) => toggleMutation.mutate({ id: service.id, is_active: checked })}
                        />
                      </TableCell>
                    )}
                    {!isManicure && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(service)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(service.id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
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
