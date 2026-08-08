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
    const { storyId } = body;

    if (!storyId) {
      return new Response(JSON.stringify({ error: "storyId parameter is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch story to get media_url for storage cleanup
    const { data: story } = await supabaseClient
      .from("stories")
      .select("id, user_id, media_url")
      .eq("id", storyId)
      .single();

    if (!story || story.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Unauthorized: story not found or not owner" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Delete story record
    const { error: delErr } = await supabaseClient
      .from("stories")
      .delete()
      .eq("id", storyId)
      .eq("user_id", user.id);

    if (delErr) throw delErr;

    // Optional storage cleanup if media_url belongs to Supabase Storage stories bucket
    if (story.media_url && story.media_url.includes("/storage/v1/object/public/stories/")) {
      const storagePath = story.media_url.split("/storage/v1/object/public/stories/")[1];
      if (storagePath) {
        await supabaseAdmin.storage.from("stories").remove([storagePath]).catch(() => {});
      }
    }

    return new Response(JSON.stringify({ success: true, message: "Story deleted" }), {
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
