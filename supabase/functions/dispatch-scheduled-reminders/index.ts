// Server-only scheduled Web Push dispatcher. Callers must present the CRON_SECRET.
// The request body carries no recipient, reminder, or subscription identifiers.
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import webpush from "https://esm.sh/web-push@3.6.7";
import {
  getPushRetryDecision,
  isReminderEligible,
} from "./reminder-logic.mjs";

const MAX_REMINDERS_PER_INVOCATION = 25;
const MAX_PUSH_ATTEMPTS_PER_INVOCATION = 200;
const DEVICE_BATCH_SIZE = 20;
const MAX_REQUEST_BYTES = 1024;

type ReminderCandidate = {
  delivery_id: string;
  user_id: string;
  source_type: "task" | "event" | "round";
  source_id: string;
  scheduled_for: string;
  database_now: string;
  title: string;
  body: string;
  app_path: "/#tasks" | "/#reminders" | "/#jobs";
  completed: boolean | null;
  round_status: string | null;
};

type DeviceClaim = {
  device_delivery_id: string;
  subscription_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  attempt_count: number;
};

function jsonResponse(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getServiceRoleKey(): string | null {
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() || null;
}

function constantTimeEquals(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const maxLength = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < maxLength; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function getPushStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const record = error as Record<string, unknown>;
  const status = record.statusCode ?? record.status;
  return typeof status === "number" ? status : null;
}

function getDatabaseErrorCode(error: unknown): string {
  if (typeof error !== "object" || error === null) return "database_operation_failed";
  const code = (error as Record<string, unknown>).code;
  return typeof code === "string" && /^[a-z0-9_]{1,48}$/i.test(code)
    ? `database_${code.toLowerCase()}`
    : "database_operation_failed";
}

function getRetryOutcome(attemptCount: number, status: number | null): {
  outcome: "retry" | "failed";
  retryAfterSeconds: number;
} {
  const decision = getPushRetryDecision(attemptCount, status);
  return {
    outcome: decision.retry ? "retry" : "failed",
    retryAfterSeconds: decision.retryAfterSeconds ?? 60,
  };
}

async function finishDevice(
  supabase: ReturnType<typeof createClient>,
  reminder: ReminderCandidate,
  device: DeviceClaim,
  outcome: "delivered" | "retry" | "failed" | "expired",
  errorCode: string | null,
  retryAfterSeconds = 60,
): Promise<void> {
  const { data, error } = await supabase.rpc("complete_scheduled_reminder_device", {
    p_delivery_id: reminder.delivery_id,
    p_device_delivery_id: device.device_delivery_id,
    p_outcome: outcome,
    p_error_code: errorCode,
    p_retry_after_seconds: retryAfterSeconds,
  });
  if (error) throw error;
  if (data !== true) throw new Error("Device delivery claim was no longer active.");
}

async function deliverToDevice(
  supabase: ReturnType<typeof createClient>,
  reminder: ReminderCandidate,
  device: DeviceClaim,
  payload: string,
): Promise<"sent" | "failed" | "expired"> {
  let pushError: unknown = null;
  try {
    await webpush.sendNotification({
      endpoint: device.endpoint,
      keys: { p256dh: device.p256dh, auth: device.auth_key },
    }, payload);
  } catch (error) {
    pushError = error;
  }

  if (pushError === null) {
    await finishDevice(supabase, reminder, device, "delivered", null);
    return "sent";
  }

  const status = getPushStatus(pushError);
  if (status === 404 || status === 410) {
    const { error: cleanupError } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("id", device.subscription_id)
      .eq("user_id", reminder.user_id);
    if (cleanupError) {
      const retry = getRetryOutcome(device.attempt_count, null);
      await finishDevice(
        supabase,
        reminder,
        device,
        retry.outcome,
        getDatabaseErrorCode(cleanupError),
        retry.retryAfterSeconds,
      );
      console.warn("Expired push cleanup failed", { sourceType: reminder.source_type });
      return "failed";
    }
    await finishDevice(supabase, reminder, device, "expired", "subscription_expired");
    return "expired";
  }

  const retry = getRetryOutcome(device.attempt_count, status);
  const errorCode = status === null ? "push_network_error" : `push_http_${status}`;
  await finishDevice(
    supabase,
    reminder,
    device,
    retry.outcome,
    errorCode,
    retry.retryAfterSeconds,
  );
  console.warn("Scheduled push delivery failed", {
    sourceType: reminder.source_type,
    status,
    retry: retry.outcome === "retry",
  });
  return "failed";
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const expectedSecret = Deno.env.get("CRON_SECRET")?.trim() ?? "";
  const providedSecret = req.headers.get("x-cron-secret") ?? "";
  if (!expectedSecret || !providedSecret || !constantTimeEquals(expectedSecret, providedSecret)) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }
  if (!(req.headers.get("Content-Type") ?? "").toLowerCase().startsWith("application/json")) {
    return jsonResponse({ error: "Content-Type must be application/json." }, 415);
  }
  if (Number(req.headers.get("Content-Length") ?? 0) > MAX_REQUEST_BYTES) {
    return jsonResponse({ error: "Request is too large." }, 413);
  }

  let payload: unknown;
  try {
    const rawBody = await req.text();
    if (rawBody.length > MAX_REQUEST_BYTES) return jsonResponse({ error: "Request is too large." }, 413);
    payload = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "Expected an empty JSON object." }, 400);
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload) || Object.keys(payload).length !== 0) {
    return jsonResponse({ error: "Request body must be an empty JSON object." }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceRoleKey = getServiceRoleKey();
  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY")?.trim();
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY")?.trim();
  const vapidSubject = Deno.env.get("VAPID_SUBJECT")?.trim();
  if (!supabaseUrl || !serviceRoleKey || !vapidPublic || !vapidPrivate || !vapidSubject) {
    console.error("Scheduled push configuration is incomplete.");
    return jsonResponse({ error: "Scheduled push is not configured." }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const summary = { claimed: 0, sent: 0, failed: 0, expiredCleaned: 0 };
  try {
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
    for (let reminderIndex = 0;
      reminderIndex < MAX_REMINDERS_PER_INVOCATION && summary.sent + summary.failed < MAX_PUSH_ATTEMPTS_PER_INVOCATION;
      reminderIndex += 1) {
      const { data: claimedRows, error: claimError } = await supabase.rpc("claim_due_scheduled_reminders", {
        p_limit: 1,
      });
      if (claimError) throw claimError;
      const reminder = (claimedRows as ReminderCandidate[] | null)?.[0];
      if (!reminder) break;
      summary.claimed += 1;

      if (!isReminderEligible(reminder.source_type, {
        scheduled_for: reminder.scheduled_for,
        completed: reminder.completed,
        status: reminder.round_status,
      }, reminder.database_now)) {
        const { error } = await supabase.rpc("finish_scheduled_reminder", {
          p_delivery_id: reminder.delivery_id,
          p_force_failed: true,
          p_error_code: "eligibility_check_failed",
        });
        if (error) throw error;
        console.error("A database-selected reminder failed the eligibility guard.", {
          sourceType: reminder.source_type,
        });
        continue;
      }

      const scheduledTag = new Date(reminder.scheduled_for).toISOString().replace(/[^0-9TZ]/g, "");
      const pushPayload = JSON.stringify({
        title: reminder.title,
        body: reminder.body,
        url: reminder.app_path,
        tag: `taskflow-${reminder.source_type}-${reminder.source_id}-${scheduledTag}`,
      });

      let deviceAttempts = 0;
      try {
        while (summary.sent + summary.failed < MAX_PUSH_ATTEMPTS_PER_INVOCATION) {
          const batchSize = Math.min(DEVICE_BATCH_SIZE, MAX_PUSH_ATTEMPTS_PER_INVOCATION - summary.sent - summary.failed);
          const { data: deviceRows, error: deviceClaimError } = await supabase.rpc("claim_scheduled_reminder_devices", {
            p_delivery_id: reminder.delivery_id,
            p_limit: batchSize,
          });
          if (deviceClaimError) throw deviceClaimError;
          const devices = (deviceRows as DeviceClaim[] | null) ?? [];
          if (devices.length === 0) break;

          deviceAttempts += devices.length;
          const outcomes = await Promise.allSettled(devices.map((device) =>
            deliverToDevice(supabase, reminder, device, pushPayload)
          ));
          let batchFailure: unknown = null;
          for (const outcome of outcomes) {
            if (outcome.status === "rejected") {
              batchFailure ??= outcome.reason;
              summary.failed += 1;
            } else if (outcome.value === "sent") {
              summary.sent += 1;
            } else {
              summary.failed += 1;
              if (outcome.value === "expired") summary.expiredCleaned += 1;
            }
          }
          if (batchFailure) throw batchFailure;
          if (devices.length < batchSize) break;
        }

        const { error: finishError } = await supabase.rpc("finish_scheduled_reminder", {
          p_delivery_id: reminder.delivery_id,
        });
        if (finishError) throw finishError;
      } catch (error) {
        console.error("Scheduled reminder processing failed.", {
          sourceType: reminder.source_type,
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
        const { error: releaseError } = await supabase.rpc("finish_scheduled_reminder", {
          p_delivery_id: reminder.delivery_id,
          p_release_inflight: true,
          p_error_code: "worker_interrupted",
        });
        if (releaseError) throw releaseError;
        if (deviceAttempts === 0) summary.failed += 1;
      }
    }
    return jsonResponse({ ok: true, ...summary });
  } catch (error) {
    console.error("Scheduled reminder dispatch failed.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return jsonResponse({ error: "Scheduled reminder dispatch failed." }, 500);
  }
});
