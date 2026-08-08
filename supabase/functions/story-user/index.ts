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
    const targetUserId = url.searchParams.get("userId") || user.id;

    const { data: stories, error: storiesErr } = await supabaseClient
      .from("stories")
      .select(`
        *,
        user:user_id (id, username, display_name, avatar_url),
        story_views (id, user_id, created_at),
        story_reactions (id, user_id, reaction_type, created_at)
      `)
      .eq("user_id", targetUserId)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true });

    if (storiesErr) throw storiesErr;

    const formattedStories = (stories || []).map((story: any) => {
      const isViewed = (story.story_views || []).some((v: any) => v.user_id === user.id);
      const myReaction = (story.story_reactions || []).find((r: any) => r.user_id === user.id);

      return {
        ...story,
        views_count: (story.story_views || []).length,
        is_viewed: isViewed,
        my_reaction: myReaction ? myReaction.reaction_type : null,
      };
    });

    return new Response(JSON.stringify({ stories: formattedStories }), {
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
