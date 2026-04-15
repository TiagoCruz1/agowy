import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") || "";
    const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";
    const EVOLUTION_INSTANCE = Deno.env.get("EVOLUTION_INSTANCE") || "";
    const ZAPI_INSTANCE_ID = Deno.env.get("ZAPI_INSTANCE_ID") || "";
    const ZAPI_TOKEN = Deno.env.get("ZAPI_TOKEN") || "";

    const { phone, message } = await req.json();

    if (!phone || !message) {
      return new Response(JSON.stringify({ error: "phone and message are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanPhone = String(phone).replace(/\D/g, "");

    if (EVOLUTION_API_URL && EVOLUTION_API_KEY && EVOLUTION_INSTANCE) {
      const evolutionUrl = `${EVOLUTION_API_URL.replace(/\/$/, "")}/message/sendText/${EVOLUTION_INSTANCE}`;
      const response = await fetch(evolutionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: EVOLUTION_API_KEY,
        },
        body: JSON.stringify({
          number: cleanPhone,
          text: message,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(`Evolution error [${response.status}]: ${JSON.stringify(data)}`);
      }

      return new Response(JSON.stringify({ success: true, provider: "evolution", data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (ZAPI_INSTANCE_ID && ZAPI_TOKEN) {
      const ZAPI_CLIENT_TOKEN = Deno.env.get("ZAPI_CLIENT_TOKEN");
      const zapiUrl = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (ZAPI_CLIENT_TOKEN) {
        headers["Client-Token"] = ZAPI_CLIENT_TOKEN;
      }

      const response = await fetch(zapiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          phone: cleanPhone,
          message,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(`Z-API error [${response.status}]: ${JSON.stringify(data)}`);
      }

      return new Response(JSON.stringify({ success: true, provider: "zapi", data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("No WhatsApp provider configured. Set EVOLUTION_* or ZAPI_* env vars.");
  } catch (error) {
    console.error("Error sending WhatsApp:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
