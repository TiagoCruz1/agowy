import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getProviderConfig() {
  const evolutionUrl = Deno.env.get("EVOLUTION_API_URL") || "";
  const evolutionKey = Deno.env.get("EVOLUTION_API_KEY") || "";
  const evolutionInstance = Deno.env.get("EVOLUTION_INSTANCE") || "";
  return { url: evolutionUrl.replace(/\/$/, ""), key: evolutionKey, instance: evolutionInstance };
}

async function sendMessage(phone: string, message: string) {
  const provider = getProviderConfig();
  const res = await fetch(`${provider.url}/message/sendText/${provider.instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: provider.key },
    body: JSON.stringify({
      number: phone.replace(/\D/g, ""),
      options: { delay: 1200, presence: "composing" },
      text: message,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("[SEND] Erro:", err);
  }
}

async function sendMessageToPhone(phone: string, message: string) {
  await sendMessage(phone, message);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let body: any;
  try {
    body = await req.json();
    console.log("[MP-WEBHOOK] Recebido:", JSON.stringify(body).substring(0, 300));
  } catch (e) {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Mercado Pago envia type e data.id
  const type = body?.type || body?.action;
  const paymentId = String(body?.data?.id || body?.id || "");

  if (!paymentId || !type?.includes("payment")) {
    console.log("[MP-WEBHOOK] Ignorando evento:", type);
    return new Response(JSON.stringify({ status: "ignored" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log("[MP-WEBHOOK] Payment ID:", paymentId, "| Type:", type);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Busca owner e payment settings
    const { data: ownerProfile } = await supabase
      .from("profiles").select("user_id, business_name")
      .eq("account_type", "studio").limit(1).single();

    if (!ownerProfile) {
      console.error("[MP-WEBHOOK] Owner não encontrado");
      return new Response(JSON.stringify({ error: "no owner" }), { status: 500, headers: corsHeaders });
    }

    const ownerUserId = ownerProfile.user_id;

    const { data: paymentSettings } = await supabase
      .from("payment_settings").select("*").eq("user_id", ownerUserId).maybeSingle();

    if (!paymentSettings?.mercadopago_access_token) {
      console.error("[MP-WEBHOOK] Token MP não configurado");
      return new Response(JSON.stringify({ error: "no token" }), { status: 500, headers: corsHeaders });
    }

    // Verifica o pagamento na API do Mercado Pago
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { "Authorization": `Bearer ${paymentSettings.mercadopago_access_token}` },
    });
    const mpData = await mpRes.json();
    console.log("[MP-WEBHOOK] Status pagamento:", mpData?.status, "| external_reference:", mpData?.external_reference);

    if (mpData?.status !== "approved") {
      console.log("[MP-WEBHOOK] Pagamento não aprovado:", mpData?.status);
      return new Response(JSON.stringify({ status: "not_approved" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orderId = mpData?.external_reference; // nailbook_TIMESTAMP
    if (!orderId?.startsWith("nailbook_")) {
      console.log("[MP-WEBHOOK] external_reference não é do NailBook:", orderId);
      return new Response(JSON.stringify({ status: "ignored" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Busca conversa com esse payment_id pendente
    const { data: conversations } = await supabase
      .from("whatsapp_conversations")
      .select("*")
      .eq("user_id", ownerUserId)
      .not("state_data", "is", null);

    let targetConversation = null;
    for (const conv of conversations || []) {
      const sd = conv.state_data || {};
      if (sd.pending_payment?.payment_id === String(paymentId) ||
          sd.pending_payment?.order_id === orderId) {
        targetConversation = conv;
        break;
      }
    }

    if (!targetConversation) {
      console.error("[MP-WEBHOOK] Conversa não encontrada para payment_id:", paymentId);
      return new Response(JSON.stringify({ status: "conversation_not_found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stateData = targetConversation.state_data || {};
    const pending = stateData.pending_appointment;
    const pp = stateData.pending_payment;

    if (!pending) {
      console.error("[MP-WEBHOOK] Agendamento pendente não encontrado");
      return new Response(JSON.stringify({ status: "no_pending" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Busca serviço
    const { data: services } = await supabase
      .from("services").select("*").eq("user_id", ownerUserId).eq("is_active", true);

    const service = services?.find((s: any) =>
      s.name.toLowerCase().includes(pending.service_name.toLowerCase()) ||
      pending.service_name.toLowerCase().includes(s.name.toLowerCase())
    );

    if (!service) {
      console.error("[MP-WEBHOOK] Serviço não encontrado:", pending.service_name);
      return new Response(JSON.stringify({ status: "service_not_found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const startAt = new Date(`${pending.date}T${pending.time}:00-03:00`);
    const endAt = new Date(startAt.getTime() + service.duration_minutes * 60000);
    const phone = targetConversation.phone;

    // Busca ou cria cliente
    let { data: client } = await supabase
      .from("clients").select("*").eq("user_id", ownerUserId).eq("phone", phone).maybeSingle();

    if (!client) {
      const cd = stateData.client_data || {};
      const { data: newClient } = await supabase.from("clients").insert({
        user_id: ownerUserId,
        full_name: pending.client_name,
        phone,
        email: cd.email || null,
        date_of_birth: cd.birth_date ? (() => { const [d,m,y] = cd.birth_date.split("/"); return `${y}-${m}-${d}`; })() : null,
      }).select().single();
      client = newClient;
    }

    // Busca profile_id da manicure — garante que é UUID válido
    let manicureProfileId = null;
    if (pending.manicure_user_id) {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pending.manicure_user_id);
      if (isUUID) {
        const { data: mProf } = await supabase.from("profiles").select("id").eq("user_id", pending.manicure_user_id).single();
        manicureProfileId = mProf?.id || null;
      } else {
        console.warn("[MP-WEBHOOK] manicure_user_id inválido (não é UUID):", pending.manicure_user_id);
      }
    }

    // Cria agendamento
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
      console.error("[MP-WEBHOOK] Erro ao criar agendamento:", apptError);
      return new Response(JSON.stringify({ error: apptError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Atualiza conversa — limpa pendências
    await supabase.from("whatsapp_conversations").update({
      client_id: client.id,
      state_data: {
        ...stateData,
        pending_payment: null,
        pending_appointment: null,
        client_data: null,
        selected_manicure: null,
        history: stateData.history || [],
      },
    }).eq("id", targetConversation.id);

    const [y, m, d] = pending.date.split("-");

    // Envia confirmação para o cliente
    await sendMessageToPhone(phone, `✅ *Pagamento confirmado! Agendamento criado!*\n\n👤 ${pending.client_name}\n💅 ${pending.service_name}\n📅 ${d}/${m}/${y} às ${pending.time}\n💰 Sinal pago: R$ ${pp.amount.toFixed(2)}\n\nTe esperamos! 💕`);

    // Avisa manicure
    if (paymentSettings?.notify_manicure !== false && pending.manicure_user_id) {
      const { data: manicureProfile } = await supabase
        .from("profiles").select("phone, full_name").eq("user_id", pending.manicure_user_id).single();
      if (manicureProfile?.phone) {
        await sendMessageToPhone(
          manicureProfile.phone,
          `🔔 *Novo agendamento confirmado!*\n\n👤 Cliente: ${pending.client_name}\n💅 Serviço: ${pending.service_name}\n📅 ${d}/${m}/${y} às ${pending.time}\n💰 Sinal pago via PIX: R$ ${pp.amount.toFixed(2)}`
        );
      }
    }

    // Avisa dona do estúdio
    if (paymentSettings?.notify_owner !== false) {
      const { data: ownerProf } = await supabase
        .from("profiles").select("phone").eq("user_id", ownerUserId).single();
      if (ownerProf?.phone && ownerProf.phone !== (await supabase.from("profiles").select("phone").eq("user_id", pending.manicure_user_id).single()).data?.phone) {
        await sendMessageToPhone(
          ownerProf.phone,
          `🔔 *Novo agendamento confirmado!*\n\n👤 Cliente: ${pending.client_name}\n💅 Serviço: ${pending.service_name}\n📅 ${d}/${m}/${y} às ${pending.time}\n💰 Sinal pago via PIX: R$ ${pp.amount.toFixed(2)}`
        );
      }
    }

    console.log("[MP-WEBHOOK] Agendamento criado com sucesso!");
    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[MP-WEBHOOK] Erro geral:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
