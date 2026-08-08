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

    // Rate Limit Check: max 10 stories per hour
    const { data: allowed, error: rateErr } = await supabaseClient.rpc("check_story_rate_limit", {
      p_user_id: user.id,
      p_action: "create",
      p_max_limit: 10,
      p_window_seconds: 3600,
    });

    if (!rateErr && allowed === false) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Maximum 10 stories per hour." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const {
      media_url,
      media_type,
      thumbnail_url,
      caption,
      stickers,
      text_overlays,
      location,
      music_track,
      width,
      height,
      aspect_ratio,
      duration,
      file_size,
      mime_type,
    } = body;

    if (!media_url || !media_type) {
      return new Response(JSON.stringify({ error: "media_url and media_type are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Server-computed 24-hour expiration
    const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { data: story, error: insertErr } = await supabaseClient
      .from("stories")
      .insert({
        user_id: user.id,
        media_url,
        media_type,
        thumbnail_url: thumbnail_url || null,
        caption: caption || null,
        stickers: stickers ? (typeof stickers === "string" ? JSON.parse(stickers) : stickers) : [],
        text_overlays: text_overlays ? (typeof text_overlays === "string" ? JSON.parse(text_overlays) : text_overlays) : [],
        location: location || null,
        music_track: music_track ? (typeof music_track === "string" ? JSON.parse(music_track) : music_track) : null,
        width: width || null,
        height: height || null,
        aspect_ratio: aspect_ratio || null,
        duration: duration || null,
        file_size: file_size || null,
        mime_type: mime_type || null,
        expires_at,
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    return new Response(JSON.stringify({ success: true, story }), {
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
