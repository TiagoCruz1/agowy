import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Scissors } from "lucide-react";

interface ServiceForm {
  name: string;
  description: string;
  duration_minutes: number;
  price: number;
}

const defaultServices = [
  { name: "Manicure Simples", description: "Cuticulagem e esmaltação", duration_minutes: 40, price: 35 },
  { name: "Pedicure Simples", description: "Cuticulagem e esmaltação dos pés", duration_minutes: 50, price: 45 },
  { name: "Manicure + Pedicure", description: "Combo mãos e pés", duration_minutes: 80, price: 70 },
  { name: "Esmaltação em Gel", description: "Aplicação de esmalte em gel com cabine UV", duration_minutes: 60, price: 60 },
  { name: "Unhas em Gel (Alongamento)", description: "Alongamento de unhas com gel moldado", duration_minutes: 120, price: 150 },
  { name: "Unhas de Fibra de Vidro", description: "Alongamento com fibra de vidro", duration_minutes: 120, price: 140 },
  { name: "Unhas em Acrílico (Porcelana)", description: "Alongamento com pó acrílico", duration_minutes: 120, price: 160 },
  { name: "Manutenção de Alongamento", description: "Retoque e preenchimento do alongamento", duration_minutes: 90, price: 100 },
  { name: "Banho de Gel", description: "Cobertura das unhas naturais com gel", duration_minutes: 60, price: 70 },
  { name: "Blindagem de Unhas", description: "Proteção e fortalecimento das unhas naturais", duration_minutes: 50, price: 55 },
  { name: "Nail Art / Decoração", description: "Decoração artística nas unhas", duration_minutes: 30, price: 30 },
  { name: "Remoção de Gel/Acrílico", description: "Remoção segura de alongamento", duration_minutes: 45, price: 40 },
  { name: "Spa dos Pés", description: "Esfoliação, hidratação e massagem nos pés", duration_minutes: 60, price: 80 },
  { name: "Spa das Mãos", description: "Esfoliação, hidratação e massagem nas mãos", duration_minutes: 45, price: 60 },
];

const emptyForm: ServiceForm = { name: "", description: "", duration_minutes: 30, price: 0 };

export default function Services() {
  const { user } = useAuth();
  const { effectiveUserId } = useEffectiveUser();
  const userId = effectiveUserId || user?.id;
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ServiceForm>(emptyForm);

  const { data: services = [], isLoading } = useQuery({
    queryKey: ["services", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("user_id", userId!)
        .order("display_order")
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  // Seed default services on first load
  const seedMutation = useMutation({
    mutationFn: async () => {
      const payload = defaultServices.map((s, i) => ({
        ...s,
        user_id: userId!,
        display_order: i,
      }));
      const { error } = await supabase.from("services").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
      toast.success("Serviços padrão cadastrados!");
    },
  });

  useEffect(() => {
    if (!isLoading && services.length === 0 && userId) {
      seedMutation.mutate();
    }
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
      toast.success("Serviço removido!");
    },
    onError: () => toast.error("Não é possível remover um serviço com agendamentos"),
  });

  const resetForm = () => { setForm(emptyForm); setEditingId(null); };

  const openEdit = (service: any) => {
    setForm({
      name: service.name,
      description: service.description || "",
      duration_minutes: service.duration_minutes,
      price: Number(service.price),
    });
    setEditingId(service.id);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Serviços</h1>
          <p className="text-muted-foreground">{services.filter((s: any) => s.is_active).length} serviços ativos</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Novo Serviço</Button>
          </DialogTrigger>
          <DialogContent>
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
              <Button type="submit" className="w-full" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Salvando..." : editingId ? "Atualizar" : "Cadastrar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : services.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Scissors className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>Carregando serviços padrão...</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serviço</TableHead>
                  <TableHead>Duração</TableHead>
                  <TableHead>Preço</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead className="w-[100px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {services.map((service: any) => (
                  <TableRow key={service.id} className={!service.is_active ? "opacity-50" : ""}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{service.name}</p>
                        {service.description && (
                          <p className="text-sm text-muted-foreground">{service.description}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{service.duration_minutes} min</TableCell>
                    <TableCell>R$ {Number(service.price).toFixed(2)}</TableCell>
                    <TableCell>
                      <Switch
                        checked={service.is_active}
                        onCheckedChange={(checked) => toggleMutation.mutate({ id: service.id, is_active: checked })}
                      />
                    </TableCell>
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
