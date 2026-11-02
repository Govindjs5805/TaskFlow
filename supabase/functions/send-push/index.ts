// Sends one authenticated Web Push message to the caller's registered devices.
// Automatic reminder scheduling is not configured by this function.
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type PushRequest = {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
};

function jsonResponse(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getPublishableKey(): string | null {
  const legacyKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
  if (legacyKey) return legacyKey;

  // Supabase also injects the modern publishable-key map into Edge Functions.
  const keysJson = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (!keysJson) return null;
  try {
    const keys = JSON.parse(keysJson) as Record<string, unknown>;
    const defaultKey = keys.default;
    return typeof defaultKey === "string" && defaultKey.trim() ? defaultKey.trim() : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalText(
  payload: Record<string, unknown>,
  key: keyof PushRequest,
  maxLength: number,
): string | undefined | null {
  const value = payload[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
}

function isSafeAppPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return false;
  try {
    return new URL(path, "https://taskflow.invalid").origin === "https://taskflow.invalid";
  } catch {
    return false;
  }
}

function getPushStatus(error: unknown): number | null {
  if (!isRecord(error)) return null;
  const status = error.statusCode ?? error.status;
  return typeof status === "number" ? status : null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const tokenMatch = authHeader.match(/^Bearer\s+([^\s]+)$/i);
  if (!tokenMatch) {
    return jsonResponse({ error: "Authentication is required." }, 401);
  }

  const contentType = req.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return jsonResponse({ error: "Content-Type must be application/json." }, 415);
  }
  const contentLength = Number(req.headers.get("Content-Length") ?? 0);
  if (contentLength > 8192) {
    return jsonResponse({ error: "Request payload is too large." }, 413);
  }

  let requestPayload: unknown;
  try {
    const rawBody = await req.text();
    if (rawBody.length > 8192) return jsonResponse({ error: "Request payload is too large." }, 413);
    requestPayload = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON." }, 400);
  }

  if (!isRecord(requestPayload)) {
    return jsonResponse({ error: "Request body must be a JSON object." }, 400);
  }

  const allowedFields = new Set(["title", "body", "url", "tag"]);
  if (Object.keys(requestPayload).some((key) => !allowedFields.has(key))) {
    return jsonResponse({ error: "Request contains unsupported fields." }, 400);
  }

  const title = readOptionalText(requestPayload, "title", 80);
  const body = readOptionalText(requestPayload, "body", 240);
  const url = readOptionalText(requestPayload, "url", 512);
  const tag = readOptionalText(requestPayload, "tag", 128);
  if (title === null || body === null || url === null || tag === null) {
    return jsonResponse({ error: "One or more notification fields are invalid." }, 400);
  }
  if (url && !isSafeAppPath(url)) {
    return jsonResponse({ error: "Notification URL must be a same-origin app path." }, 400);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
    const publishableKey = getPublishableKey();
    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY")?.trim();
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY")?.trim();
    const vapidSubject = Deno.env.get("VAPID_SUBJECT")?.trim();
    if (!supabaseUrl || !publishableKey || !vapidPublic || !vapidPrivate || !vapidSubject) {
      return jsonResponse({ error: "Push delivery is not configured on the server." }, 500);
    }

    const accessToken = tokenMatch[1];
    const supabase = createClient(supabaseUrl, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });

    // Verify the access token with Supabase Auth; never derive identity from request data.
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) {
      return jsonResponse({ error: "The access token is invalid or expired." }, 401);
    }

    // The user JWT and RLS scope this query; the explicit filter keeps the intended owner clear.
    const { data: subscriptions, error: subscriptionError } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth_key")
      .eq("user_id", user.id);
    if (subscriptionError) {
      return jsonResponse({ error: "Could not load registered push devices." }, 500);
    }
    if (!subscriptions?.length) {
      return jsonResponse({ success: true, sent: 0, failed: 0, message: "No registered push devices." });
    }

    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
    const pushPayload = JSON.stringify({
      title: title ?? "TaskFlow Reminder",
      body: body ?? "You have an upcoming milestone.",
      url: url ?? "/",
      tag: tag ?? "taskflow-push",
    });

    let sent = 0;
    let failed = 0;
    let expiredCleaned = 0;
    await Promise.all(subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth_key },
        }, pushPayload);
        sent += 1;
      } catch (error) {
        failed += 1;
        const status = getPushStatus(error);
        if (status === 404 || status === 410) {
          const { error: cleanupError } = await supabase
            .from("push_subscriptions")
            .delete()
            .eq("id", subscription.id)
            .eq("user_id", user.id);
          if (!cleanupError) expiredCleaned += 1;
        }
      }
    }));

    return jsonResponse({ success: sent > 0 && failed === 0, sent, failed, expiredCleaned });
  } catch (error) {
    // Avoid returning provider details, endpoints, tokens, or VAPID configuration to callers.
    console.error("send-push request failed:", error instanceof Error ? error.name : "UnknownError");
    return jsonResponse({ error: "Push delivery failed." }, 500);
  }
});
