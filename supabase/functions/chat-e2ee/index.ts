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
    const { action, peerUserId, name, memberUserIds, roomId, deviceId, identityKey } = body;

    // Create Direct Chat Room
    if (action === "create-direct-room") {
      if (!peerUserId) {
        return new Response(JSON.stringify({ error: "Missing peerUserId" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check if room already exists
      const { data: userMemberships } = await supabaseAdmin
        .from("chat_members")
        .select("room_id")
        .eq("user_id", user.id);

      const userRoomIds = (userMemberships || []).map((m: any) => m.room_id);

      if (userRoomIds.length > 0) {
        const { data: peerMemberships } = await supabaseAdmin
          .from("chat_members")
          .select("room_id, chat_rooms(type)")
          .eq("user_id", peerUserId)
          .in("room_id", userRoomIds);

        const sharedDirectRoom = (peerMemberships || []).find((m: any) => m.chat_rooms?.type === "direct");
        if (sharedDirectRoom) {
          const { data: existingRoom } = await supabaseAdmin
            .from("chat_rooms")
            .select("*, members:chat_members(*, user:profiles(*))")
            .eq("id", sharedDirectRoom.room_id)
            .single();

          return new Response(JSON.stringify({ room: existingRoom }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Create new room
      const { data: newRoom, error: roomErr } = await supabaseAdmin
        .from("chat_rooms")
        .insert({ type: "direct" })
        .select()
        .single();

      if (roomErr) {
        return new Response(JSON.stringify({ error: roomErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabaseAdmin.from("chat_members").insert([
        { room_id: newRoom.id, user_id: user.id, role: "admin" },
        { room_id: newRoom.id, user_id: peerUserId, role: "member" },
      ]);

      const { data: fullRoom } = await supabaseAdmin
        .from("chat_rooms")
        .select("*, members:chat_members(*, user:profiles(*))")
        .eq("id", newRoom.id)
        .single();

      return new Response(JSON.stringify({ room: fullRoom || newRoom }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create Group Room
    if (action === "create-group-room") {
      const groupName = name || "New Group";
      const { data: newGroup, error: groupErr } = await supabaseAdmin
        .from("chat_rooms")
        .insert({ name: groupName, type: "group" })
        .select()
        .single();

      if (groupErr) {
        return new Response(JSON.stringify({ error: groupErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const membersToInsert = [
        { room_id: newGroup.id, user_id: user.id, role: "admin" },
        ...(Array.isArray(memberUserIds) ? memberUserIds.map((uid: string) => ({ room_id: newGroup.id, user_id: uid, role: "member" })) : []),
      ];

      await supabaseAdmin.from("chat_members").insert(membersToInsert);

      return new Response(JSON.stringify({ room: newGroup }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Register Device Key for E2EE
    if (action === "register-device-key") {
      if (!deviceId || !identityKey) {
        return new Response(JSON.stringify({ error: "Missing deviceId or identityKey" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabaseAdmin.from("device_keys").upsert({
        user_id: user.id,
        device_id: deviceId,
        identity_key: identityKey,
        signed_prekey: identityKey,
        prekey_signature: "sig_placeholder",
      });

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
    console.error("[chat-e2ee] Exception:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
