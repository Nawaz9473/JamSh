import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || supabaseAnonKey;

    const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
      auth: { persistSession: false },
    });

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const { action, name, description, communityId } = body;

    // Fetch Communities
    if (action === "fetch-communities") {
      const { data: communities } = await supabaseAdmin
        .from("communities")
        .select("*, creator:profiles!creator_id(*), members:community_members(count)")
        .order("created_at", { ascending: false });

      return new Response(JSON.stringify({ communities: communities || [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create Community
    if (action === "create-community") {
      const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
      if (userError || !user || !name) {
        return new Response(JSON.stringify({ error: "Unauthorized or missing name" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: comm, error } = await supabaseAdmin
        .from("communities")
        .insert({
          name,
          description,
          creator_id: user.id,
        })
        .select()
        .single();

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Add creator as moderator member
      await supabaseAdmin.from("community_members").insert({
        community_id: comm.id,
        user_id: user.id,
        role: "moderator",
      });

      return new Response(JSON.stringify({ community: comm }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Join Community
    if (action === "join-community") {
      const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
      if (userError || !user || !communityId) {
        return new Response(JSON.stringify({ error: "Unauthorized or missing communityId" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabaseAdmin.from("community_members").upsert({
        community_id: communityId,
        user_id: user.id,
        role: "member",
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[communities-channels] Exception:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
