import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { email, password, full_name, phone, studio_profile_id } = await req.json();

    // Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (authError) throw authError;

    const userId = authData.user.id;

    // Update profile
    await supabaseAdmin.from("profiles").update({
      full_name,
      phone: phone || null,
      account_type: "solo",
      studio_id: studio_profile_id,
    }).eq("user_id", userId);

    // Add manicure role
    await supabaseAdmin.from("user_roles").insert({
      user_id: userId,
      role: "manicure",
    });

    // Link to studio
    await supabaseAdmin.from("studio_manicures").insert({
      studio_profile_id,
      manicure_user_id: userId,
      is_active: true,
    });

    return new Response(JSON.stringify({ success: true, user_id: userId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
