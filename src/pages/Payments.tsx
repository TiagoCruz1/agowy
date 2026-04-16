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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Receipt, Plus, CheckCircle, Upload, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export default function Payments() {
  const { user } = useAuth();
  const { effectiveUserId } = useEffectiveUser();
  const { isStudioOwner, isManicure, isLoading: roleLoading } = useUserRole();
  const userId = effectiveUserId || user?.id;
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [expandedReceipt, setExpandedReceipt] = useState<string | null>(null);
  const [newReceipt, setNewReceipt] = useState({
    manicure_user_id: "",
    period_start: format(startOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd"),
    period_end: format(endOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd"),
    notes: "",
  });

  const { data: ownerProfile } = useQuery({
    queryKey: ["owner-profile", userId],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, user_id").eq("user_id", userId!).single();
      return data;
    },
    enabled: !!userId && isStudioOwner,
  });

  const { data: studioManicures = [] } = useQuery({
    queryKey: ["studio-manicures-pay", userId],
    queryFn: async () => {
      if (!ownerProfile?.id) return [];
      const { data: links } = await supabase.from("studio_manicures").select("manicure_user_id").eq("studio_profile_id", ownerProfile.id).eq("is_active", true);
      if (!links?.length) return [];
      const userIds = links.map((l: any) => l.manicure_user_id);
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds);
      return profiles || [];
    },
    enabled: !!userId && isStudioOwner && !!ownerProfile?.id,
  });

  const { data: receipts = [], isLoading } = useQuery({
    queryKey: ["payment-receipts", userId],
    queryFn: async () => {
      let query = supabase
        .from("payment_receipts")
        .select("*")
        .order("created_at", { ascending: false });

      if (isStudioOwner) {
        query = query.eq("studio_user_id", userId!);
      } else {
        query = query.eq("manicure_user_id", userId!);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Busca nomes das manicures
      const manicureIds = [...new Set((data || []).map((r: any) => r.manicure_user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", manicureIds);

      const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p.full_name]));

      return (data || []).map((r: any) => ({
        ...r,
        manicure_name: profileMap.get(r.manicure_user_id) || "—",
      }));
    },
    enabled: !!userId && !roleLoading,
  });

  const { data: receiptItems } = useQuery({
    queryKey: ["payment-receipt-items", expandedReceipt],
    queryFn: async () => {
      const { data } = await supabase
        .from("payment_receipt_items")
        .select("*")
        .eq("receipt_id", expandedReceipt!);
      return data || [];
    },
    enabled: !!expandedReceipt,
  });

  // Preview dos agendamentos para o recibo a ser criado
  const { data: previewItems = [] } = useQuery({
    queryKey: ["receipt-preview", newReceipt.manicure_user_id, newReceipt.period_start, newReceipt.period_end],
    queryFn: async () => {
      if (!newReceipt.manicure_user_id) return [];
      const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", newReceipt.manicure_user_id).single();
      if (!profile) return [];

      const { data } = await supabase
        .from("appointments")
        .select("id, start_at, price, services(name, commission_percentage), clients(full_name)")
        .eq("user_id", userId!)
        .eq("status", "completed")
        .or(`manicure_id.eq.${profile.id}`)
        .gte("start_at", `${newReceipt.period_start}T00:00:00`)
        .lte("start_at", `${newReceipt.period_end}T23:59:59`);
      return data || [];
    },
    enabled: !!newReceipt.manicure_user_id && !!newReceipt.period_start && !!newReceipt.period_end && isStudioOwner,
  });

  const totalPreview = previewItems.reduce((sum: number, a: any) => {
    const pct = a.services?.commission_percentage || 0;
    return sum + (a.price || 0) * (pct / 100);
  }, 0);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!newReceipt.manicure_user_id) throw new Error("Selecione a manicure");
      if (!previewItems.length) throw new Error("Nenhum agendamento no período");

      const { data: receipt, error } = await supabase
        .from("payment_receipts")
        .insert({
          studio_user_id: userId!,
          manicure_user_id: newReceipt.manicure_user_id,
          amount: totalPreview,
          period_start: newReceipt.period_start,
          period_end: newReceipt.period_end,
          notes: newReceipt.notes || null,
          status: "pending",
        })
        .select().single();
      if (error) throw error;

      const items = previewItems.map((a: any) => {
        const pct = Number(a.services?.commission_percentage || 0);
        const val = Number(a.price || 0) * (pct / 100);
        return {
          receipt_id: receipt.id,
          appointment_id: a.id,
          service_name: a.services?.name || "",
          service_value: Number(a.price || 0),
          commission_percentage: pct,
          commission_value: val,
        };
      });

      await supabase.from("payment_receipt_items").insert(items);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-receipts"] });
      toast.success("Recibo criado!");
      setCreateOpen(false);
      setNewReceipt({ manicure_user_id: "", period_start: format(startOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd"), period_end: format(endOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd"), notes: "" });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const signMutation = useMutation({
    mutationFn: async (receiptId: string) => {
      const { error } = await supabase.from("payment_receipts")
        .update({ status: "signed", digital_signature_at: new Date().toISOString() })
        .eq("id", receiptId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-receipts"] });
      toast.success("Recibo assinado digitalmente!");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (receiptId: string) => {
      await supabase.from("payment_receipt_items").delete().eq("receipt_id", receiptId);
      const { error } = await supabase.from("payment_receipts").delete().eq("id", receiptId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-receipts"] });
      toast.success("Recibo apagado!");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const uploadSignatureMutation = useMutation({
    mutationFn: async ({ receiptId, file }: { receiptId: string; file: File }) => {
      const path = `signatures/${receiptId}/${file.name}`;
      const { error: uploadError } = await supabase.storage.from("receipts").upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("receipts").getPublicUrl(path);
      const { error } = await supabase.from("payment_receipts")
        .update({ status: "signed", manual_signature_url: urlData.publicUrl })
        .eq("id", receiptId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-receipts"] });
      toast.success("Assinatura enviada!");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const statusColor = (status: string) => {
    if (status === "signed") return "bg-success/10 text-success";
    if (status === "pending") return "bg-warning/10 text-warning";
    return "bg-muted text-muted-foreground";
  };

  const statusLabel = (status: string) => {
    if (status === "signed") return "Assinado";
    if (status === "pending") return "Pendente";
    return status;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Receipt className="w-8 h-8 text-primary" />
            Pagamentos
          </h1>
          <p className="text-muted-foreground">Recibos de comissão para manicures</p>
        </div>
        {isStudioOwner && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Novo Recibo
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : receipts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Receipt className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>Nenhum recibo gerado ainda</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Período</TableHead>
                  {isStudioOwner && <TableHead>Manicure</TableHead>}
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipts.map((r: any) => (
                  <>
                    <TableRow key={r.id} className="cursor-pointer hover:bg-muted/30">
                      <TableCell>
                        <p className="font-medium">
                          {format(new Date(r.period_start + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })} —{" "}
                          {format(new Date(r.period_end + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Gerado em {format(new Date(r.created_at), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                      </TableCell>
                      {isStudioOwner && (
                        <TableCell>{r.manicure_name || "—"}</TableCell>
                      )}
                      <TableCell className="text-right font-bold">{formatBRL(r.amount)}</TableCell>
                      <TableCell>
                        <Badge className={statusColor(r.status)}>{statusLabel(r.status)}</Badge>
                        {r.digital_signature_at && (
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {format(new Date(r.digital_signature_at), "dd/MM HH:mm", { locale: ptBR })}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="sm" className="h-7 text-xs"
                            onClick={() => setExpandedReceipt(expandedReceipt === r.id ? null : r.id)}>
                            {expandedReceipt === r.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            Detalhes
                          </Button>
                          {r.status === "pending" && (
                            <>
                              <Button size="sm" variant="default" className="h-7 text-xs gap-1"
                                onClick={() => signMutation.mutate(r.id)}>
                                <CheckCircle className="w-3 h-3" />
                                Assinar
                              </Button>
                              <label className="cursor-pointer">
                                <input type="file" accept="image/*,.pdf" className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) uploadSignatureMutation.mutate({ receiptId: r.id, file });
                                  }} />
                                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" asChild>
                                  <span><Upload className="w-3 h-3" /> Foto</span>
                                </Button>
                              </label>
                            </>
                          )}
                          {isStudioOwner && (
                            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                              onClick={() => { if (confirm("Apagar este recibo?")) deleteMutation.mutate(r.id); }}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedReceipt === r.id && (
                      <TableRow key={r.id + "-detail"}>
                        <TableCell colSpan={isStudioOwner ? 5 : 4} className="bg-muted/20 p-0">
                          <div className="p-4">
                            <p className="text-sm font-medium mb-2">Agendamentos incluídos:</p>
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-muted-foreground text-xs">
                                  <th className="text-left pb-1">Serviço</th>
                                  <th className="text-right pb-1">Valor</th>
                                  <th className="text-right pb-1">Comissão %</th>
                                  <th className="text-right pb-1">Comissão R$</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(receiptItems || []).map((item: any) => (
                                  <tr key={item.id} className="border-t border-muted">
                                    <td className="py-1">{item.service_name}</td>
                                    <td className="text-right">{formatBRL(item.service_value)}</td>
                                    <td className="text-right">{item.commission_percentage}%</td>
                                    <td className="text-right text-primary font-medium">{formatBRL(item.commission_value)}</td>
                                  </tr>
                                ))}
                                <tr className="border-t-2 border-primary/20 font-bold">
                                  <td colSpan={3} className="pt-2">Total</td>
                                  <td className="text-right pt-2 text-primary">{formatBRL(r.amount)}</td>
                                </tr>
                              </tbody>
                            </table>
                            {r.notes && <p className="text-xs text-muted-foreground mt-2">Obs: {r.notes}</p>}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Modal criar recibo */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Recibo de Comissão</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Manicure *</Label>
              <Select value={newReceipt.manicure_user_id} onValueChange={(v) => setNewReceipt({ ...newReceipt, manicure_user_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {studioManicures.map((m: any) => (
                    <SelectItem key={m.user_id} value={m.user_id}>{m.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Período início *</Label>
                <Input type="date" value={newReceipt.period_start} onChange={(e) => setNewReceipt({ ...newReceipt, period_start: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Período fim *</Label>
                <Input type="date" value={newReceipt.period_end} onChange={(e) => setNewReceipt({ ...newReceipt, period_end: e.target.value })} />
              </div>
            </div>

            {previewItems.length > 0 && (
              <div className="bg-muted/30 rounded-lg p-3 space-y-1">
                <p className="text-sm font-medium">{previewItems.length} agendamento(s) no período</p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {previewItems.map((a: any) => {
                    const pct = a.services?.commission_percentage || 0;
                    const val = (a.price || 0) * (pct / 100);
                    return (
                      <div key={a.id} className="flex justify-between text-xs">
                        <span>{a.services?.name} — {a.clients?.full_name}</span>
                        <span className="text-primary font-medium">{formatBRL(val)}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="border-t pt-1 flex justify-between font-bold text-sm">
                  <span>Total comissão</span>
                  <span className="text-primary">{formatBRL(totalPreview)}</span>
                </div>
              </div>
            )}

            {newReceipt.manicure_user_id && previewItems.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-2">Nenhum agendamento concluído no período</p>
            )}

            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea value={newReceipt.notes} onChange={(e) => setNewReceipt({ ...newReceipt, notes: e.target.value })} placeholder="Opcional..." />
            </div>

            <Button className="w-full" onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !newReceipt.manicure_user_id || !previewItems.length}>
              {createMutation.isPending ? "Gerando..." : `Gerar Recibo — ${formatBRL(totalPreview)}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
