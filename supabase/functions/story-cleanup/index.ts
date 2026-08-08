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
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const nowIso = new Date().toISOString();

    // 1. Fetch expired stories
    const { data: expiredStories, error: fetchErr } = await supabaseAdmin
      .from("stories")
      .select("*")
      .lte("expires_at", nowIso);

    if (fetchErr) throw fetchErr;

    let recordsCleaned = 0;
    let storageDeletedCount = 0;

    if (expiredStories && expiredStories.length > 0) {
      // 2. Move expired stories to story_archives table
      const archiveRows = expiredStories.map((story) => ({
        user_id: story.user_id,
        media_url: story.media_url,
        media_type: story.media_type,
        thumbnail_url: story.thumbnail_url,
        caption: story.caption,
        stickers: story.stickers,
        text_overlays: story.text_overlays,
        location: story.location,
        music_track: story.music_track,
        original_created_at: story.created_at,
        archived_at: nowIso,
      }));

      await supabaseAdmin.from("story_archives").insert(archiveRows).catch((e) => {
        console.warn("[story-cleanup] Archive insert warning:", e.message);
      });

      // 3. Delete expired storage objects if not using external storage
      const storagePaths: string[] = [];
      expiredStories.forEach((s) => {
        if (s.media_url && s.media_url.includes("/storage/v1/object/public/stories/")) {
          const path = s.media_url.split("/storage/v1/object/public/stories/")[1];
          if (path) storagePaths.push(path);
        }
      });

      if (storagePaths.length > 0) {
        const { data: removeRes } = await supabaseAdmin.storage.from("stories").remove(storagePaths);
        storageDeletedCount = removeRes ? removeRes.length : storagePaths.length;
      }

      // 4. Delete expired stories from database
      const expiredIds = expiredStories.map((s) => s.id);
      const { error: delErr } = await supabaseAdmin.from("stories").delete().in("id", expiredIds);
      if (delErr) throw delErr;

      recordsCleaned = expiredIds.length;
    }

    // 5. Clean up orphaned rate limit records older than 1 day
    await supabaseAdmin
      .from("story_rate_limits")
      .delete()
      .lt("window_start", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .catch(() => {});

    // 6. Record Maintenance Log
    await supabaseAdmin.from("maintenance_logs").insert({
      job_name: "story-cleanup",
      records_cleaned: recordsCleaned,
      storage_deleted_count: storageDeletedCount,
      run_at: nowIso,
    }).catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        recordsCleaned,
        storageDeletedCount,
        message: `Successfully cleaned ${recordsCleaned} expired stories and ${storageDeletedCount} storage files`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || "Cleanup job failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
