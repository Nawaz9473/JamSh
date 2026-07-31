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

    // Authenticate current user
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized user session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { targetUserId } = body;

    if (!targetUserId) {
      return new Response(JSON.stringify({ error: "Missing targetUserId parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (user.id === targetUserId) {
      return new Response(JSON.stringify({ error: "Cannot follow yourself" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Check existing follow relationship
    const { data: existing } = await supabaseClient
      .from("followers")
      .select("id, status")
      .eq("follower_id", user.id)
      .eq("following_id", targetUserId)
      .maybeSingle();

    if (existing) {
      // Unfollow: Delete relation
      const { error: delErr } = await supabaseClient.from("followers").delete().eq("id", existing.id);
      if (delErr) {
        return new Response(JSON.stringify({ error: delErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ status: "unfollowed" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      // Follow: Fetch target user profile to check if private
      const { data: targetProfile } = await supabaseClient
        .from("profiles")
        .select("is_private")
        .eq("id", targetUserId)
        .single();

      const followStatus = targetProfile?.is_private ? "pending" : "accepted";

      const { error: insErr } = await supabaseClient
        .from("followers")
        .insert({ follower_id: user.id, following_id: targetUserId, status: followStatus });

      if (insErr) {
        return new Response(JSON.stringify({ error: insErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Trigger notification if accepted
      if (followStatus === "accepted") {
        const { data: senderProfile } = await supabaseClient
          .from("profiles")
          .select("username")
          .eq("id", user.id)
          .maybeSingle();

        const senderUsername = senderProfile?.username || "someone";

        // Insert notification record
        const notifId = crypto.randomUUID();
        await supabaseAdmin.from("notifications").insert({
          id: notifId,
          receiver_id: targetUserId,
          sender_id: user.id,
          type: "FOLLOW",
          status: "UNREAD",
          priority: "MEDIUM",
          delivery_status: "PENDING",
          group_key: `FOLLOW_${targetUserId}_${targetUserId}`,
          metadata: { actors: [senderUsername], count: 1 },
        });

        // Insert outbox record for push notification workers
        await supabaseAdmin.from("outbox").insert({
          aggregate: "Notification",
          aggregate_id: notifId,
          event: "NotificationCreated",
          payload: {
            notificationId: notifId,
            receiverId: targetUserId,
            type: "FOLLOW",
            priority: "MEDIUM",
            metadata: { actors: [senderUsername], count: 1 },
          },
        });
      }

      return new Response(JSON.stringify({ status: followStatus }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err: any) {
    console.error("[handle-follow] Exception:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
