import { useState, useEffect } from "react";
import {
  Bell, BellOff, BellRing, CheckCircle2, XCircle, AlertCircle,
  Smartphone, ShieldCheck, RefreshCw, Send
} from "lucide-react";
import {
  getNotificationPermission,
  requestNotificationPermission,
  isUserNotificationsEnabled,
  setUserNotificationsEnabled,
  showLocalNotification,
  subscribeToPush,
  unsubscribeFromPush,
  getExistingPushSubscription,
  isNotificationSupported,
  isPushSupported,
  isVapidPublicKeyConfigured
} from "../../lib/notifications";
import type { PushSubscriptionData } from "../../lib/notifications";
import { supabase } from "../../lib/supabase";

interface NotificationSettingsBannerProps {
  user: { id: string } | null;
  onNotify: (msg: string) => void;
  onPersistSubscription: (subData: PushSubscriptionData, mode: "upsert" | "delete") => Promise<void>;
}

export function NotificationSettingsBanner({
  user,
  onNotify,
  onPersistSubscription
}: NotificationSettingsBannerProps) {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isEnabled, setIsEnabled] = useState(false);
  const [hasPushSub, setHasPushSub] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isSendingPushTest, setIsSendingPushTest] = useState(false);

  useEffect(() => {
    if (isNotificationSupported()) {
      setPermission(getNotificationPermission());
      setIsEnabled(isUserNotificationsEnabled());
    }
    let cancelled = false;
    const syncPushSubscription = async () => {
      setHasPushSub(false);
      if (!isPushSupported() || !user || !supabase) return;
      const subscription = await getExistingPushSubscription();
      if (!subscription || cancelled) return;

      // A browser subscription is only considered registered after this user has
      // persisted its endpoint under the current RLS-protected account.
      const { data, error } = await supabase
        .from("push_subscriptions")
        .select("endpoint")
        .eq("user_id", user.id)
        .eq("endpoint", subscription.endpoint)
        .maybeSingle();
      if (!cancelled) setHasPushSub(!error && Boolean(data));
    };
    void syncPushSubscription();
    return () => { cancelled = true; };
  }, [user?.id]);

  const handleToggleEnable = async () => {
    if (permission !== "granted") {
      try {
        const newPerm = await requestNotificationPermission();
        setPermission(newPerm);
        if (newPerm === "granted") {
          setIsEnabled(true);
          setUserNotificationsEnabled(true);
          onNotify("Browser notifications enabled!");
          await showLocalNotification("Notifications Active", {
            body: "TaskFlow will alert you when tasks, interviews, and deadlines approach.",
            tag: "welcome-alert",
            url: "/#reminders"
          });
        } else if (newPerm === "denied") {
          onNotify(isNotificationSupported()
            ? "Notifications blocked in browser settings. Please allow notifications in site settings."
            : "This browser does not support notifications.");
        }
      } catch (error) {
        onNotify(error instanceof Error ? error.message : "Could not request notification permission.");
      }
    } else {
      const nextState = !isEnabled;
      setIsEnabled(nextState);
      setUserNotificationsEnabled(nextState);
      onNotify(nextState ? "Reminders active" : "Reminders muted");
    }
  };

  const handleTestNotification = async () => {
    const success = await showLocalNotification("TaskFlow Test Alert ✦", {
      body: "Foreground notifications are working! Reminders will pop up on your screen.",
      tag: "test-notification",
      url: "/#reminders"
    });
    if (success) {
      onNotify("Test notification dispatched to your screen!");
    } else {
      onNotify("Could not display notification. Check browser permission.");
    }
  };

  const handleSubscribePush = async () => {
    if (!user || !supabase) {
      onNotify("Sign in to register this device for background push notifications.");
      return;
    }
    if (!isPushSupported()) {
      onNotify("PushManager is not supported by your browser.");
      return;
    }

    if (!hasPushSub && !isVapidPublicKeyConfigured()) {
      onNotify("Background push requires a configured VAPID public key.");
      return;
    }

    setIsSubscribing(true);
    try {
      if (permission !== "granted") {
        const p = await requestNotificationPermission();
        setPermission(p);
        if (p !== "granted") {
          onNotify("Permission required to register push subscriptions.");
          return;
        }
      }

      if (hasPushSub) {
        // Unsubscribe
        const currentSubscription = await getExistingPushSubscription();
        const unsubOk = await unsubscribeFromPush();
        if (unsubOk) {
          setHasPushSub(false);
          if (currentSubscription?.endpoint) {
            await onPersistSubscription({ endpoint: currentSubscription.endpoint }, "delete");
          }
          onNotify("Device unsubscribed from background push.");
        }
      } else {
        // Subscribe
        const subData = await subscribeToPush();
        if (subData) {
          await onPersistSubscription(subData, "upsert");
          setHasPushSub(true);
          onNotify("Device registered for authenticated push delivery.");
        } else {
          onNotify("Failed to subscribe device to push service.");
        }
      }
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Could not update this device's push subscription.");
    } finally {
      setIsSubscribing(false);
    }
  };

  const handleSendPushTest = async () => {
    if (!user || !supabase) {
      onNotify("Sign in to send a push test.");
      return;
    }
    if (!hasPushSub) {
      onNotify("Register this device for push before sending a test.");
      return;
    }

    setIsSendingPushTest(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session?.access_token || session.user.id !== user.id) {
        throw new Error("Your signed-in session changed. Sign in again before sending a push test.");
      }

      const { data, error } = await supabase.functions.invoke("send-push", {
        body: {
          title: "TaskFlow push test",
          body: "This is a real Web Push notification from TaskFlow.",
          url: "/",
          tag: `taskflow-push-test-${Date.now()}`
        },
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      if (error) throw error;
      if (data?.sent > 0 && data?.failed === 0) {
        onNotify(`Push test sent to ${data.sent} registered device${data.sent === 1 ? "" : "s"}.`);
      } else if (data?.sent > 0) {
        onNotify(`Push test sent to ${data.sent} device(s); ${data.failed} could not be reached.`);
      } else if (data?.failed > 0) {
        onNotify("Push delivery failed. Check the device subscription and Edge Function configuration.");
      } else {
        onNotify("No registered push devices were found for this account.");
      }
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Could not send a push test.");
    } finally {
      setIsSendingPushTest(false);
    }
  };

  const getPermissionPill = () => {
    if (permission === "granted") {
      return (
        <span className="notif-status-pill granted">
          <CheckCircle2 size={12} /> Granted
        </span>
      );
    }
    if (permission === "denied") {
      return (
        <span className="notif-status-pill denied">
          <XCircle size={12} /> Blocked
        </span>
      );
    }
    return (
      <span className="notif-status-pill default">
        <AlertCircle size={12} /> Needs Permission
      </span>
    );
  };

  return (
    <div className="notif-settings-card">
      <div className="notif-settings-top">
        <div className="notif-icon-wrap">
          {permission === "granted" && isEnabled ? (
            <BellRing size={20} className="bell-active" />
          ) : (
            <BellOff size={20} />
          )}
        </div>

        <div className="notif-settings-info">
          <div className="notif-title-row">
            <h4>Browser & Push Notifications</h4>
            {getPermissionPill()}
            {permission === "granted" && (
              <span className={`notif-toggle-pill ${isEnabled ? "on" : "off"}`}>
                {isEnabled ? "Alerts On" : "Muted"}
              </span>
            )}
          </div>
          <p className="notif-desc">
            Receive on-screen alerts for upcoming tasks, Online Assessments, interviews, and deadlines.
          </p>
        </div>

        <div className="notif-actions">
          <button
            type="button"
            className={permission === "granted" && isEnabled ? "outline-btn small" : "primary-btn small"}
            onClick={handleToggleEnable}
          >
            {permission !== "granted" ? (
              <>
                <Bell size={14} /> Enable Notifications
              </>
            ) : isEnabled ? (
              <>
                <BellOff size={14} /> Mute Alerts
              </>
            ) : (
              <>
                <Bell size={14} /> Unmute Alerts
              </>
            )}
          </button>

          {permission === "granted" && (
            <button
              type="button"
              className="soft-btn small"
              onClick={handleTestNotification}
              title="Trigger a test reminder"
            >
              <Send size={13} /> Test On-Screen Alert
            </button>
          )}
          <button
            type="button"
            className="outline-btn small"
            onClick={handleSendPushTest}
            disabled={isSendingPushTest || !user || !hasPushSub || permission !== "granted"}
            title="Send a real push through the authenticated Supabase Edge Function"
          >
            {isSendingPushTest ? <RefreshCw size={13} className="spin" /> : <Send size={13} />}
            {isSendingPushTest ? "Sending Push…" : "Send Push Test"}
          </button>
        </div>
      </div>

      {/* Cloud Push & Delivery Status Notice */}
      <div className="notif-delivery-status">
        <div className="status-item">
          <ShieldCheck size={14} className="icon-green" />
          <span>
            <b>Foreground Reminders:</b> Active. Checks scheduled items every 30s while TaskFlow is open.
          </span>
        </div>

        <div className="status-item">
          <Smartphone size={14} className={hasPushSub ? "icon-green" : "icon-muted"} />
          <span>
            <b>Background Push Subscription:</b>{" "}
            {hasPushSub ? "Registered on this device" : "Not yet registered for closed-browser push"}.
          </span>
          <button
            type="button"
            className="text-btn small-text-btn"
            onClick={handleSubscribePush}
            disabled={isSubscribing}
          >
            {isSubscribing ? (
              <RefreshCw size={12} className="spin" />
            ) : hasPushSub ? (
              "Unregister"
            ) : (
              "Register Push Device"
            )}
          </button>
        </div>

        <div className="notif-transparency-note">
          <small>
            <b>Notice:</b> On-screen reminders run while TaskFlow is open in a tab. Use Send Push Test to verify delivery through the authenticated Supabase <code>send-push</code> Edge Function. Automatic scheduled background reminders are not configured.
          </small>
        </div>
      </div>
    </div>
  );
}
