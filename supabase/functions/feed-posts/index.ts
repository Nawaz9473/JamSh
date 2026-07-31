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
    const { action, postId, content, type = "text", mediaUrls = [], targetUserId } = body;

    // Fetch Feed
    if (action === "fetch-feed") {
      const page = body.page || 0;
      const limit = body.limit || 20;
      const from = page * limit;
      const to = from + limit - 1;

      let query = supabaseAdmin
        .from("posts")
        .select("*, user:profiles(*), media:post_media(*)")
        .order("created_at", { ascending: false })
        .range(from, to);

      if (targetUserId) {
        query = query.eq("user_id", targetUserId);
      }

      const { data: posts, error } = await query;
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ posts: posts || [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create Post
    if (action === "create-post") {
      const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
      if (userError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized user session" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: newPost, error: postError } = await supabaseAdmin
        .from("posts")
        .insert({
          user_id: user.id,
          content,
          type,
          status: "published",
        })
        .select("*, user:profiles(*)")
        .single();

      if (postError) {
        return new Response(JSON.stringify({ error: postError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Attach media items if provided
      if (Array.isArray(mediaUrls) && mediaUrls.length > 0) {
        const mediaItems = mediaUrls.map((url: string, index: number) => ({
          post_id: newPost.id,
          media_url: url,
          media_type: url.match(/\.(mp4|mov|webm)$/i) ? "video" : "image",
          position: index,
        }));
        await supabaseAdmin.from("post_media").insert(mediaItems);
      }

      const { data: fullPost } = await supabaseAdmin
        .from("posts")
        .select("*, user:profiles(*), media:post_media(*)")
        .eq("id", newPost.id)
        .single();

      return new Response(JSON.stringify({ post: fullPost || newPost }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Delete Post
    if (action === "delete-post") {
      const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
      if (userError || !user || !postId) {
        return new Response(JSON.stringify({ error: "Unauthorized or missing postId" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: delErr } = await supabaseAdmin
        .from("posts")
        .delete()
        .eq("id", postId)
        .eq("user_id", user.id);

      if (delErr) {
        return new Response(JSON.stringify({ error: delErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Toggle Save (Bookmark)
    if (action === "toggle-save") {
      const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
      if (userError || !user || !postId) {
        return new Response(JSON.stringify({ error: "Unauthorized or missing postId" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: existing } = await supabaseAdmin
        .from("saves")
        .select("id")
        .eq("user_id", user.id)
        .eq("post_id", postId)
        .maybeSingle();

      if (existing) {
        await supabaseAdmin.from("saves").delete().eq("id", existing.id);
        return new Response(JSON.stringify({ saved: false }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        await supabaseAdmin.from("saves").insert({ user_id: user.id, post_id: postId });
        return new Response(JSON.stringify({ saved: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Log Post View
    if (action === "log-view") {
      const watchTime = body.watchTime || 0.0;
      if (postId) {
        await supabaseAdmin.from("post_views").insert({
          post_id: postId,
          watch_time: watchTime,
          user_id: token ? (await supabaseClient.auth.getUser())?.data?.user?.id || null : null,
        });
      }
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
    console.error("[feed-posts] Exception:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
