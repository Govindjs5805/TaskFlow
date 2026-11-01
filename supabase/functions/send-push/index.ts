// Supabase Edge Function: send-push
// Invoked via cron or webhook to dispatch Web Push notifications to subscribed devices.
// Secrets required in Supabase Dashboard -> Edge Functions -> Secrets:
// - VAPID_PUBLIC_KEY
// - VAPID_PRIVATE_KEY
// - VAPID_SUBJECT (e.g. mailto:your-email@example.com)
// - SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
// webpush library for Deno / Web Standards
import webpush from "https://esm.sh/web-push@3.6.7";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@taskflow.local";

    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { user_id, title, body, url, tag } = await req.json();

    // Fetch user's registered push subscriptions
    let query = supabase.from("push_subscriptions").select("*");
    if (user_id) {
      query = query.eq("user_id", user_id);
    }
    const { data: subscriptions, error } = await query;
    if (error) throw error;

    const payload = JSON.stringify({
      title: title || "TaskFlow Reminder",
      body: body || "You have an upcoming milestone.",
      url: url || "/",
      tag: tag || "taskflow-push"
    });

    const sendResults = await Promise.allSettled(
      (subscriptions || []).map(async (sub) => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth_key,
          },
        };
        try {
          return await webpush.sendNotification(pushSubscription, payload);
        } catch (err: any) {
          // If subscription has expired or unsubscribed (HTTP 410 or 404), remove from DB
          if (err.statusCode === 410 || err.statusCode === 404) {
            await supabase.from("push_subscriptions").delete().eq("id", sub.id);
          }
          throw err;
        }
      })
    );

    return new Response(JSON.stringify({ success: true, results: sendResults }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
