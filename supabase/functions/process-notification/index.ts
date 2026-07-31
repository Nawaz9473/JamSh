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
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";

    // Service role client to bypass RLS for writing system notifications & outbox events
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const { receiverId, senderId, type, priority = "MEDIUM", metadata = {}, groupKey } = body;

    if (!receiverId || !senderId || !type) {
      return new Response(JSON.stringify({ error: "Missing required fields: receiverId, senderId, type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (receiverId === senderId) {
      return new Response(JSON.stringify({ message: "Skipping self-notification" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Fetch sender's username
    const { data: senderProfile } = await supabaseAdmin
      .from("profiles")
      .select("username")
      .eq("id", senderId)
      .maybeSingle();

    const senderUsername = senderProfile?.username || "someone";
    const finalMetadata = {
      actors: [senderUsername],
      count: 1,
      ...metadata,
    };

    const derivedGroupKey = groupKey || `${type}_${receiverId}`;

    // 2. Insert into notifications table
    const notifId = crypto.randomUUID();
    const { data: notification, error: notifError } = await supabaseAdmin
      .from("notifications")
      .insert({
        id: notifId,
        receiver_id: receiverId,
        sender_id: senderId,
        type: type,
        status: "UNREAD",
        priority: priority,
        delivery_status: "PENDING",
        group_key: derivedGroupKey,
        metadata: finalMetadata,
      })
      .select()
      .single();

    if (notifError) {
      console.error("[process-notification] Notif Insert Error:", notifError);
      return new Response(JSON.stringify({ error: notifError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Insert into outbox table for push delivery workers
    const { error: outboxError } = await supabaseAdmin.from("outbox").insert({
      aggregate: "Notification",
      aggregate_id: notifId,
      event: "NotificationCreated",
      payload: {
        notificationId: notifId,
        receiverId,
        type,
        priority,
        metadata: finalMetadata,
      },
    });

    if (outboxError) {
      console.warn("[process-notification] Outbox Insert Error:", outboxError);
    }

    return new Response(JSON.stringify({ success: true, notification }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[process-notification] Exception:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
