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
  isPushSupported
} from "../../lib/notifications";

interface NotificationSettingsBannerProps {
  user: any;
  onNotify: (msg: string) => void;
  onPersistSubscription: (subData: any, mode: "upsert" | "delete") => Promise<void>;
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

  useEffect(() => {
    if (isNotificationSupported()) {
      setPermission(getNotificationPermission());
      setIsEnabled(isUserNotificationsEnabled());
    }
    if (isPushSupported()) {
      getExistingPushSubscription().then((sub) => setHasPushSub(Boolean(sub)));
    }
  }, []);

  const handleToggleEnable = async () => {
    if (permission !== "granted") {
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
        onNotify("Notifications blocked in browser settings. Please allow notifications in site settings.");
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
    if (!isPushSupported()) {
      onNotify("PushManager is not supported by your browser.");
      return;
    }

    if (permission !== "granted") {
      const p = await requestNotificationPermission();
      setPermission(p);
      if (p !== "granted") {
        onNotify("Permission required to register push subscriptions.");
        return;
      }
    }

    setIsSubscribing(true);
    try {
      if (hasPushSub) {
        // Unsubscribe
        const unsubOk = await unsubscribeFromPush();
        if (unsubOk) {
          setHasPushSub(false);
          if (user) {
            await onPersistSubscription({ endpoint: "current" }, "delete");
          }
          onNotify("Device unsubscribed from background push.");
        }
      } else {
        // Subscribe
        const subData = await subscribeToPush();
        if (subData) {
          setHasPushSub(true);
          if (user) {
            await onPersistSubscription(subData, "upsert");
            onNotify("Device registered in Supabase for cloud push delivery!");
          } else {
            onNotify("Push subscription active on this device.");
          }
        } else {
          onNotify("Failed to subscribe device to push service.");
        }
      }
    } finally {
      setIsSubscribing(false);
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
              <Send size={13} /> Test Notification
            </button>
          )}
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
            <b>Notice:</b> On-screen alerts work while TaskFlow is open in a tab. Push notifications when the browser is completely closed require deploying the Supabase <code>send-push</code> Edge Function with configured VAPID credentials.
          </small>
        </div>
      </div>
    </div>
  );
}
