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
      return new Response(JSON.stringify({ error: "Missing or invalid authorization header" }), {
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
    const { postId, content, parentId } = body;

    if (!postId || !content) {
      return new Response(JSON.stringify({ error: "Missing postId or content parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert comment
    const { data: newComment, error: insErr } = await supabaseClient
      .from("comments")
      .insert({
        user_id: user.id,
        post_id: postId,
        content,
        parent_id: parentId || null,
      })
      .select("*, user:profiles(*)")
      .single();

    if (insErr) {
      return new Response(JSON.stringify({ error: insErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: senderProfile } = await supabaseClient
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();

    const senderUsername = senderProfile?.username || "someone";
    const preview = content.substring(0, 60);

    // 1. If it's a reply to a parent comment, notify parent comment owner
    let parentCommentOwner: string | null = null;
    if (parentId) {
      const { data: parentComm } = await supabaseClient.from("comments").select("user_id").eq("id", parentId).single();
      parentCommentOwner = parentComm?.user_id || null;

      if (parentCommentOwner && parentCommentOwner !== user.id) {
        const notifId = crypto.randomUUID();
        await supabaseAdmin.from("notifications").insert({
          id: notifId,
          receiver_id: parentCommentOwner,
          sender_id: user.id,
          type: "REPLY",
          status: "UNREAD",
          priority: "MEDIUM",
          delivery_status: "PENDING",
          group_key: `REPLY_${newComment.id}_${parentCommentOwner}`,
          metadata: { actors: [senderUsername], count: 1, preview },
        });

        await supabaseAdmin.from("outbox").insert({
          aggregate: "Notification",
          aggregate_id: notifId,
          event: "NotificationCreated",
          payload: {
            notificationId: notifId,
            receiverId: parentCommentOwner,
            type: "REPLY",
            priority: "MEDIUM",
            metadata: { actors: [senderUsername], count: 1, preview },
          },
        });
      }
    }

    // 2. Notify post owner (if not self and not already parent comment owner)
    const { data: targetPost } = await supabaseClient.from("posts").select("user_id").eq("id", postId).single();
    const postOwner = targetPost?.user_id || null;

    if (postOwner && postOwner !== user.id && (!parentCommentOwner || postOwner !== parentCommentOwner)) {
      const notifId = crypto.randomUUID();
      await supabaseAdmin.from("notifications").insert({
        id: notifId,
        receiver_id: postOwner,
        sender_id: user.id,
        type: "COMMENT",
        status: "UNREAD",
        priority: "MEDIUM",
        delivery_status: "PENDING",
        group_key: `COMMENT_${newComment.id}_${postOwner}`,
        metadata: { actors: [senderUsername], count: 1, preview },
      });

      await supabaseAdmin.from("outbox").insert({
        aggregate: "Notification",
        aggregate_id: notifId,
        event: "NotificationCreated",
        payload: {
          notificationId: notifId,
          receiverId: postOwner,
          type: "COMMENT",
          priority: "MEDIUM",
          metadata: { actors: [senderUsername], count: 1, preview },
        },
      });
    }

    return new Response(JSON.stringify({ comment: newComment }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[handle-comment] Exception:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
