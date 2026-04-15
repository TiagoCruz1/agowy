import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Bot, Save, MessageCircle, Clock, Hand } from "lucide-react";

export default function AISettings() {
  const { user } = useAuth();
  const { effectiveUserId } = useEffectiveUser();
  const userId = effectiveUserId || user?.id;
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    ai_globally_enabled: true,
    reminder_hours_before: 5,
    greeting_message: "",
    offer_human_option: true,
    end_service_keyword: "Atendimento encerrado",
  });

  const { isLoading } = useQuery({
    queryKey: ["ai-settings", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_settings")
        .select("*")
        .eq("user_id", userId!)
        .single();
      if (error && error.code === "PGRST116") {
        // No settings yet, create defaults
        const { data: newData, error: insertError } = await supabase
          .from("ai_settings")
          .insert({ user_id: userId! })
          .select()
          .single();
        if (insertError) throw insertError;
        setForm({
          ai_globally_enabled: newData.ai_globally_enabled,
          reminder_hours_before: newData.reminder_hours_before,
          greeting_message: newData.greeting_message || "",
          offer_human_option: newData.offer_human_option,
          end_service_keyword: newData.end_service_keyword,
        });
        return newData;
      }
      if (error) throw error;
      setForm({
        ai_globally_enabled: data.ai_globally_enabled,
        reminder_hours_before: data.reminder_hours_before,
        greeting_message: data.greeting_message || "",
        offer_human_option: data.offer_human_option,
        end_service_keyword: data.end_service_keyword,
      });
      return data;
    },
    enabled: !!userId,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("ai_settings")
        .update(form)
        .eq("user_id", userId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-settings"] });
      toast.success("Configurações da IA salvas!");
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Configurações da IA</h1>
        <p className="text-muted-foreground">Controle o comportamento da IA no WhatsApp</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-primary" />
                IA Global
              </CardTitle>
              <CardDescription>Ativa ou desativa a IA para todas as conversas</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <Label>IA ativada globalmente</Label>
                <Switch
                  checked={form.ai_globally_enabled}
                  onCheckedChange={(v) => setForm({ ...form, ai_globally_enabled: v })}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                Lembretes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Horas antes do agendamento para enviar lembrete</Label>
                <Input
                  type="number"
                  min={1}
                  max={48}
                  value={form.reminder_hours_before}
                  onChange={(e) => setForm({ ...form, reminder_hours_before: parseInt(e.target.value) || 5 })}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-primary" />
                Mensagem de Saudação
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Mensagem inicial da IA</Label>
                <Textarea
                  value={form.greeting_message}
                  onChange={(e) => setForm({ ...form, greeting_message: e.target.value })}
                  placeholder="Olá! 👋 Sou a assistente virtual..."
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Hand className="w-5 h-5 text-primary" />
                Atendimento Humano
              </CardTitle>
              <CardDescription>
                Quando ativo, a IA oferece a opção de falar com a manicure. 
                A manicure pode encerrar o atendimento humano enviando a palavra-chave.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Oferecer opção de falar com a manicure</Label>
                <Switch
                  checked={form.offer_human_option}
                  onCheckedChange={(v) => setForm({ ...form, offer_human_option: v })}
                />
              </div>
              <div className="space-y-2">
                <Label>Palavra-chave para encerrar atendimento humano</Label>
                <Input
                  value={form.end_service_keyword}
                  onChange={(e) => setForm({ ...form, end_service_keyword: e.target.value })}
                  placeholder="Atendimento encerrado"
                />
                <p className="text-xs text-muted-foreground">
                  Quando a manicure enviar essa mensagem, a IA volta a atender e pergunta sobre a avaliação.
                </p>
              </div>
            </CardContent>
          </Card>

          <Button type="submit" disabled={saveMutation.isPending} className="w-full sm:w-auto">
            <Save className="w-4 h-4 mr-2" />
            {saveMutation.isPending ? "Salvando..." : "Salvar Configurações"}
          </Button>
        </form>
      )}
    </div>
  );
}
