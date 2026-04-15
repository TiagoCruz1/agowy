import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Save, User, CreditCard, Eye, EyeOff, Bell } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export default function SettingsPage() {
  const { user } = useAuth();
  const { effectiveUserId } = useEffectiveUser();
  const userId = effectiveUserId || user?.id;
  const queryClient = useQueryClient();

  const [profile, setProfile] = useState({ full_name: "", phone: "", business_name: "" });
  const [payment, setPayment] = useState({ mercadopago_access_token: "", infinitepay_tag: "", notify_manicure: true, notify_owner: true });
  const [showToken, setShowToken] = useState(false);

  useQuery({
    queryKey: ["profile", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("user_id", userId!).single();
      if (error) throw error;
      setProfile({ full_name: data.full_name || "", phone: data.phone || "", business_name: data.business_name || "" });
      return data;
    },
    enabled: !!userId,
  });

  useQuery({
    queryKey: ["payment_settings", userId],
    queryFn: async () => {
      const { data } = await supabase.from("payment_settings").select("*").eq("user_id", userId!).maybeSingle();
      if (data) {
        setPayment({
          mercadopago_access_token: data.mercadopago_access_token || "",
          infinitepay_tag: data.infinitepay_tag || "",
          notify_manicure: data.notify_manicure !== false,
          notify_owner: data.notify_owner !== false,
        });
      }
      return data;
    },
    enabled: !!userId,
  });

  const saveProfile = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("profiles").update(profile).eq("user_id", userId!);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["profile"] }); toast.success("Perfil atualizado!"); },
    onError: (err: any) => toast.error(err.message),
  });

  const savePayment = useMutation({
    mutationFn: async () => {
      const { data: existing } = await supabase.from("payment_settings").select("id").eq("user_id", userId!).maybeSingle();
      if (existing) {
        const { error } = await supabase.from("payment_settings").update(payment).eq("user_id", userId!);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("payment_settings").insert({ ...payment, user_id: userId! });
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["payment_settings"] }); toast.success("Configurações de pagamento salvas!"); },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Configurações</h1>
        <p className="text-muted-foreground">Gerencie seu perfil e integrações de pagamento</p>
      </div>

      {/* Perfil */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Perfil
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => { e.preventDefault(); saveProfile.mutate(); }} className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label>Nome completo</Label>
              <Input value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} placeholder="(11) 99999-9999" />
            </div>
            <div className="space-y-2">
              <Label>Nome do Estúdio</Label>
              <Input value={profile.business_name} onChange={(e) => setProfile({ ...profile, business_name: e.target.value })} placeholder="Meu Estúdio de Nail" />
            </div>
            <Button type="submit" disabled={saveProfile.isPending}>
              <Save className="w-4 h-4 mr-2" />
              {saveProfile.isPending ? "Salvando..." : "Salvar Perfil"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Pagamento */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Integrações de Pagamento
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => { e.preventDefault(); savePayment.mutate(); }} className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label>Access Token — Mercado Pago</Label>
              <div className="flex gap-2">
                <Input
                  type={showToken ? "text" : "password"}
                  value={payment.mercadopago_access_token}
                  onChange={(e) => setPayment({ ...payment, mercadopago_access_token: e.target.value })}
                  placeholder="APP_USR-..."
                />
                <Button type="button" variant="outline" size="icon" onClick={() => setShowToken(!showToken)}>
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Para obter seu Access Token:</p>
                <ol className="list-decimal list-inside space-y-1 pl-1">
                  <li>Acesse <a href="https://www.mercadopago.com.br/developers/panel/app" target="_blank" rel="noopener noreferrer" className="text-primary underline">mercadopago.com.br/developers</a></li>
                  <li>Clique em <strong>"Suas integrações"</strong> e depois em <strong>"Criar aplicação"</strong></li>
                  <li>Preencha o nome e clique em <strong>"Criar"</strong></li>
                  <li>Dentro da aplicação, vá em <strong>"Credenciais de produção"</strong></li>
                  <li>Copie o <strong>Access Token</strong> (começa com APP_USR-...)</li>
                </ol>
              </div>
            </div>
            <div className="space-y-2">
              <Label>InfiniteTag — InfinitePay</Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">$</span>
                <Input
                  value={payment.infinitepay_tag}
                  onChange={(e) => setPayment({ ...payment, infinitepay_tag: e.target.value.replace("$", "") })}
                  placeholder="seu_usuario"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Sua InfiniteTag aparece no canto superior esquerdo do app InfinitePay (sem o $)
              </p>
            </div>
            <div className="space-y-4 pt-2 border-t">
              <p className="text-sm font-medium flex items-center gap-2"><Bell className="w-4 h-4" /> Notificações de Agendamento</p>
              <div className="flex items-center justify-between max-w-md">
                <div>
                  <p className="text-sm font-medium">Avisar manicure</p>
                  <p className="text-xs text-muted-foreground">Envia mensagem no WhatsApp da manicure quando novo agendamento for criado</p>
                </div>
                <Switch
                  checked={payment.notify_manicure}
                  onCheckedChange={(v) => setPayment({ ...payment, notify_manicure: v })}
                />
              </div>
              <div className="flex items-center justify-between max-w-md">
                <div>
                  <p className="text-sm font-medium">Avisar dona do estúdio</p>
                  <p className="text-xs text-muted-foreground">Envia mensagem no WhatsApp da dona quando novo agendamento for criado</p>
                </div>
                <Switch
                  checked={payment.notify_owner}
                  onCheckedChange={(v) => setPayment({ ...payment, notify_owner: v })}
                />
              </div>
            </div>
            <Button type="submit" disabled={savePayment.isPending}>
              <Save className="w-4 h-4 mr-2" />
              {savePayment.isPending ? "Salvando..." : "Salvar Pagamento"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
