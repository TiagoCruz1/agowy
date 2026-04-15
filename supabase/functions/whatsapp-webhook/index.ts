import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizePhone(value: string): string {
  const withoutJid = value.includes("@") ? value.split("@")[0] : value;
  return withoutJid.replace(/\D/g, "");
}

function isTruthy(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function getProviderConfig() {
  const evolutionUrl = Deno.env.get("EVOLUTION_API_URL") || "";
  const evolutionKey = Deno.env.get("EVOLUTION_API_KEY") || "";
  const evolutionInstance = Deno.env.get("EVOLUTION_INSTANCE") || "";
  return {
    url: evolutionUrl.replace(/\/$/, ""),
    key: evolutionKey,
    instance: evolutionInstance,
    enabled: Boolean(evolutionUrl && evolutionKey && evolutionInstance),
  };
}

function parseIncomingMessage(body: any) {
  const eventType = body?.event || body?.type || "unknown";
  if (body?.event) {
    const accepted = ["messages.upsert", "message.upsert"];
    if (!accepted.includes(String(body.event).toLowerCase())) {
      return { ignore: true, reason: `event:${body.event}` };
    }
  }
  const data = body?.data || body;
  const key = data?.key || body?.key || {};
  const messageNode = data?.message || body?.message || {};
  const isFromMe = isTruthy(body?.fromMe) || isTruthy(data?.fromMe) || isTruthy(key?.fromMe);
  if (isFromMe) return { ignore: true, reason: "fromMe" };
  const remoteJid = key?.remoteJid || key?.participant || data?.remoteJid || body?.phone || "";
  const phoneCandidate = remoteJid || body?.phone || body?.number || "";
  const messageId = key?.id || data?.key?.id || "";
  const messageText =
    body?.text?.message || body?.text || body?.body ||
    messageNode?.conversation || messageNode?.extendedTextMessage?.text ||
    messageNode?.imageMessage?.caption || messageNode?.videoMessage?.caption || "";
  const phone = normalizePhone(String(phoneCandidate));
  return { ignore: false, eventType, phone, messageText: String(messageText || ""), messageId };
}

async function sendMessage(phone: string, message: string) {
  const provider = getProviderConfig();
  if (!provider.enabled) throw new Error("Evolution API not configured");
  const res = await fetch(`${provider.url}/message/sendText/${provider.instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: provider.key },
    body: JSON.stringify({
      number: phone.replace(/\D/g, ""),
      options: { delay: 1200, presence: "composing" },
      text: message,
    }),
  });
  const text = await res.text();
  console.log("[EVOLUTION] Status:", res.status, "| Response:", text.substring(0, 200));
  if (!res.ok) throw new Error(`Evolution error [${res.status}]: ${text}`);
  return res;
}


async function getPaymentSettings(supabase: any, ownerUserId: string) {
  const { data } = await supabase
    .from("payment_settings")
    .select("*")
    .eq("user_id", ownerUserId)
    .maybeSingle();
  return data;
}

async function generateMercadoPagoQR(accessToken: string, amount: number, description: string, orderId: string): Promise<{qr_code: string, qr_code_base64: string, payment_id: string} | null> {
  try {
    const res = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
        "X-Idempotency-Key": orderId,
      },
      body: JSON.stringify({
        transaction_amount: amount,
        description,
        payment_method_id: "pix",
        payer: { email: "cliente@nailbook.com" },
        external_reference: orderId,
        date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      }),
    });
    const data = await res.json();
    if (data?.point_of_interaction?.transaction_data) {
      return {
        qr_code: data.point_of_interaction.transaction_data.qr_code,
        qr_code_base64: data.point_of_interaction.transaction_data.qr_code_base64,
        payment_id: String(data.id),
      };
    }
    console.error("[MP] Erro:", JSON.stringify(data));
    return null;
  } catch (e) {
    console.error("[MP] Exceção:", e);
    return null;
  }
}

async function checkMercadoPagoPayment(accessToken: string, paymentId: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { "Authorization": `Bearer ${accessToken}` },
    });
    const data = await res.json();
    return data?.status === "approved";
  } catch (e) {
    return false;
  }
}

async function generateInfinitePayLink(tag: string, amount: number, description: string, orderId: string, webhookUrl: string, customerName: string, customerEmail: string): Promise<string | null> {
  const cleanTag = tag.replace("$", "").trim();
  const amountCents = Math.round(amount * 100);
  try {
    const res = await fetch("https://api.infinitepay.io/invoices/public/checkout/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handle: cleanTag,
        order_nsu: orderId,
        webhook_url: webhookUrl,
        customer: { name: customerName, email: customerEmail },
        items: [{ quantity: 1, price: amountCents, description }],
      }),
    });
    const data = await res.json();
    console.log("[INFINITEPAY] API Response:", JSON.stringify(data).substring(0, 300));
    return data?.link || data?.checkout_url || data?.url || null;
  } catch (e) {
    console.error("[INFINITEPAY] Erro:", e);
    return null;
  }
}

async function sendMessageToManicure(supabase: any, manicureUserId: string, message: string, evolutionUrl: string, evolutionKey: string, evolutionInstance: string) {
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("phone")
      .eq("user_id", manicureUserId)
      .single();
    
    if (!profile?.phone) return;
    
    const phone = profile.phone.replace(/\D/g, "");
    await fetch(`${evolutionUrl}/message/sendText/${evolutionInstance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evolutionKey },
      body: JSON.stringify({
        number: phone,
        options: { delay: 1000 },
        text: message,
      }),
    });
    console.log("[MANICURE] Aviso enviado para:", phone);
  } catch (e) {
    console.error("[MANICURE] Erro ao avisar manicure:", e);
  }
}

async function createPendingAppointment(supabase: any, ownerUserId: string, clientId: string, serviceId: string, manicureProfileId: string | null, startAt: string, endAt: string, price: number, pendingPaymentId: string) {
  const { data, error } = await supabase.from("appointments").insert({
    user_id: ownerUserId,
    client_id: clientId,
    service_id: serviceId,
    start_at: startAt,
    end_at: endAt,
    price,
    source: "whatsapp",
    status: "scheduled",
    manicure_id: manicureProfileId,
    notes: `pending_payment:${pendingPaymentId}`,
  }).select().single();
  if (error) throw error;
  return data;
}

async function askClaude(systemPrompt: string, history: any[], userMessage: string): Promise<string> {
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY not set");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [...history, { role: "user", content: userMessage }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude error [${res.status}]: ${err}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

function buildSystemPrompt(context: {
  businessName: string;
  services: any[];
  workingHours: any[];
  availableSlots: Record<string, string[]>;
  clientData: any;
  manicures: any[];
  selectedManicure: any | null;
}) {
  const daysMap: Record<number, string> = {
    0: "Domingo", 1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta", 5: "Sexta", 6: "Sábado",
  };
  const serviceList = context.services.map((s, i) =>
    `${i + 1}. ${s.name} — R$ ${Number(s.price).toFixed(2)}`
  ).join("\n");
  const hoursList = context.workingHours.map(wh =>
    `- ${daysMap[wh.day_of_week]}: ${wh.open_time} às ${wh.close_time}`
  ).join("\n");
  const slotInfo = Object.entries(context.availableSlots).map(([date, slots]) => {
    const [y, m, d] = date.split("-");
    return `- ${d}/${m}/${y}: ${slots.join(", ")}`;
  }).join("\n");
  const manicureList = context.manicures.map((m, i) => `${i + 1}. ${m.full_name} [id:${m.user_id}]`).join("\n");
  const manicureInfo = context.selectedManicure
    ? `MANICURE SELECIONADA: ${context.selectedManicure.name} (user_id: ${context.selectedManicure.user_id})`
    : `MANICURES DISPONÍVEIS (use o id entre colchetes nos comandos):\n${manicureList}`;

  const cd = context.clientData || {};
  const hasAllData = cd.name && cd.phone && cd.email && cd.birth_date;

  const clientInfo = hasAllData
    ? `DADOS DA CLIENTE COMPLETOS — não peça mais nenhum dado:\nNome: ${cd.name} | Tel: ${cd.phone} | Email: ${cd.email} | Nasc: ${cd.birth_date}`
    : `DADOS DA CLIENTE ATÉ AGORA: ${JSON.stringify(cd)}`;

  return `Você é a assistente virtual do estúdio de nail art "${context.businessName}".
Responda SEMPRE em português brasileiro, de forma simpática e breve.
Para negrito use UM asterisco: *texto*. NUNCA use dois asteriscos.

INFORMAÇÕES DO ESTÚDIO:
- Nome: ${context.businessName}
- Contato: este próprio WhatsApp. Se cliente perguntar telefone, email ou como contatar o estúdio, diga que o contato é por este WhatsApp mesmo.

SERVIÇOS DISPONÍVEIS (mostre a lista COMPLETA sempre que cliente perguntar):
${serviceList}

HORÁRIOS DE FUNCIONAMENTO:
${hoursList}

HORÁRIOS PRÉ-CALCULADOS (próximos dias):
${slotInfo || "Nenhum horário disponível nos próximos dias."}

IMPORTANTE SOBRE DATAS: O cliente pode agendar para QUALQUER data futura.
- Se o cliente pedir uma data não listada acima, use VERIFICAR_DATA:{"date":"YYYY-MM-DD","manicure_user_id":"..."} para verificar disponibilidade.
- Substitua os horários retornados na sua resposta normalmente.

${manicureInfo}

${clientInfo}

FLUXO OBRIGATÓRIO — siga EXATAMENTE esta ordem sem pular nem repetir etapas:

ETAPA 1: Mostre a lista COMPLETA de serviços e pergunte qual deseja
ETAPA 2: Cliente escolhe serviço → confirme a escolha
ETAPA 3: Mostre lista de manicures (sem mostrar os ids) e pergunte qual prefere → MANICURE:{"user_id":"ID_EXATO_DO_COLCHETE","name":"NOME"}
ETAPA 4 (pule se dados já coletados): Peça nome completo, telefone, e-mail e data de nascimento TODOS JUNTOS numa mensagem.
  Quando cliente responder, extraia cada campo e registre:
  CLIENTE_DADO:{"field":"name","value":"NOME"} CLIENTE_DADO:{"field":"phone","value":"TEL"} CLIENTE_DADO:{"field":"email","value":"EMAIL"} CLIENTE_DADO:{"field":"birth_date","value":"DD/MM/AAAA"}
ETAPA 5 (só depois de TODOS os dados coletados): Pergunte qual data prefere
ETAPA 6: Para QUALQUER data que o cliente informar, use SEMPRE VERIFICAR_DATA:{"date":"YYYY-MM-DD","manicure_user_id":"UUID_EXATO"} — os horários já excluem os ocupados automaticamente. Apresente APENAS os horários retornados pelo sistema, nunca invente horários
ETAPA 7: Cliente escolhe o horário da lista apresentada pelo sistema
ETAPA 8: Mostre resumo completo e peça confirmação final
ETAPA 9: Após cliente confirmar com "sim", mostre o resumo do agendamento e informe que é necessário um sinal de 50% do valor. Pergunte a forma de pagamento:
  "✅ *Resumo do agendamento:*
  👤 [nome] | 💅 [serviço] | 📅 [data] | ⏰ [hora] | 💰 R$ [valor total]
  
  Para confirmar, é necessário um sinal de *R$ [50% do valor]*.
  Como prefere pagar?
  1️⃣ PIX (instantâneo, gratuita)
  2️⃣ Cartão (link de pagamento InfinitePay)"
  
  Então inclua na sua resposta: AGUARDAR_PAGAMENTO:{"service_name":"...","client_name":"...","date":"YYYY-MM-DD","time":"HH:MM","manicure_user_id":"...","service_price":VALOR_NUMERICO}

ETAPA 10: Quando cliente responder "1" ou "pix" ou "PIX":
  Inclua: GERAR_PIX:{"confirmar":true}

ETAPA 11: Quando cliente responder "2" ou "cartão" ou "infinitepay":
  Inclua: GERAR_LINK:{"confirmar":true}

REGRAS CRÍTICAS:
- NUNCA repita perguntas de etapas já concluídas
- NUNCA volte para etapas anteriores
- NUNCA use o comando AGENDAR: — o agendamento é criado automaticamente após confirmação do pagamento
- Nunca mostre os comandos MANICURE:, CLIENTE_DADO:, VERIFICAR_DATA:, AGUARDAR_PAGAMENTO:, GERAR_PIX:, GERAR_LINK: para o cliente
- Quando cliente disser "já paguei", "paguei", "foi criado?", "criou?" ou qualquer variação após receber PIX ou link, responda APENAS: "⏳ Verificando pagamento... O sistema confirma automaticamente assim que o pagamento for processado!" — NUNCA afirme que o agendamento foi criado
- Para InfinitePay: após enviar o link, se cliente perguntar sobre o agendamento, diga apenas para aguardar a confirmação automática
- NUNCA confirme criação de agendamento — isso é feito EXCLUSIVAMENTE pelo sistema após verificar o pagamento
- Se cliente pedir humano, responda apenas: HUMANO`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method === "GET") return new Response(JSON.stringify({ status: "ok" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  let body: any;
  try {
    const raw = await req.text();
    console.log("[WEBHOOK] RAW:", raw.substring(0, 300));
    body = JSON.parse(raw);
  } catch (e) {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const incoming = parseIncomingMessage(body);
    if (incoming.ignore) {
      console.log("[WEBHOOK] Ignorando:", incoming.reason);
      return new Response(JSON.stringify({ status: "ignored", reason: incoming.reason }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { phone, messageText, messageId } = incoming as any;
    console.log("[WEBHOOK] phone:", phone, "| messageId:", messageId, "| msg:", messageText);

    if (!phone || !messageText) {
      return new Response(JSON.stringify({ status: "ignored" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: ownerProfile } = await supabase
      .from("profiles").select("user_id, business_name, id")
      .eq("account_type", "studio").limit(1).single();

    if (!ownerProfile) {
      return new Response(JSON.stringify({ error: "No owner configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ownerUserId = ownerProfile.user_id;
    const ownerProfileId = ownerProfile.id;
    const businessName = ownerProfile.business_name || "Estúdio";

    const { data: aiSettings } = await supabase
      .from("ai_settings").select("*").eq("user_id", ownerUserId).maybeSingle();

    if (aiSettings && !aiSettings.ai_globally_enabled) {
      return new Response(JSON.stringify({ status: "ai_disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let { data: conversation } = await supabase
      .from("whatsapp_conversations").select("*")
      .eq("phone", phone).eq("user_id", ownerUserId).maybeSingle();

    if (!conversation) {
      const { data: newConv } = await supabase
        .from("whatsapp_conversations")
        .insert({ phone, user_id: ownerUserId, state: "idle", state_data: {} })
        .select().single();
      conversation = newConv;
    }

    await supabase.from("whatsapp_conversations")
      .update({ last_message_at: new Date().toISOString() }).eq("id", conversation.id);

    if (conversation.human_takeover) {
      const keyword = aiSettings?.end_service_keyword || "Atendimento encerrado";
      if (messageText.toLowerCase().trim() === keyword.toLowerCase().trim()) {
        await supabase.from("whatsapp_conversations")
          .update({ human_takeover: false, state: "idle" }).eq("id", conversation.id);
        await sendMessage(phone, "A manicure encerrou o atendimento. Como posso ajudar? 😊");
      }
      return new Response(JSON.stringify({ status: "human_takeover" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stateData = conversation.state_data || {};

    if (messageId && stateData.last_message_id === messageId) {
      console.log("[WEBHOOK] Duplicata ignorada:", messageId);
      return new Response(JSON.stringify({ status: "duplicate" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chatHistory: any[] = stateData.history || [];
    const selectedManicure: any = stateData.selected_manicure || null;
    const clientData: any = stateData.client_data || null;

    const { data: services } = await supabase
      .from("services").select("*").eq("user_id", ownerUserId).eq("is_active", true).order("display_order");

    const { data: manicureLinks } = await supabase
      .from("studio_manicures").select("manicure_user_id")
      .eq("studio_profile_id", ownerProfileId).eq("is_active", true);

    const manicureUserIds = manicureLinks?.map((m: any) => m.manicure_user_id) || [];
    let manicures: any[] = [];
    if (manicureUserIds.length > 0) {
      const { data: manicureProfiles } = await supabase
        .from("profiles").select("user_id, full_name").in("user_id", manicureUserIds);
      manicures = manicureProfiles || [];
    }

    const { data: workingHours } = await supabase
      .from("working_hours").select("*").eq("user_id", ownerUserId).eq("is_open", true).order("day_of_week");

    const availableSlots: Record<string, string[]> = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 1; i <= 7; i++) {
      const date = new Date(today.getTime() + i * 86400000);
      const dayOfWeek = date.getDay();
      const wh = workingHours?.find((w: any) => w.day_of_week === dayOfWeek);
      if (!wh) continue;
      const dateStr = date.toISOString().split("T")[0];

      let apptQuery = supabase.from("appointments").select("start_at, end_at")
        .eq("user_id", ownerUserId)
        .gte("start_at", `${dateStr}T00:00:00`)
        .lte("start_at", `${dateStr}T23:59:59`)
        .in("status", ["scheduled", "confirmed"]);

      if (selectedManicure?.user_id) {
        apptQuery = apptQuery.eq("manicure_id", selectedManicure.user_id);
      }

      const { data: existingAppts } = await apptQuery;
      const [openH, openM] = wh.open_time.split(":").map(Number);
      const [closeH, closeM] = wh.close_time.split(":").map(Number);
      const slots: string[] = [];
      let slotTime = new Date(date);
      slotTime.setHours(openH, openM, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(closeH, closeM, 0, 0);

      while (slotTime.getTime() + 30 * 60000 <= endOfDay.getTime()) {
        const slotEnd = new Date(slotTime.getTime() + 30 * 60000);
        const occupied = existingAppts?.some((a: any) => {
          const s = new Date(a.start_at).getTime();
          const e = new Date(a.end_at).getTime();
          return slotTime.getTime() < e && slotEnd.getTime() > s;
        });
        if (!occupied) {
          slots.push(`${slotTime.getHours().toString().padStart(2, "0")}:${slotTime.getMinutes().toString().padStart(2, "0")}`);
        }
        slotTime = new Date(slotTime.getTime() + 30 * 60000);
      }
      if (slots.length > 0) availableSlots[dateStr] = slots;
    }

    const systemPrompt = buildSystemPrompt({
      businessName, services: services || [], workingHours: workingHours || [],
      availableSlots, clientData, manicures, selectedManicure,
    });

    const claudeResponse = await askClaude(systemPrompt, chatHistory, messageText);
    console.log("[CLAUDE] Resposta:", claudeResponse.substring(0, 400));

    const newHistory = [
      ...chatHistory,
      { role: "user", content: messageText },
      { role: "assistant", content: claudeResponse },
    ].slice(-20);

    let newStateData: any = { ...stateData, history: newHistory, last_message_id: messageId };
    let responseToSend = claudeResponse;

    // Processa VERIFICAR_DATA:
    if (claudeResponse.includes("VERIFICAR_DATA:")) {
      const match = claudeResponse.match(/VERIFICAR_DATA:(\{[^}]+\})/);
      if (match) {
        try {
          const vd = JSON.parse(match[1]);
          const dateStr = vd.date;
          const manicureUid = vd.manicure_user_id || selectedManicure?.user_id;
          const date = new Date(dateStr + "T00:00:00");
          const dayOfWeek = date.getUTCDay();
          const wh = workingHours?.find((w: any) => w.day_of_week === dayOfWeek);

          let slotsMsg = "";
          if (!wh || !wh.is_open) {
            slotsMsg = `Não atendemos no dia ${dateStr.split("-").reverse().join("/")}. Escolha outro dia.`;
          } else {
            let apptQuery = supabase.from("appointments").select("start_at, end_at")
              .eq("user_id", ownerUserId)
              .gte("start_at", `${dateStr}T00:00:00`)
              .lte("start_at", `${dateStr}T23:59:59`)
              .in("status", ["scheduled", "confirmed"]);
            // Não filtra por manicure — verifica conflito geral no estúdio
            // (impede dois agendamentos no mesmo horário independente da manicure)
            const { data: existingAppts } = await apptQuery;
            const [openH, openM] = wh.open_time.split(":").map(Number);
            const [closeH, closeM] = wh.close_time.split(":").map(Number);
            const slots: string[] = [];
            let slotTime = new Date(date);
            slotTime.setUTCHours(openH, openM, 0, 0);
            const endOfDay = new Date(date);
            endOfDay.setUTCHours(closeH, closeM, 0, 0);
            while (slotTime.getTime() + 30 * 60000 <= endOfDay.getTime()) {
              const slotEnd = new Date(slotTime.getTime() + 30 * 60000);
              const occupied = existingAppts?.some((a: any) => {
                const s = new Date(a.start_at).getTime();
                const e = new Date(a.end_at).getTime();
                return slotTime.getTime() < e && slotEnd.getTime() > s;
              });
              if (!occupied) {
                slots.push(`${slotTime.getUTCHours().toString().padStart(2, "0")}:${slotTime.getUTCMinutes().toString().padStart(2, "0")}`);
              }
              slotTime = new Date(slotTime.getTime() + 30 * 60000);
            }
            const [y, m, d] = dateStr.split("-");
            slotsMsg = slots.length > 0
              ? `Horários disponíveis em ${d}/${m}/${y}: ${slots.join(", ")}`
              : `Sem horários disponíveis em ${d}/${m}/${y}.`;
          }
          responseToSend = responseToSend.replace(/VERIFICAR_DATA:\{[^}]+\}/g, slotsMsg).trim();
          console.log("[VERIFICAR_DATA]", slotsMsg);
        } catch (e) {
          console.error("[VERIFICAR_DATA] Erro:", e);
          responseToSend = responseToSend.replace(/VERIFICAR_DATA:\{[^}]+\}/g, "").trim();
        }
      }
    }

    // Processa HUMANO
    if (claudeResponse.trim() === "HUMANO") {
      await supabase.from("whatsapp_conversations")
        .update({ human_takeover: true, state_data: newStateData }).eq("id", conversation.id);
      await sendMessage(phone, "Vou te transferir para a manicure! Ela responderá em breve. 😊");
      return new Response(JSON.stringify({ status: "transferred" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Processa MANICURE:
    if (claudeResponse.includes("MANICURE:")) {
      const match = claudeResponse.match(/MANICURE:(\{[^}]+\})/);
      if (match) {
        try {
          const manicureData = JSON.parse(match[1]);
          newStateData.selected_manicure = manicureData;
          console.log("[STATE] Manicure:", manicureData.name);
        } catch (e) { console.error("[MANICURE] Erro:", e); }
      }
      responseToSend = responseToSend.replace(/MANICURE:\{[^}]+\}/g, "").trim();
    }

    // Processa CLIENTE_DADO:
    const clientDadoMatches = [...claudeResponse.matchAll(/CLIENTE_DADO:(\{[^}]+\})/g)];
    if (clientDadoMatches.length > 0) {
      const currentClientData = newStateData.client_data || {};
      for (const match of clientDadoMatches) {
        try {
          const dado = JSON.parse(match[1]);
          currentClientData[dado.field] = dado.value;
          console.log("[STATE] Dado cliente:", dado.field, "=", dado.value);
        } catch (e) { console.error("[CLIENTE_DADO] Erro:", e); }
      }
      newStateData.client_data = currentClientData;
      responseToSend = responseToSend.replace(/CLIENTE_DADO:\{[^}]+\}/g, "").trim();
    }

    // Processa AGUARDAR_PAGAMENTO: — verifica conflito antes de salvar
    if (claudeResponse.includes("AGUARDAR_PAGAMENTO:")) {
      const match = claudeResponse.match(/AGUARDAR_PAGAMENTO:(\{[^}]+\})/);
      if (match) {
        try {
          const apptData = JSON.parse(match[1]);

          // Verifica conflito de horário
          const startAt = new Date(`${apptData.date}T${apptData.time}:00-03:00`);
          const service = services?.find((s: any) =>
            s.name.toLowerCase().includes(apptData.service_name.toLowerCase()) ||
            apptData.service_name.toLowerCase().includes(s.name.toLowerCase())
          );
          const duration = service?.duration_minutes || 60;
          const endAt = new Date(startAt.getTime() + duration * 60000);

          let conflictQuery = supabase.from("appointments")
            .select("id")
            .eq("user_id", ownerUserId)
            .lt("start_at", endAt.toISOString())
            .gt("end_at", startAt.toISOString())
            .in("status", ["scheduled", "confirmed"]);

          // Se manicure selecionada, verifica conflito só para ela
          if (apptData.manicure_user_id) {
            const { data: mProfile } = await supabase.from("profiles").select("id").eq("user_id", apptData.manicure_user_id).single();
            if (mProfile) conflictQuery = conflictQuery.eq("manicure_id", mProfile.id);
          }

          const { data: conflicts } = await conflictQuery;

          if (conflicts && conflicts.length > 0) {
            console.log("[PAGAMENTO] Conflito de horário detectado!");
            responseToSend = `⚠️ Ops! Esse horário acabou de ser ocupado por outro agendamento.\n\nPor favor, escolha outro horário disponível.`;
            // Limpa pending para recomeçar escolha de horário
            newStateData.pending_appointment = null;
          } else {
            newStateData.pending_appointment = apptData;
            console.log("[PAGAMENTO] Agendamento pendente salvo:", apptData);
          }
        } catch (e) {
          console.error("[AGUARDAR_PAGAMENTO] Erro:", e);
        }
      }
      responseToSend = responseToSend.replace(/AGUARDAR_PAGAMENTO:\{[^}]+\}/g, "").trim();
    }

    // Processa GERAR_PIX:
    if (claudeResponse.includes("GERAR_PIX:")) {
      const pending = newStateData.pending_appointment;
      if (pending) {
        const paymentSettings = await getPaymentSettings(supabase, ownerUserId);
        if (!paymentSettings?.mercadopago_access_token) {
          responseToSend = "Ops! O estúdio ainda não configurou o pagamento via PIX. Entre em contato diretamente com a manicure. 😊";
        } else {
          const signaAmount = Math.round((pending.service_price * 0.5) * 100) / 100;
          const orderId = `nailbook_${Date.now()}`;
          const pixData = await generateMercadoPagoQR(
            paymentSettings.mercadopago_access_token,
            signaAmount,
            `Sinal - ${pending.service_name}`,
            orderId
          );
          if (pixData) {
            newStateData.pending_payment = {
              type: "pix",
              payment_id: pixData.payment_id,
              order_id: orderId,
              amount: signaAmount,
              expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            };

            // Envia mensagem introdutória
            await sendMessage(phone, `🔑 *PIX para confirmar seu agendamento*\n\nValor do sinal: *R$ ${signaAmount.toFixed(2)}*\n⏰ Expira em *30 minutos*`);

            // Envia QR Code como imagem se disponível
            if (pixData.qr_code_base64) {
              const provider = getProviderConfig();
              await fetch(`${provider.url}/message/sendMedia/${provider.instance}`, {
                method: "POST",
                headers: { "Content-Type": "application/json", apikey: provider.key },
                body: JSON.stringify({
                  number: phone.replace(/\D/g, ""),
                  mediatype: "image",
                  mimetype: "image/png",
                  media: pixData.qr_code_base64,
                  caption: "📷 Escaneie este QR Code para pagar",
                }),
              });
            }

            // Envia copia e cola sozinho para facilitar cópia
            await sendMessage(phone, `📋 *Pix Copia e Cola* (toque para copiar):`);
            await sendMessage(phone, pixData.qr_code);
            responseToSend = `⏰ Código válido por *30 minutos*. Assim que o pagamento for confirmado, seu agendamento será criado automaticamente! 😊`;
            console.log("[PIX] QR Code gerado, payment_id:", pixData.payment_id);
          } else {
            responseToSend = "Não consegui gerar o PIX agora. Tente novamente ou escolha pagar por cartão. 😔";
          }
        }
      }
      responseToSend = responseToSend.replace(/GERAR_PIX:\{[^}]+\}/g, "").trim();
    }

    // Processa GERAR_LINK:
    if (claudeResponse.includes("GERAR_LINK:")) {
      const pending = newStateData.pending_appointment;
      if (pending) {
        const paymentSettings = await getPaymentSettings(supabase, ownerUserId);
        if (!paymentSettings?.infinitepay_tag) {
          responseToSend = "Ops! O estúdio ainda não configurou o pagamento via cartão. Entre em contato diretamente com a manicure. 😊";
        } else {
          const signalAmount = Math.round((pending.service_price * 0.5) * 100) / 100;
          const orderId = `nailbook_${Date.now()}`;
          const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/infinitepay-webhook`;
          const link = await generateInfinitePayLink(
            paymentSettings.infinitepay_tag,
            signalAmount,
            `Sinal - ${pending.service_name}`,
            orderId,
            webhookUrl,
            pending.client_name || "",
            newStateData.client_data?.email || ""
          );
          if (!link) {
            responseToSend = "Nao consegui gerar o link agora. Tente PIX ou entre em contato com o estudio.";
          } else {
            newStateData.pending_payment = {
              type: "infinitepay",
              order_id: orderId,
              amount: signalAmount,
              link,
              expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            };
            responseToSend = `Link de pagamento: R$ ${signalAmount.toFixed(2)}\n\n${link}\n\nExpira em 30 minutos. Agendamento criado automaticamente apos pagamento!`;
            console.log("[INFINITEPAY] Link gerado:", link);
          }
        }
      }
      responseToSend = responseToSend.replace(/GERAR_LINK:\{[^}]+\}/g, "").trim();
    }
    // Verificação PIX agora é feita pelo mp-webhook (webhook do Mercado Pago)
    // Mantém apenas verificação de expiração
    if (!claudeResponse.includes("GERAR_PIX:") && newStateData.pending_payment?.type === "pix" && newStateData.pending_appointment && false) {
      const pp = newStateData.pending_payment;
      const paymentSettings = await getPaymentSettings(supabase, ownerUserId);
      
      // Verifica se expirou
      if (new Date(pp.expires_at) < new Date()) {
        newStateData.pending_payment = null;
        newStateData.pending_appointment = null;
        responseToSend = "⏰ O tempo para pagamento expirou e o agendamento foi cancelado.\n\nSe desejar, pode fazer um novo agendamento! 😊";
      } else if (paymentSettings?.mercadopago_access_token) {
        const paid = await checkMercadoPagoPayment(paymentSettings.mercadopago_access_token, pp.payment_id);
        if (paid) {
          // Pagamento confirmado — cria agendamento
          const pending = newStateData.pending_appointment;
          const service = services?.find((s: any) =>
            s.name.toLowerCase().includes(pending.service_name.toLowerCase()) ||
            pending.service_name.toLowerCase().includes(s.name.toLowerCase())
          );

          if (service) {
            const startAt = new Date(`${pending.date}T${pending.time}:00-03:00`);
            const endAt = new Date(startAt.getTime() + service.duration_minutes * 60000);

            let { data: client } = await supabase.from("clients").select("*").eq("user_id", ownerUserId).eq("phone", phone).maybeSingle();
            if (!client) {
              const cd = newStateData.client_data || {};
              const { data: newClient } = await supabase.from("clients").insert({
                user_id: ownerUserId,
                full_name: pending.client_name,
                phone,
                email: cd.email || null,
                date_of_birth: cd.birth_date ? (() => { const [d,m,y] = cd.birth_date.split("/"); return `${y}-${m}-${d}`; })() : null,
              }).select().single();
              client = newClient;
            }

            const manicureProfileId = pending.manicure_user_id
              ? (await supabase.from("profiles").select("id").eq("user_id", pending.manicure_user_id).single()).data?.id
              : null;

            const { error: apptError } = await supabase.from("appointments").insert({
              user_id: ownerUserId,
              client_id: client.id,
              service_id: service.id,
              start_at: startAt.toISOString(),
              end_at: endAt.toISOString(),
              price: service.price,
              source: "whatsapp",
              status: "scheduled",
              manicure_id: manicureProfileId,
            });

            if (!apptError) {
              await supabase.from("whatsapp_conversations").update({ client_id: client.id }).eq("id", conversation.id);

              const [y, m, d] = pending.date.split("-");
              responseToSend = `✅ *Pagamento confirmado! Agendamento criado!*\n\n👤 ${pending.client_name}\n💅 ${pending.service_name}\n📅 ${d}/${m}/${y} às ${pending.time}\n💰 Sinal pago: R$ ${pp.amount.toFixed(2)}\n\nAté lá! 💕`;

              // Avisa a manicure e/ou dona conforme configuração
              const provider = getProviderConfig();
              const notifyMsg = `🔔 *Novo agendamento confirmado!*\n\n👤 Cliente: ${pending.client_name}\n💅 Serviço: ${pending.service_name}\n📅 ${d}/${m}/${y} às ${pending.time}\n💰 Sinal pago via PIX: R$ ${pp.amount.toFixed(2)}`;
              
              if (paymentSettings?.notify_manicure !== false && pending.manicure_user_id) {
                await sendMessageToManicure(supabase, pending.manicure_user_id, notifyMsg, provider.url, provider.key, provider.instance);
              }
              if (paymentSettings?.notify_owner !== false) {
                await sendMessageToManicure(supabase, ownerUserId, notifyMsg, provider.url, provider.key, provider.instance);
              }

              newStateData.pending_payment = null;
              newStateData.pending_appointment = null;
              newStateData.client_data = null;
              newStateData.selected_manicure = null;
              console.log("[PIX] Agendamento criado após pagamento!");
            }
          }
        }
      }
    }

    // Processa AGENDAR:

    if (claudeResponse.includes("AGENDAR:")) {
      const match = claudeResponse.match(/AGENDAR:(\{[^}]+\})/);
      if (match) {
        try {
          const apptData = JSON.parse(match[1]);
          console.log("[AGENDAR] Dados:", apptData);

          const service = services?.find((s: any) =>
            s.name.toLowerCase().includes(apptData.service_name.toLowerCase()) ||
            apptData.service_name.toLowerCase().includes(s.name.toLowerCase())
          );

          if (service) {
            const startAt = new Date(`${apptData.date}T${apptData.time}:00-03:00`);
            const endAt = new Date(startAt.getTime() + service.duration_minutes * 60000);

            // Usa dados coletados ou fallback para apptData
            const cd = newStateData.client_data || {};
            const clientName = cd.name || apptData.client_name;
            const clientPhone = cd.phone || phone;
            const clientEmail = cd.email || null;
            const birthDate = cd.birth_date
              ? (() => { const [d,m,y] = cd.birth_date.split("/"); return `${y}-${m}-${d}`; })()
              : null;

            // Busca cliente existente pelo telefone
            let { data: client } = await supabase
              .from("clients").select("*").eq("user_id", ownerUserId).eq("phone", phone).maybeSingle();

            if (!client) {
              const { data: newClient } = await supabase.from("clients").insert({
                user_id: ownerUserId,
                full_name: clientName,
                phone: clientPhone,
                email: clientEmail,
                date_of_birth: birthDate,
                address_street: cd.address_street || null,
                address_number: cd.address_number || null,
                address_neighborhood: cd.address_neighborhood || null,
                address_city: cd.address_city || null,
                address_state: cd.address_state || null,
                address_zip: cd.address_zip || null,
              }).select().single();
              client = newClient;
              console.log("[DB] Cliente criado:", clientName);
            } else {
              // Atualiza dados do cliente existente
              await supabase.from("clients").update({
                full_name: clientName,
                email: clientEmail,
                date_of_birth: birthDate,
                address_street: cd.address_street || client.address_street,
                address_number: cd.address_number || client.address_number,
                address_neighborhood: cd.address_neighborhood || client.address_neighborhood,
                address_city: cd.address_city || client.address_city,
                address_state: cd.address_state || client.address_state,
                address_zip: cd.address_zip || client.address_zip,
              }).eq("id", client.id);
              console.log("[DB] Cliente atualizado:", clientName);
            }

            // Busca profile_id da manicure
            const manicureUserId = apptData.manicure_user_id || selectedManicure?.user_id;
            const manicureProfileId = manicureUserId
              ? (await supabase.from("profiles").select("id").eq("user_id", manicureUserId).single()).data?.id
              : null;

            const { error: apptError } = await supabase.from("appointments").insert({
              user_id: ownerUserId,
              client_id: client.id,
              service_id: service.id,
              start_at: startAt.toISOString(),
              end_at: endAt.toISOString(),
              price: service.price,
              source: "whatsapp",
              status: "scheduled",
              manicure_id: manicureProfileId,
            });

            if (apptError) {
              console.error("[DB] Erro agendamento:", apptError);
            } else {
              await supabase.from("whatsapp_conversations")
                .update({ client_id: client.id }).eq("id", conversation.id);
              newStateData.client_data = null;
              newStateData.selected_manicure = null;
              console.log("[DB] Agendamento criado!");
            }
          } else {
            console.error("[AGENDAR] Serviço não encontrado:", apptData.service_name);
          }
        } catch (e) { console.error("[AGENDAR] Erro:", e); }
      }
      responseToSend = responseToSend.replace(/AGENDAR:\{[^}]+\}/g, "").trim();
    }

    await supabase.from("whatsapp_conversations")
      .update({ state_data: newStateData }).eq("id", conversation.id);

    if (responseToSend) await sendMessage(phone, responseToSend);

    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[WEBHOOK] Erro geral:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
