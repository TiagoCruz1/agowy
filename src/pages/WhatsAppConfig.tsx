import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MessageCircle, QrCode, CheckCircle2, Copy, RefreshCw, Wifi, WifiOff } from "lucide-react";

const EVOLUTION_URL = import.meta.env.VITE_EVOLUTION_URL || "http://187.33.21.181:8080";
const EVOLUTION_KEY = import.meta.env.VITE_EVOLUTION_KEY || "81F94FCA-E8F0-419C-93CA-678A34244C6D";
const INSTANCE_NAME = import.meta.env.VITE_EVOLUTION_INSTANCE || "yasmin-nails";

export default function WhatsAppConfig() {
  const { user } = useAuth();
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const webhookUrl = `https://${projectId}.supabase.co/functions/v1/whatsapp-webhook`;

  const [qrCode, setQrCode] = useState<string | null>(null);
  const [status, setStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [instanceName, setInstanceName] = useState(INSTANCE_NAME);

  const checkStatus = async () => {
    try {
      const res = await fetch(`${EVOLUTION_URL}/instance/connectionState/${instanceName}`, {
        headers: { apikey: EVOLUTION_KEY },
      });
      const data = await res.json();
      if (data?.instance?.state === "open") {
        setStatus("connected");
        setQrCode(null);
      } else {
        setStatus("disconnected");
      }
    } catch (e) {
      setStatus("disconnected");
    }
  };

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, [instanceName]);

  const connect = async () => {
    setLoading(true);
    setQrCode(null);
    try {
      // Tenta conectar instância existente
      const connectRes = await fetch(`${EVOLUTION_URL}/instance/connect/${instanceName}`, {
        headers: { apikey: EVOLUTION_KEY },
      });
      const connectData = await connectRes.json();

      if (connectData?.base64) {
        setQrCode(connectData.base64);
        setStatus("connecting");
      } else if (connectData?.code) {
        // Gera imagem do QR code a partir do código
        setQrCode(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(connectData.code)}`);
        setStatus("connecting");
      } else {
        // Cria instância nova
        await fetch(`${EVOLUTION_URL}/instance/create`, {
          method: "POST",
          headers: { apikey: EVOLUTION_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ instanceName, integration: "WHATSAPP-BAILEYS" }),
        });
        // Tenta conectar de novo
        const res2 = await fetch(`${EVOLUTION_URL}/instance/connect/${instanceName}`, {
          headers: { apikey: EVOLUTION_KEY },
        });
        const data2 = await res2.json();
        if (data2?.base64) {
          setQrCode(data2.base64);
          setStatus("connecting");
        } else if (data2?.code) {
          setQrCode(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(data2.code)}`);
          setStatus("connecting");
        }
      }

      // Configura webhook automaticamente
      await fetch(`${EVOLUTION_URL}/webhook/set/${instanceName}`, {
        method: "POST",
        headers: { apikey: EVOLUTION_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          webhook: { enabled: true, url: webhookUrl, events: ["MESSAGES_UPSERT"] },
        }),
      });
    } catch (e) {
      toast.error("Erro ao conectar. Verifique se a Evolution API está rodando.");
    }
    setLoading(false);
  };

  const disconnect = async () => {
    try {
      await fetch(`${EVOLUTION_URL}/instance/logout/${instanceName}`, {
        method: "DELETE",
        headers: { apikey: EVOLUTION_KEY },
      });
      setStatus("disconnected");
      setQrCode(null);
      toast.success("WhatsApp desconectado!");
    } catch (e) {
      toast.error("Erro ao desconectar.");
    }
  };

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast.success("URL copiada!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">WhatsApp</h1>
        <p className="text-muted-foreground">Conecte seu WhatsApp para atendimento automático com IA</p>
      </div>

      {/* Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5" />
            Status da Conexão
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            {status === "connected" ? (
              <>
                <CheckCircle2 className="w-6 h-6 text-green-500" />
                <div>
                  <p className="font-medium text-green-600">WhatsApp Conectado</p>
                  <p className="text-sm text-muted-foreground">A IA está ativa e respondendo mensagens</p>
                </div>
                <Badge className="ml-auto bg-green-500">Online</Badge>
              </>
            ) : status === "connecting" ? (
              <>
                <QrCode className="w-6 h-6 text-yellow-500" />
                <div>
                  <p className="font-medium text-yellow-600">Aguardando escaneamento do QR Code</p>
                  <p className="text-sm text-muted-foreground">Abra o WhatsApp no celular e escaneie o código</p>
                </div>
                <Badge className="ml-auto bg-yellow-500">Aguardando</Badge>
              </>
            ) : (
              <>
                <WifiOff className="w-6 h-6 text-muted-foreground" />
                <div>
                  <p className="font-medium">WhatsApp Desconectado</p>
                  <p className="text-sm text-muted-foreground">Clique em Conectar para iniciar</p>
                </div>
                <Badge className="ml-auto" variant="outline">Offline</Badge>
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label>Nome da Instância</Label>
            <Input
              value={instanceName}
              onChange={(e) => setInstanceName(e.target.value)}
              placeholder="yasmin-nails"
              className="max-w-xs"
            />
          </div>

          <div className="flex gap-2">
            {status !== "connected" ? (
              <Button onClick={connect} disabled={loading}>
                {loading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Wifi className="w-4 h-4 mr-2" />}
                {loading ? "Conectando..." : "Conectar WhatsApp"}
              </Button>
            ) : (
              <Button variant="destructive" onClick={disconnect}>
                <WifiOff className="w-4 h-4 mr-2" />
                Desconectar
              </Button>
            )}
            <Button variant="outline" onClick={checkStatus}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Verificar Status
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* QR Code */}
      {qrCode && status === "connecting" && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-yellow-600" />
              Escaneie o QR Code
            </CardTitle>
            <CardDescription>
              Abra o WhatsApp → Dispositivos conectados → Conectar dispositivo → Escanear QR Code
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <div className="bg-white p-4 rounded-xl shadow">
              <img
                src={qrCode.startsWith("data:") ? qrCode : qrCode}
                alt="QR Code WhatsApp"
                className="w-64 h-64"
              />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              O QR Code expira em 60 segundos. Se expirar, clique em Conectar novamente.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Webhook URL */}
      <Card>
        <CardHeader>
          <CardTitle>URL do Webhook</CardTitle>
          <CardDescription>Configurada automaticamente ao conectar. Para configuração manual:</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input value={webhookUrl} readOnly className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={copyWebhook}>
              {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
