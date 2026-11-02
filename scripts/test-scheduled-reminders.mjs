import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getReminderTarget,
  getPushRetryDecision,
  getRetryDelaySeconds,
  MAX_DEVICE_ATTEMPTS,
  selectDueReminders,
} from "../supabase/functions/dispatch-scheduled-reminders/reminder-logic.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20261102000000_scheduled_web_push_reminders.sql");
const dispatcher = read("../supabase/functions/dispatch-scheduled-reminders/index.ts");
const config = read("../supabase/config.toml");
const now = "2026-11-02T12:00:00.000Z";

assert.equal(getReminderTarget("task", { reminder_at: "a", due_at: "b" }), "a", "task reminder_at must take precedence over due_at");
assert.equal(getReminderTarget("event", { reminder_at: null, starts_at: "b" }), "b", "events must fall back to starts_at");

const selected = selectDueReminders({
  now,
  tasks: [
    { id: "task-before", reminder_at: "2026-11-02T12:10:00Z", due_at: null, completed: false },
    { id: "task-after", reminder_at: null, due_at: "2026-11-02T11:55:00Z", completed: false },
    { id: "task-completed", reminder_at: now, completed: true },
    { id: "task-outside", reminder_at: "2026-11-02T12:10:00.001Z", completed: false },
    { id: "task-override", reminder_at: "2026-11-02T12:30:00Z", due_at: now, completed: false },
  ],
  events: [
    { id: "event-before", reminder_at: "2026-11-02T12:15:00Z", starts_at: now },
    { id: "event-fallback", reminder_at: null, starts_at: "2026-11-02T11:55:00Z" },
    { id: "event-outside", reminder_at: "2026-11-02T12:15:00.001Z", starts_at: now },
  ],
  rounds: [
    { id: "round-before", scheduled_at: "2026-11-02T12:30:00Z", status: "Scheduled" },
    { id: "round-cleared", scheduled_at: now, status: "Cleared" },
    { id: "round-rejected", scheduled_at: now, status: "Rejected" },
    { id: "round-waived", scheduled_at: now, status: "Waived" },
    { id: "round-in-progress", scheduled_at: "2026-11-02T11:55:00Z", status: "In Progress" },
  ],
});
assert.deepEqual(
  selected.map(({ source_type, record }) => `${source_type}:${record.id}`),
  [
    "task:task-before",
    "task:task-after",
    "event:event-before",
    "event:event-fallback",
    "round:round-before",
    "round:round-in-progress",
  ],
  "window selection must include exact boundaries and exclude completed/terminal/out-of-window rows",
);

for (const count of [1, 2, 3, 5]) {
  assert.equal(getRetryDelaySeconds(count), Math.min(60 * (2 ** (count - 1)), 900));
}
assert.equal(MAX_DEVICE_ATTEMPTS, 8);
assert.equal(getRetryDelaySeconds(8), null, "delivery attempts stop after the configured maximum");
assert.equal(getRetryDelaySeconds(0), null, "invalid attempt counts are not retried");
assert.deepEqual(getPushRetryDecision(1, 503), { retry: true, retryAfterSeconds: 60 }, "transient server failures must be retried");
assert.deepEqual(getPushRetryDecision(2, 429), { retry: true, retryAfterSeconds: 120 }, "rate limits must be retried with backoff");
assert.deepEqual(getPushRetryDecision(1, null), { retry: true, retryAfterSeconds: 60 }, "network failures must be retried");
assert.deepEqual(getPushRetryDecision(1, 400), { retry: false, retryAfterSeconds: null }, "permanent client failures must not be retried");
assert.deepEqual(getPushRetryDecision(8, 503), { retry: false, retryAfterSeconds: null }, "transient failures must stop after the attempt limit");

assert.match(migration, /unique\s*\(user_id, source_type, source_id, scheduled_for\)/i, "reminders need an atomic per-user/source/scheduled-time dedupe key");
assert.match(migration, /on conflict\s*\(user_id, source_type, source_id, scheduled_for\)[\s\S]*?do update/i, "reminder claims must use the unique key atomically");
assert.match(migration, /existing\.status = 'retry_wait'[\s\S]*?retry_after <= clock_timestamp\(\)/, "failed reminders must be claimable after their retry delay");
assert.match(migration, /where \(existing\.status = 'retry_wait'[\s\S]*?or \(existing\.status = 'processing'[\s\S]*?locked_at <= clock_timestamp\(\) - interval '10 minutes'\)/, "atomic reminder claims must skip delivered, failed, and actively locked records");
assert.match(migration, /status in \('processing', 'retry_wait', 'delivered', 'failed'\)/, "delivery states must include retry and terminal outcomes");
assert.match(migration, /status in \('processing', 'retry_wait', 'delivered', 'failed', 'expired'\)/, "device outcomes must be tracked independently");
assert.match(migration, /delivered_at = case when p_outcome = 'delivered' then clock_timestamp\(\)/, "successful delivery must have a timestamp");
assert.match(migration, /create or replace function public\.claim_scheduled_reminder_devices/i, "device-level claims must prevent duplicate sends on already delivered devices");
assert.match(migration, /enable row level security/i, "delivery tracking tables must have RLS enabled");
assert.match(migration, /revoke all on table public\.scheduled_reminder_deliveries from public, anon, authenticated/i, "delivery state must not be exposed to frontend roles");
assert.match(migration, /cron\.schedule\([\s\S]*?'\* \* \* \* \*'/i, "Supabase Cron must invoke the scheduler each minute");
assert.match(migration, /vault\.decrypted_secrets[\s\S]*?taskflow_cron_secret/i, "the cron credential must be read from Vault");
assert.match(migration, /x-cron-secret/i, "Vault CRON_SECRET must be sent only from the server-side cron call");

assert.match(dispatcher, /Deno\.env\.get\("CRON_SECRET"\)/, "dispatcher must require its server-side CRON_SECRET");
assert.match(dispatcher, /constantTimeEquals\(expectedSecret, providedSecret\)/, "cron secret comparison must not be a normal early-exit string comparison");
assert.match(dispatcher, /Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/, "service role access must stay inside the server-side Edge Function");
const requestValidation = dispatcher.slice(dispatcher.indexOf("let payload"), dispatcher.indexOf("const supabaseUrl"));
assert.doesNotMatch(requestValidation, /user_id|subscription_id|endpoint/i, "request body must not select recipients or subscriptions");
assert.match(dispatcher, /\.eq\("user_id", reminder\.user_id\)/, "expired subscription cleanup must stay user-scoped");
assert.match(dispatcher, /status === 404 \|\| status === 410/, "expired push endpoints must be cleaned up");
assert.ok(dispatcher.indexOf("webpush.sendNotification") < dispatcher.indexOf('finishDevice(supabase, reminder, device, "delivered"'), "delivery must be marked successful only after push send succeeds");
assert.match(dispatcher, /\/#tasks|\/#reminders|\/#jobs/, "notifications must deep-link to existing TaskFlow sections");
assert.match(config, /\[functions\.send-push\][\s\S]*?verify_jwt\s*=\s*true/, "manual send-push JWT verification must remain enabled");
assert.match(config, /\[functions\.dispatch-scheduled-reminders\][\s\S]*?verify_jwt\s*=\s*false/, "the new CRON_SECRET-only endpoint must bypass gateway JWT in favor of its own auth check");

console.log("Scheduled reminder tests passed: windows, fallbacks, exclusions, atomic dedupe contract, and failed-delivery retry behavior.");
