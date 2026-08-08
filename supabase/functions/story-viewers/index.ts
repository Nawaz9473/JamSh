import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
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

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized user session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const storyId = url.searchParams.get("storyId");

    if (!storyId) {
      return new Response(JSON.stringify({ error: "storyId parameter is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller is story owner
    const { data: story } = await supabaseClient
      .from("stories")
      .select("id, user_id")
      .eq("id", storyId)
      .single();

    if (!story || story.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Unauthorized: only the story owner can view the viewer list" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: views, error: viewsErr } = await supabaseClient
      .from("story_views")
      .select(`
        id,
        created_at,
        user:user_id (id, username, display_name, avatar_url)
      `)
      .eq("story_id", storyId)
      .order("created_at", { ascending: false });

    if (viewsErr) throw viewsErr;

    const formattedViewers = (views || []).map((v: any) => ({
      id: v.id,
      user_id: v.user?.id,
      username: v.user?.username || "user",
      display_name: v.user?.display_name || v.user?.username || "User",
      avatar_url: v.user?.avatar_url || "",
      viewed_at: v.created_at,
    }));

    return new Response(JSON.stringify({ viewers: formattedViewers, count: formattedViewers.length }), {
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
