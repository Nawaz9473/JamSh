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
    const { action, notificationId, category = "All" } = body;

    // Fetch User Notifications
    if (action === "fetch-notifications") {
      const page = body.page || 0;
      const limit = body.limit || 20;
      const from = page * limit;
      const to = from + limit - 1;

      let query = supabaseAdmin
        .from("notifications")
        .select("*, sender:profiles!sender_id(*)")
        .eq("receiver_id", user.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (category && category !== "All" && category !== "ALL") {
        query = query.eq("type", category.toUpperCase());
      }

      const { data: notifications, error } = await query;
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ notifications: notifications || [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Unread Counts
    if (action === "unread-counts") {
      const { data: unread } = await supabaseAdmin
        .from("notifications")
        .select("id, type")
        .eq("receiver_id", user.id)
        .eq("status", "UNREAD")
        .is("deleted_at", null);

      const unreadList = unread || [];
      const notifCount = unreadList.filter((n: any) => n.type !== "MESSAGE" && n.type !== "COMMUNITY").length;
      const msgCount = unreadList.filter((n: any) => n.type === "MESSAGE").length;

      return new Response(
        JSON.stringify({
          counts: {
            messages: msgCount,
            notifications: notifCount,
            communities: 0,
            requests: 0,
          },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Mark Single Notification as Read
    if (action === "mark-read") {
      if (!notificationId) {
        return new Response(JSON.stringify({ error: "Missing notificationId" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabaseAdmin
        .from("notifications")
        .update({ status: "READ", read_at: new Date().toISOString() })
        .eq("id", notificationId)
        .eq("receiver_id", user.id);

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark All Notifications as Read
    if (action === "mark-all-read") {
      await supabaseAdmin
        .from("notifications")
        .update({ status: "READ", read_at: new Date().toISOString() })
        .eq("receiver_id", user.id)
        .eq("status", "UNREAD");

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Delete Notification
    if (action === "delete-notification") {
      if (!notificationId) {
        return new Response(JSON.stringify({ error: "Missing notificationId" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabaseAdmin
        .from("notifications")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", notificationId)
        .eq("receiver_id", user.id);

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
    console.error("[notifications-api] Exception:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
