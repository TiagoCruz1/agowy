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
  await fetch(`${provider.url}/message/sendText/${provider.instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: provider.key },
    body: JSON.stringify({
      number: phone.replace(/\D/g, ""),
      options: { delay: 1200, presence: "composing" },
      text: message,
    }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let body: any;
  try {
    body = await req.json();
    console.log("[IP-WEBHOOK] Recebido:", JSON.stringify(body).substring(0, 300));
  } catch (e) {
    return new Response("ok", { status: 200 });
  }

  const orderNsu = body?.order_nsu;
  const paid = body?.invoice_slug || body?.transaction_nsu;

  if (!orderNsu || !paid) {
    console.log("[IP-WEBHOOK] Ignorando — sem order_nsu ou pagamento");
    return new Response("ok", { status: 200 });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: ownerProfile } = await supabase
      .from("profiles").select("user_id, business_name")
      .eq("account_type", "studio").limit(1).single();

    if (!ownerProfile) {
      console.error("[IP-WEBHOOK] Owner não encontrado");
      return new Response("ok", { status: 200 });
    }

    const ownerUserId = ownerProfile.user_id;

    const { data: paymentSettings } = await supabase
      .from("payment_settings").select("*").eq("user_id", ownerUserId).maybeSingle();

    // Busca conversa com esse order_nsu pendente
    const { data: conversations } = await supabase
      .from("whatsapp_conversations")
      .select("*")
      .eq("user_id", ownerUserId)
      .not("state_data", "is", null);

    let targetConversation = null;
    for (const conv of conversations || []) {
      const sd = conv.state_data || {};
      if (sd.pending_payment?.order_id === orderNsu) {
        targetConversation = conv;
        break;
      }
    }

    if (!targetConversation) {
      console.error("[IP-WEBHOOK] Conversa não encontrada para order_nsu:", orderNsu);
      return new Response("ok", { status: 200 });
    }

    const stateData = targetConversation.state_data || {};
    const pending = stateData.pending_appointment;
    const pp = stateData.pending_payment;

    if (!pending) {
      console.error("[IP-WEBHOOK] Agendamento pendente não encontrado");
      return new Response("ok", { status: 200 });
    }

    const { data: services } = await supabase
      .from("services").select("*").eq("user_id", ownerUserId).eq("is_active", true);

    const service = services?.find((s: any) =>
      s.name.toLowerCase().includes(pending.service_name.toLowerCase()) ||
      pending.service_name.toLowerCase().includes(s.name.toLowerCase())
    );

    if (!service) {
      console.error("[IP-WEBHOOK] Serviço não encontrado:", pending.service_name);
      return new Response("ok", { status: 200 });
    }

    const startAt = new Date(`${pending.date}T${pending.time}:00-03:00`);
    const endAt = new Date(startAt.getTime() + service.duration_minutes * 60000);
    const phone = targetConversation.phone;

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

    if (apptError) {
      console.error("[IP-WEBHOOK] Erro ao criar agendamento:", apptError);
      return new Response("ok", { status: 200 });
    }

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
    const signalAmount = pp?.amount || 0;

    await sendMessage(phone, `✅ *Pagamento confirmado! Agendamento criado!*\n\n👤 ${pending.client_name}\n💅 ${pending.service_name}\n📅 ${d}/${m}/${y} às ${pending.time}\n💰 Sinal pago: R$ ${signalAmount.toFixed(2)}\n\nTe esperamos! 💕`);

    const notifyMsg = `🔔 *Novo agendamento confirmado!*\n\n👤 Cliente: ${pending.client_name}\n💅 Serviço: ${pending.service_name}\n📅 ${d}/${m}/${y} às ${pending.time}\n💰 Sinal pago via cartão: R$ ${signalAmount.toFixed(2)}`;

    if (paymentSettings?.notify_manicure !== false && pending.manicure_user_id) {
      const { data: mProf } = await supabase.from("profiles").select("phone").eq("user_id", pending.manicure_user_id).single();
      if (mProf?.phone) await sendMessage(mProf.phone, notifyMsg);
    }

    if (paymentSettings?.notify_owner !== false) {
      const { data: ownerProf } = await supabase.from("profiles").select("phone").eq("user_id", ownerUserId).single();
      if (ownerProf?.phone) await sendMessage(ownerProf.phone, notifyMsg);
    }

    console.log("[IP-WEBHOOK] Agendamento criado com sucesso!");
    return new Response("ok", { status: 200 });

  } catch (error) {
    console.error("[IP-WEBHOOK] Erro geral:", error);
    return new Response("ok", { status: 200 });
  }
});
