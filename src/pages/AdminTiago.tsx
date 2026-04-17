import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Shield, Users, Calendar, MessageCircle, Database, Bot, RefreshCw, Pencil, Eye, EyeOff, ExternalLink, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const ADMIN_PASSWORD = "tiago@agowy2026";

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

export default function AdminTiago() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem("agowy_admin") === "ok");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/20">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              Admin Agowy
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Senha</Label>
              <div className="relative">
                <Input
                  type={showPw ? "text" : "password"}
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && pw === ADMIN_PASSWORD) {
                      sessionStorage.setItem("agowy_admin", "ok");
                      setAuthed(true);
                    }
                  }}
                  placeholder="Senha de acesso"
                />
                <button className="absolute right-2 top-2 text-muted-foreground" onClick={() => setShowPw(!showPw)}>
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button className="w-full" onClick={() => {
              if (pw === ADMIN_PASSWORD) {
                sessionStorage.setItem("agowy_admin", "ok");
                setAuthed(true);
              } else {
                toast.error("Senha incorreta");
              }
            }}>Entrar</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <AdminPanel onLogout={() => { sessionStorage.removeItem("agowy_admin"); setAuthed(false); }} />;
}

function AdminPanel({ onLogout }: { onLogout: () => void }) {
  const queryClient = useQueryClient();
  const [editUser, setEditUser] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [sqlQuery, setSqlQuery] = useState("");
  const [sqlResult, setSqlResult] = useState<any>(null);
  const [sqlLoading, setSqlLoading] = useState(false);
  const [selectedConv, setSelectedConv] = useState<any>(null);
  const navigate = useNavigate();

  const { data: stats } = useQuery({
    queryKey: ["atiago-stats"],
    queryFn: async () => {
      const [{ count: users }, { count: apts }, { count: clients }, { count: convs }] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("appointments").select("*", { count: "exact", head: true }),
        supabase.from("clients").select("*", { count: "exact", head: true }),
        supabase.from("whatsapp_conversations").select("*", { count: "exact", head: true }),
      ]);
      const { data: rev } = await supabase.from("appointments").select("price").eq("status", "completed");
      const totalRev = (rev || []).reduce((s, a) => s + (Number(a.price) || 0), 0);
      return { users: users || 0, apts: apts || 0, clients: clients || 0, convs: convs || 0, totalRev };
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["atiago-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      return data || [];
    },
  });

  const { data: allRoles = [] } = useQuery({
    queryKey: ["atiago-roles"],
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("*");
      return data || [];
    },
  });

  const { data: recentApts = [] } = useQuery({
    queryKey: ["atiago-apts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("appointments")
        .select("*, clients(full_name), services(name), owner:profiles!appointments_user_id_fkey(full_name, business_name), manicure:profiles!appointments_manicure_id_fkey(full_name)")
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  const { data: conversations = [] } = useQuery({
    queryKey: ["atiago-convs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_conversations")
        .select("*")
        .order("last_message_at", { ascending: false })
        .limit(100);
      return data || [];
    },
  });

  const { data: aiSettings = [] } = useQuery({
    queryKey: ["atiago-ai"],
    queryFn: async () => {
      const { data } = await supabase.from("ai_settings").select("*");
      return data || [];
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async (form: any) => {
      const { error } = await supabase.from("profiles").update({
        full_name: form.full_name,
        business_name: form.business_name,
        phone: form.phone,
        account_type: form.account_type,
      }).eq("id", form.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["atiago-profiles"] });
      toast.success("Usuário atualizado!");
      setEditUser(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteConvMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("whatsapp_conversations").update({ state_data: {} }).eq("id", id);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["atiago-convs"] }); toast.success("Histórico limpo!"); },
  });

  const toggleAIMutation = useMutation({
    mutationFn: async ({ userId, enabled }: { userId: string; enabled: boolean }) => {
      const { error } = await supabase.from("ai_settings").update({ ai_globally_enabled: enabled }).eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["atiago-ai"] }); toast.success("IA atualizada!"); },
  });

  const runSQL = async () => {
    if (!sqlQuery.trim()) return;
    setSqlLoading(true);
    setSqlResult(null);
    try {
      const tables = ["profiles","appointments","clients","services","whatsapp_conversations","user_roles","ai_settings","studio_manicures","maintenance_alerts","payment_receipts","payment_receipt_items","working_hours","schedule_blocks","reviews"];
      const q = sqlQuery.trim().toLowerCase();
      let result: any = null;

      if (q.startsWith("select")) {
        const tableMatch = tables.find(t => q.includes(t));
        if (tableMatch) {
          const limitMatch = q.match(/limit\s+(\d+)/);
          const lim = limitMatch ? parseInt(limitMatch[1]) : 50;
          let query = supabase.from(tableMatch as any).select("*").limit(lim);
          const whereMatch = sqlQuery.match(/WHERE\s+(\w+)\s*=\s*'([^']+)'/i);
          if (whereMatch) query = (query as any).eq(whereMatch[1], whereMatch[2]);
          const { data, error } = await query;
          result = error ? { error: error.message } : { data, count: data?.length };
        } else {
          result = { error: "Tabela não reconhecida. Use uma das tabelas do sistema." };
        }
      } else if (q.startsWith("update") || q.startsWith("delete") || q.startsWith("insert")) {
        result = { info: "Para UPDATE/DELETE/INSERT use o painel do Supabase diretamente por segurança." };
      } else {
        result = { error: "Apenas SELECT é suportado aqui." };
      }
      setSqlResult(result);
    } catch (e: any) {
      setSqlResult({ error: e.message });
    }
    setSqlLoading(false);
  };

  const getRoles = (userId: string) => allRoles.filter((r: any) => r.user_id === userId).map((r: any) => r.role);

  const statusColor: Record<string, string> = {
    completed: "bg-green-100 text-green-700",
    cancelled: "bg-red-100 text-red-700",
    scheduled: "bg-gray-100 text-gray-600",
    confirmed: "bg-blue-100 text-blue-700",
    no_show: "bg-yellow-100 text-yellow-700",
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-primary" />
            <span className="font-bold text-lg">Agowy Admin</span>
            <Badge variant="destructive" className="text-[10px]">PRIVADO</Badge>
          </div>
          <Button variant="outline" size="sm" onClick={onLogout}>Sair</Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: "Usuários", value: stats?.users },
            { label: "Agendamentos", value: stats?.apts },
            { label: "Clientes", value: stats?.clients },
            { label: "Conversas WA", value: stats?.convs },
            { label: "Faturamento Total", value: formatBRL(stats?.totalRev || 0) },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground mb-1">{s.label}</div>
                <div className="text-xl font-bold">{s.value ?? "—"}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="users">
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="users"><Users className="w-3 h-3 mr-1" />Usuários</TabsTrigger>
            <TabsTrigger value="appointments"><Calendar className="w-3 h-3 mr-1" />Agendamentos</TabsTrigger>
            <TabsTrigger value="whatsapp"><MessageCircle className="w-3 h-3 mr-1" />WhatsApp</TabsTrigger>
            <TabsTrigger value="bot"><Bot className="w-3 h-3 mr-1" />Bot/IA</TabsTrigger>
            <TabsTrigger value="sql"><Database className="w-3 h-3 mr-1" />SQL</TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Todos os Usuários</CardTitle>
                <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["atiago-profiles"] })}>
                  <RefreshCw className="w-3 h-3 mr-1" />Atualizar
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Negócio</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Roles</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Criado</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profiles.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.full_name}</TableCell>
                        <TableCell>{p.business_name || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={p.account_type === "studio" ? "default" : "secondary"}>
                            {p.account_type === "studio" ? "Estúdio" : "Solo"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {getRoles(p.user_id).map((r: string) => (
                              <Badge key={r} variant="outline" className="text-[10px]">{r}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>{p.phone || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {p.created_at ? format(new Date(p.created_at), "dd/MM/yy", { locale: ptBR }) : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7"
                              onClick={() => { setEditForm({ ...p }); setEditUser(p); }}>
                              <Pencil className="w-3 h-3" />
                            </Button>
                            {(p.account_type === "studio" || getRoles(p.user_id).includes("manicure")) && (
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-primary"
                                title="Acessar como este estúdio"
                                onClick={() => {
                                  sessionStorage.setItem("admin_impersonate", JSON.stringify({ userId: p.user_id, name: p.business_name || p.full_name }));
                                  navigate("/dashboard");
                                }}>
                                <ExternalLink className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="appointments">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Agendamentos Recentes (50)</CardTitle>
                <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["atiago-apts"] })}>
                  <RefreshCw className="w-3 h-3 mr-1" />Atualizar
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Estúdio</TableHead>
                      <TableHead>Manicure</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Serviço</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Origem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentApts.map((a: any) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-xs">{format(new Date(a.start_at), "dd/MM/yy HH:mm", { locale: ptBR })}</TableCell>
                        <TableCell className="text-xs">{(a.owner as any)?.business_name || (a.owner as any)?.full_name || "—"}</TableCell>
                        <TableCell className="text-xs">{(a.manicure as any)?.full_name || "—"}</TableCell>
                        <TableCell>{a.clients?.full_name || "—"}</TableCell>
                        <TableCell>{a.services?.name || "—"}</TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor[a.status] || ""}`}>
                            {a.status}
                          </span>
                        </TableCell>
                        <TableCell>{a.price ? formatBRL(Number(a.price)) : "—"}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{a.source}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="whatsapp">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Conversas WhatsApp</CardTitle>
                <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["atiago-convs"] })}>
                  <RefreshCw className="w-3 h-3 mr-1" />Atualizar
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Última msg</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Modo</TableHead>
                      <TableHead>Msgs</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conversations.map((c: any) => {
                      const history = c.state_data?.history || [];
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="font-mono text-sm">{c.phone}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {c.last_message_at ? format(new Date(c.last_message_at), "dd/MM HH:mm", { locale: ptBR }) : "—"}
                          </TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{c.state}</Badge></TableCell>
                          <TableCell>
                            {c.human_takeover
                              ? <Badge variant="destructive" className="text-[10px]">Humano</Badge>
                              : <Badge variant="secondary" className="text-[10px]">Bot</Badge>}
                          </TableCell>
                          <TableCell className="text-xs">{history.length}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="outline" size="sm" className="h-6 text-[10px]"
                                onClick={() => setSelectedConv(c)}>Ver</Button>
                              <Button variant="ghost" size="sm" className="h-6 text-[10px] text-destructive"
                                onClick={() => { if (confirm("Limpar histórico?")) deleteConvMutation.mutate(c.id); }}>
                                Limpar
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="bot">
            <Card>
              <CardHeader><CardTitle>Configurações de IA por Estúdio</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User ID</TableHead>
                      <TableHead>IA Global</TableHead>
                      <TableHead>Lembrete</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {aiSettings.map((ai: any) => (
                      <TableRow key={ai.id}>
                        <TableCell className="font-mono text-xs">{ai.user_id}</TableCell>
                        <TableCell>
                          <Badge className={ai.ai_globally_enabled ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                            {ai.ai_globally_enabled ? "Ativa" : "Desativada"}
                          </Badge>
                        </TableCell>
                        <TableCell>{ai.reminder_hours_before}h antes</TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" className="h-6 text-[10px]"
                            onClick={() => toggleAIMutation.mutate({ userId: ai.user_id, enabled: !ai.ai_globally_enabled })}>
                            {ai.ai_globally_enabled ? "Desativar IA" : "Ativar IA"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sql">
            <Card>
              <CardHeader><CardTitle>Consulta SQL</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={sqlQuery}
                  onChange={(e) => setSqlQuery(e.target.value)}
                  placeholder="SELECT * FROM profiles LIMIT 10;"
                  className="font-mono text-sm min-h-[120px]"
                />
                <div className="flex gap-2">
                  <Button onClick={runSQL} disabled={sqlLoading}>
                    {sqlLoading ? "Executando..." : "Executar"}
                  </Button>
                  <Button variant="outline" onClick={() => { setSqlQuery(""); setSqlResult(null); }}>Limpar</Button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {[
                    { label: "Todos usuários", sql: "SELECT user_id, full_name, account_type FROM profiles ORDER BY created_at DESC;" },
                    { label: "Conversas ativas", sql: "SELECT phone, last_message_at, state FROM whatsapp_conversations ORDER BY last_message_at DESC LIMIT 20;" },
                    { label: "Agendamentos hoje", sql: "SELECT id, status, start_at FROM appointments WHERE start_at::date = CURRENT_DATE;" },
                    { label: "Clientes", sql: "SELECT full_name, phone, created_at FROM clients ORDER BY created_at DESC LIMIT 20;" },
                    { label: "Serviços", sql: "SELECT name, price, commission_percentage FROM services LIMIT 20;" },
                    { label: "Recibos", sql: "SELECT * FROM payment_receipts ORDER BY created_at DESC LIMIT 10;" },
                  ].map((q) => (
                    <Button key={q.label} variant="outline" size="sm" className="h-auto py-2 text-xs text-left justify-start"
                      onClick={() => setSqlQuery(q.sql)}>
                      {q.label}
                    </Button>
                  ))}
                </div>
                {sqlResult && (
                  <div className="bg-muted rounded-lg p-3">
                    <pre className="text-xs overflow-auto max-h-64 whitespace-pre-wrap">
                      {JSON.stringify(sqlResult, null, 2)}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Modal conversa WhatsApp */}
      <Dialog open={!!selectedConv} onOpenChange={(o) => { if (!o) setSelectedConv(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Conversa — {selectedConv?.phone}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-3 pr-2">
            {(selectedConv?.state_data?.history || []).length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Sem histórico</p>
            ) : (
              (selectedConv?.state_data?.history || []).map((m: any, i: number) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                    <p className="text-[10px] font-medium mb-1 opacity-70">{m.role === "user" ? "Cliente" : "Bot"}</p>
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              State: {selectedConv?.state} | 
              Client data: {JSON.stringify(selectedConv?.state_data?.client_data || {})}
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editUser} onOpenChange={(o) => { if (!o) setEditUser(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Usuário</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input value={editForm.full_name || ""} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Nome do Negócio</Label>
              <Input value={editForm.business_name || ""} onChange={(e) => setEditForm({ ...editForm, business_name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Telefone</Label>
              <Input value={editForm.phone || ""} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Tipo de Conta</Label>
              <Select value={editForm.account_type} onValueChange={(v) => setEditForm({ ...editForm, account_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="solo">Solo</SelectItem>
                  <SelectItem value="studio">Estúdio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="bg-muted/30 rounded p-2 text-xs text-muted-foreground space-y-1">
              <p><strong>user_id:</strong> {editForm.user_id}</p>
              <p><strong>profile_id:</strong> {editForm.id}</p>
            </div>
            <Button className="w-full" onClick={() => updateUserMutation.mutate(editForm)}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
