export const REMINDER_WINDOWS = Object.freeze({
  task: Object.freeze({ beforeMinutes: 10, afterMinutes: 5 }),
  event: Object.freeze({ beforeMinutes: 15, afterMinutes: 5 }),
  round: Object.freeze({ beforeMinutes: 30, afterMinutes: 5 })
});

export const MAX_DEVICE_ATTEMPTS = 8;

const TERMINAL_ROUND_STATUSES = new Set(["Cleared", "Rejected", "Waived"]);

export function getReminderTarget(sourceType, record) {
  if (sourceType === "task") return record.reminder_at || record.due_at || null;
  if (sourceType === "event") return record.reminder_at || record.starts_at || null;
  if (sourceType === "round") return record.scheduled_at || null;
  return null;
}

export function isReminderEligible(sourceType, record, now) {
  if (sourceType === "task" && record.completed === true) return false;
  if (sourceType === "round" && TERMINAL_ROUND_STATUSES.has(record.status)) return false;

  const window = REMINDER_WINDOWS[sourceType];
  const targetValue = record.scheduled_for || getReminderTarget(sourceType, record);
  const targetTime = Date.parse(targetValue ?? "");
  const nowTime = Date.parse(now instanceof Date ? now.toISOString() : String(now ?? ""));
  if (!window || !Number.isFinite(targetTime) || !Number.isFinite(nowTime)) return false;

  const earliest = nowTime - window.afterMinutes * 60_000;
  const latest = nowTime + window.beforeMinutes * 60_000;
  return targetTime >= earliest && targetTime <= latest;
}

export function selectDueReminders({ tasks = [], events = [], rounds = [], now }) {
  const due = [];
  for (const task of tasks) {
    if (isReminderEligible("task", task, now)) due.push({ source_type: "task", record: task });
  }
  for (const event of events) {
    if (isReminderEligible("event", event, now)) due.push({ source_type: "event", record: event });
  }
  for (const round of rounds) {
    if (isReminderEligible("round", round, now)) due.push({ source_type: "round", record: round });
  }
  return due;
}

export function getRetryDelaySeconds(attemptCount) {
  if (!Number.isInteger(attemptCount) || attemptCount < 1 || attemptCount >= MAX_DEVICE_ATTEMPTS) {
    return null;
  }
  return Math.min(60 * (2 ** (attemptCount - 1)), 900);
}

export function getPushRetryDecision(attemptCount, status) {
  const retryableStatus = status === null || status === 408 || status === 425 || status === 429 || status >= 500;
  const retryAfterSeconds = getRetryDelaySeconds(attemptCount);
  const retry = retryableStatus && retryAfterSeconds !== null;
  return { retry, retryAfterSeconds: retry ? retryAfterSeconds : null };
}
