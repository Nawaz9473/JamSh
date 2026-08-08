import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "tray";

    // -------------------------------------------------------------
    // ACTION 1: FETCH STORY TRAY
    // -------------------------------------------------------------
    if (action === "tray") {
      const { data: trayData, error: trayErr } = await supabaseClient.rpc("fetch_story_tray", {
        p_viewer_id: user.id,
      });

      if (trayErr) {
        // Fallback manually if RPC doesn't exist yet
        const { data: activeStories, error: storiesErr } = await supabaseClient
          .from("stories")
          .select(`
            id,
            user_id,
            created_at,
            expires_at,
            profiles:user_id (id, username, display_name, avatar_url),
            story_views (id, user_id)
          `)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false });

        if (storiesErr) throw storiesErr;

        const groupedMap = new Map();

        (activeStories || []).forEach((s: any) => {
          const authorId = s.user_id;
          const profile = s.profiles || {};
          const isViewed = (s.story_views || []).some((v: any) => v.user_id === user.id);

          if (!groupedMap.has(authorId)) {
            groupedMap.set(authorId, {
              author_id: authorId,
              username: profile.username || "user",
              display_name: profile.display_name || profile.username || "User",
              avatar_url: profile.avatar_url || "",
              stories_count: 0,
              unseen_count: 0,
              latest_story_created_at: s.created_at,
              is_own_story: authorId === user.id,
            });
          }

          const group = groupedMap.get(authorId);
          group.stories_count += 1;
          if (!isViewed) group.unseen_count += 1;
          if (new Date(s.created_at) > new Date(group.latest_story_created_at)) {
            group.latest_story_created_at = s.created_at;
          }
        });

        const sortedTray = Array.from(groupedMap.values()).sort((a: any, b: any) => {
          if (a.is_own_story !== b.is_own_story) return a.is_own_story ? -1 : 1;
          const aUnseen = a.unseen_count > 0;
          const bUnseen = b.unseen_count > 0;
          if (aUnseen !== bUnseen) return aUnseen ? -1 : 1;
          return new Date(b.latest_story_created_at).getTime() - new Date(a.latest_story_created_at).getTime();
        });

        return new Response(JSON.stringify({ tray: sortedTray }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ tray: trayData || [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -------------------------------------------------------------
    // ACTION 2: FETCH USER STORIES
    // -------------------------------------------------------------
    if (action === "user-stories") {
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
    }

    // -------------------------------------------------------------
    // ACTION 3: CREATE STORY
    // -------------------------------------------------------------
    if (action === "create" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { media_url, media_type, thumbnail_url, caption, stickers, text_overlays, location, music_track } = body;

      if (!media_url || !media_type) {
        return new Response(JSON.stringify({ error: "media_url and media_type are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

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
          expires_at,
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      return new Response(JSON.stringify({ success: true, story }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -------------------------------------------------------------
    // ACTION 4: DELETE STORY
    // -------------------------------------------------------------
    if (action === "delete" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const storyId = body.storyId || url.searchParams.get("storyId");

      if (!storyId) {
        return new Response(JSON.stringify({ error: "storyId parameter is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: deleteErr } = await supabaseClient
        .from("stories")
        .delete()
        .eq("id", storyId)
        .eq("user_id", user.id);

      if (deleteErr) throw deleteErr;

      return new Response(JSON.stringify({ success: true, message: "Story deleted" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -------------------------------------------------------------
    // ACTION 5: MARK STORY VIEWED
    // -------------------------------------------------------------
    if (action === "view" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { storyId } = body;

      if (!storyId) {
        return new Response(JSON.stringify({ error: "storyId parameter is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Upsert into story_views
      const { data: viewData, error: viewErr } = await supabaseClient
        .from("story_views")
        .upsert(
          { story_id: storyId, user_id: user.id },
          { onConflict: "story_id, user_id" }
        )
        .select();

      if (viewErr) {
        // If unique constraint conflict, ignore error
        console.warn("View upsert warning:", viewErr.message);
      }

      return new Response(JSON.stringify({ success: true, viewed: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -------------------------------------------------------------
    // ACTION 6: REACT TO STORY
    // -------------------------------------------------------------
    if (action === "react" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { storyId, reactionType } = body;

      if (!storyId || !reactionType) {
        return new Response(JSON.stringify({ error: "storyId and reactionType parameters are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check existing reaction
      const { data: existingReaction } = await supabaseClient
        .from("story_reactions")
        .select("id, reaction_type")
        .eq("story_id", storyId)
        .eq("user_id", user.id)
        .single();

      if (existingReaction && existingReaction.reaction_type === reactionType) {
        // Delete reaction toggle off
        await supabaseClient
          .from("story_reactions")
          .delete()
          .eq("id", existingReaction.id);

        return new Response(JSON.stringify({ success: true, reaction: null, action: "removed" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Upsert reaction
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

      return new Response(JSON.stringify({ success: true, reaction: reaction.reaction_type, action: "added" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -------------------------------------------------------------
    // ACTION 7: FETCH STORY VIEWERS
    // -------------------------------------------------------------
    if (action === "viewers") {
      const storyId = url.searchParams.get("storyId");

      if (!storyId) {
        return new Response(JSON.stringify({ error: "storyId parameter is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify ownership of the story
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
    }

    return new Response(JSON.stringify({ error: "Invalid action parameter" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
