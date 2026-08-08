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
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.split(" ")[1];
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || supabaseAnonKey;

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized user session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { storyId, reactionType } = body;

    if (!storyId || !reactionType) {
      return new Response(JSON.stringify({ error: "storyId and reactionType parameters are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate Limit Check: max 60 reactions per minute
    const { data: allowed } = await supabaseClient.rpc("check_story_rate_limit", {
      p_user_id: user.id,
      p_action: "react",
      p_max_limit: 60,
      p_window_seconds: 60,
    });

    if (allowed === false) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check story owner
    const { data: story } = await supabaseAdmin
      .from("stories")
      .select("id, user_id")
      .eq("id", storyId)
      .single();

    if (!story) {
      return new Response(JSON.stringify({ error: "Story not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check existing reaction
    const { data: existing } = await supabaseClient
      .from("story_reactions")
      .select("id, reaction_type")
      .eq("story_id", storyId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing && existing.reaction_type === reactionType) {
      // Toggle off
      await supabaseClient.from("story_reactions").delete().eq("id", existing.id);
      return new Response(JSON.stringify({ success: true, reaction: null, action: "removed" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upsert new reaction
    const { data: reaction, error: reactErr } = await supabaseClient
      .from("story_reactions")
      .upsert({
        story_id: storyId,
        user_id: user.id,
        reaction_type: reactionType,
      })
      .select()
      .single();

    if (reactErr) throw reactErr;

    // Generate Notification for Story Reaction (if reactor != owner)
    if (story.user_id !== user.id) {
      await supabaseAdmin.from("notifications").insert({
        receiver_id: story.user_id,
        sender_id: user.id,
        type: "story",
        content: `reacted ${reactionType} to your story`,
        reference_id: storyId,
      }).catch((e: any) => console.warn("[story-react] Notification insert note:", e));
    }

    return new Response(JSON.stringify({ success: true, reaction: reaction.reaction_type, action: "added" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
