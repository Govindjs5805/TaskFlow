// TaskFlow Browser & Push Notification Service (Phase 3)
import type { Task, EventItem, ApplicationRound, Application } from "../types";
import { format, parseISO, isPast, differenceInMinutes } from "date-fns";

const STORAGE_NOTIFIED_KEY = "taskflow_notified_reminders";
const STORAGE_ENABLED_KEY = "taskflow_notifications_enabled";

// Demo VAPID public key fallback (Base64URL encoded P-256 uncompressed point)
const DEFAULT_VAPID_PUBLIC_KEY =
  "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBKr3qBUYIHBQFLXYp5Nksh8U";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/** Check whether notifications are supported by the browser */
export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Check whether service worker and push are supported */
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

/** Get current browser permission: 'default' | 'granted' | 'denied' */
export function getNotificationPermission(): NotificationPermission {
  if (!isNotificationSupported()) return "denied";
  return Notification.permission;
}

/** Check if user enabled notifications in TaskFlow settings */
export function isUserNotificationsEnabled(): boolean {
  const pref = localStorage.getItem(STORAGE_ENABLED_KEY);
  if (pref === null) {
    // Default to true if permission is already granted
    return getNotificationPermission() === "granted";
  }
  return pref === "true";
}

/** Set user preference for notifications */
export function setUserNotificationsEnabled(enabled: boolean): void {
  localStorage.setItem(STORAGE_ENABLED_KEY, enabled ? "true" : "false");
}

/** Register service worker in /sw.js */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    return reg;
  } catch (err) {
    console.warn("Service worker registration failed:", err);
    return null;
  }
}

/** Request notification permission from user */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return "denied";

  const permission = await Notification.requestPermission();
  if (permission === "granted") {
    setUserNotificationsEnabled(true);
    await registerServiceWorker();
  } else if (permission === "denied") {
    setUserNotificationsEnabled(false);
  }
  return permission;
}

/** Dispatch a local browser notification using ServiceWorker or fallback */
export async function showLocalNotification(
  title: string,
  options: {
    body?: string;
    icon?: string;
    tag?: string;
    url?: string;
  } = {}
): Promise<boolean> {
  if (!isNotificationSupported() || getNotificationPermission() !== "granted") {
    return false;
  }

  if (!isUserNotificationsEnabled()) {
    return false;
  }

  const notificationOptions: NotificationOptions = {
    body: options.body || "TaskFlow reminder",
    icon: options.icon || "/favicon.ico",
    tag: options.tag || "taskflow-reminder",
    data: { url: options.url || "/" }
  };

  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && reg.showNotification) {
        await reg.showNotification(title, notificationOptions);
        return true;
      }
    }
  } catch {
    // Fall back to Notification constructor
  }

  try {
    new Notification(title, notificationOptions);
    return true;
  } catch (err) {
    console.warn("Notification constructor error:", err);
    return false;
  }
}

/** Subscribe browser to PushManager */
export async function subscribeToPush(
  customVapidKey?: string
): Promise<{
  endpoint: string;
  p256dh: string;
  auth_key: string;
  user_agent: string;
} | null> {
  if (!isPushSupported()) return null;

  try {
    let reg: ServiceWorkerRegistration | null | undefined = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      reg = await registerServiceWorker();
    }
    if (!reg) return null;

    const vapidKey =
      customVapidKey ||
      import.meta.env.VITE_VAPID_PUBLIC_KEY ||
      DEFAULT_VAPID_PUBLIC_KEY;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource
      });
    }

    const subJson = sub.toJSON();
    const endpoint = sub.endpoint;
    const p256dh = subJson.keys?.p256dh || "";
    const auth_key = subJson.keys?.auth || "";

    return {
      endpoint,
      p256dh,
      auth_key,
      user_agent: navigator.userAgent
    };
  } catch (err) {
    console.warn("Push subscription failed:", err);
    return null;
  }
}

/** Check existing push subscription */
export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return null;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/** Unsubscribe browser from PushManager */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      return await sub.unsubscribe();
    }
    return true;
  } catch {
    return false;
  }
}

/** Check upcoming items and dispatch notification if within reminder window */
export function checkAndDispatchScheduledReminders({
  tasks,
  events,
  rounds,
  apps
}: {
  tasks: Task[];
  events: EventItem[];
  rounds: ApplicationRound[];
  apps: Application[];
}): number {
  if (!isNotificationSupported() || getNotificationPermission() !== "granted" || !isUserNotificationsEnabled()) {
    return 0;
  }

  // Read already notified keys with timestamps
  let notifiedMap: Record<string, string> = {};
  try {
    const raw = localStorage.getItem(STORAGE_NOTIFIED_KEY);
    if (raw) notifiedMap = JSON.parse(raw);
  } catch {
    notifiedMap = {};
  }

  const now = new Date();
  let dispatchedCount = 0;

  // 1. Task Reminders
  for (const t of tasks) {
    if (t.completed) continue;
    const timeStr = t.reminder_at || t.due_at;
    if (!timeStr) continue;

    const targetDate = parseISO(timeStr);
    const diffMins = differenceInMinutes(targetDate, now);

    // Fire if due within 10 minutes from now, or up to 5 minutes overdue
    if (diffMins <= 10 && diffMins >= -5) {
      const uniqueKey = `task-${t.id}-${timeStr.slice(0, 16)}`;
      if (!notifiedMap[uniqueKey]) {
        notifiedMap[uniqueKey] = now.toISOString();
        dispatchedCount++;
        showLocalNotification(`Task Reminder: ${t.title}`, {
          body: `${t.priority} priority · Category: ${t.category}${t.description ? `\n${t.description}` : ""}`,
          tag: uniqueKey,
          url: "/#tasks"
        });
      }
    }
  }

  // 2. Event Reminders
  for (const e of events) {
    const timeStr = e.reminder_at || e.starts_at;
    if (!timeStr) continue;

    const targetDate = parseISO(timeStr);
    const diffMins = differenceInMinutes(targetDate, now);

    if (diffMins <= 15 && diffMins >= -5) {
      const uniqueKey = `event-${e.id}-${timeStr.slice(0, 16)}`;
      if (!notifiedMap[uniqueKey]) {
        notifiedMap[uniqueKey] = now.toISOString();
        dispatchedCount++;
        showLocalNotification(`Event Reminder: ${e.title}`, {
          body: `${e.event_type} at ${format(targetDate, "h:mm a")}${e.notes ? `\n${e.notes}` : ""}`,
          tag: uniqueKey,
          url: "/#reminders"
        });
      }
    }
  }

  // 3. Interview & Assessment Rounds
  for (const r of rounds) {
    if (r.status === "Cleared" || r.status === "Rejected" || r.status === "Waived") continue;
    if (!r.scheduled_at) continue;

    const targetDate = parseISO(r.scheduled_at);
    const diffMins = differenceInMinutes(targetDate, now);

    // Give a 30-minute advance alert for assessment & interviews!
    if (diffMins <= 30 && diffMins >= -5) {
      const uniqueKey = `round-${r.id}-${r.scheduled_at.slice(0, 16)}`;
      if (!notifiedMap[uniqueKey]) {
        const parentApp = apps.find((a) => a.id === r.application_id);
        notifiedMap[uniqueKey] = now.toISOString();
        dispatchedCount++;
        showLocalNotification(
          `${parentApp ? `${parentApp.company}: ` : ""}${r.round_name || r.round_type}`,
          {
            body: `Scheduled at ${format(targetDate, "h:mm a")} (${r.platform || "Online"})${
              r.meeting_link ? ` · Link: ${r.meeting_link}` : ""
            }`,
            tag: uniqueKey,
            url: "/#jobs"
          }
        );
      }
    }
  }

  // Save updated notified map (pruning entries older than 3 days)
  const pruned: Record<string, string> = {};
  const threeDaysAgo = Date.now() - 3 * 86400000;
  for (const [k, v] of Object.entries(notifiedMap)) {
    if (new Date(v).getTime() > threeDaysAgo) {
      pruned[k] = v;
    }
  }

  try {
    localStorage.setItem(STORAGE_NOTIFIED_KEY, JSON.stringify(pruned));
  } catch {
    // Ignore storage quota errors
  }

  return dispatchedCount;
}
