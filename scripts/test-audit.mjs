import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const app = read("../src/App.tsx");
const dsa = read("../src/components/dsa/DsaTracker.tsx");
const dsaModal = read("../src/components/dsa/DsaProblemModal.tsx");
const taskBoard = read("../src/components/kanban/TaskKanban.tsx");
const jobBoard = read("../src/components/kanban/JobKanban.tsx");
const rounds = read("../src/components/pipeline/ApplicationRoundsModal.tsx");
const notifications = read("../src/lib/notifications.ts");
const notificationUi = read("../src/components/notifications/NotificationSettingsBanner.tsx");
const pushFunction = read("../supabase/functions/send-push/index.ts");
const supabaseConfig = read("../supabase/config.toml");
const worker = read("../public/sw.js");
const baseSchema = read("../supabase/schema.sql");
const migration = read("../supabase/migrations_v2.sql");
const css = read("../src/styles.css");
const html = read("../index.html");

const assertOwnerPolicy = (sql, table) => {
  const policy = sql.split(";").find((statement) =>
    /create policy/i.test(statement) && statement.includes(`on public.${table}`)
  );
  assert.ok(policy, `${table} must have an explicit owner policy`);
  assert.match(policy, /auth\.uid\(\)\s*=\s*user_id/i, `${table} owner policy must compare auth.uid to user_id`);
};

for (const table of ["tasks", "applications", "events"]) {
  assert.match(baseSchema, new RegExp(`alter table public\\.${table} enable row level security`, "i"), `${table} must enable RLS`);
  assertOwnerPolicy(baseSchema, table);
  assert.match(app, new RegExp(`from\\("${table}"\\)\\.select\\("\\*"\\)\\.eq\\("user_id",user\\.id\\)`), `${table} read must be scoped to the signed-in user`);
}
for (const table of ["application_rounds", "dsa_problems", "push_subscriptions"]) {
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"), `${table} must enable RLS`);
  assertOwnerPolicy(migration, table);
}
assert.match(app, /from\("dsa_problems"\)[\s\S]*?\.eq\("user_id",user\.id\)/, "DSA reads must be scoped to the signed-in user");
assert.match(app, /delete\(\)\.eq\("id",row\.id\)\.eq\("user_id",user\.id\)/, "generic deletes must be owner scoped");
assert.match(app, /delete\(\)\.eq\("user_id", user\.id\)\.eq\("endpoint",subData\.endpoint\)/, "push unsubscribe must delete only the current endpoint");

assert.match(taskBoard, /onDragStart=/, "task board must wire native drag start");
assert.match(taskBoard, /onDrop=/, "task board must wire native drop targets");
assert.match(taskBoard, /onMoveTask\(taskId, targetStatus\)/, "task drop must dispatch status change");
assert.match(taskBoard, /card-quick-move/, "task board must retain its accessible quick-move fallback");
assert.match(app, /old=>old\.some\(x=>x\.id===normalizedTask\.id\)/, "new tasks created from Kanban must be inserted, not treated as edits");
assert.match(app, /if\(!await persist\("tasks",normalizedTask\)\) return/, "failed task writes must keep the task editor open");
assert.match(jobBoard, /onDragStart=/, "placement board must wire native drag start");
assert.match(jobBoard, /onDrop=/, "placement board must wire native drop targets");
assert.match(jobBoard, /onMoveApplication\(appId, newStatus\)/, "placement drop must update application stage");
assert.match(rounds, /onSaveRound\(newRound\)/, "round editor must call persistence handler");
assert.match(app, /rounds\.filter\(r=>r\.scheduled_at&&format\(parseISO\(r\.scheduled_at\)/, "scheduled rounds must appear in the calendar");

assert.match(notifications, /Notification\.requestPermission\(\)/, "notification permission request must be explicit");
assert.match(notifications, /navigator\.serviceWorker\.register\("\/sw\.js"/, "service worker must register from the app scope");
assert.doesNotMatch(notifications, /DEFAULT_VAPID_PUBLIC_KEY/, "push must not fall back to an unmatched demo VAPID key");
assert.match(notificationUi, /isVapidPublicKeyConfigured/, "push UI must explain missing VAPID setup");
assert.match(notificationUi, /\.eq\("user_id", user\.id\)[\s\S]*?\.eq\("endpoint", subscription\.endpoint\)/, "registered browser subscriptions must be checked under the active user's RLS scope");
assert.match(notificationUi, /onPersistSubscription\(subData, "upsert"\)/, "push registration must persist the browser endpoint");
assert.match(notificationUi, /onPersistSubscription\(\{ endpoint: currentSubscription\.endpoint \}, "delete"\)/, "push unregistration must remove the current browser endpoint");
assert.match(notificationUi, /functions\.invoke\("send-push"/, "push test action must call the deployed Edge Function");
assert.match(notificationUi, /Authorization: `Bearer \$\{session\.access_token\}`/, "push test must send the authenticated Supabase access token");
assert.match(notificationUi, /session\.user\.id !== user\.id/, "push test must reject a session that changed accounts");
assert.match(notificationUi, /Automatic scheduled background reminders are not configured/, "the UI must not claim unscheduled background reminders");
assert.match(pushFunction, /req\.headers\.get\("Authorization"\)/, "Edge Function must read the caller's authorization header");
assert.match(pushFunction, /supabase\.auth\.getUser\(accessToken\)/, "Edge Function must verify the access token with Supabase Auth");
assert.match(pushFunction, /\.eq\("user_id", user\.id\)/, "Edge Function must query only the authenticated user's subscriptions");
assert.doesNotMatch(pushFunction, /SUPABASE_SERVICE_ROLE_KEY/, "user-facing push must not use service-role credentials");
assert.doesNotMatch(pushFunction, /const\s*\{[^}]*user_id[^}]*\}\s*=\s*await\s+req\.json\(\)/, "request body must not select a user identity");
assert.match(pushFunction, /new Set\(\["title", "body", "url", "tag"\]\)/, "push payloads must reject unrecognized fields");
assert.match(pushFunction, /status === 404 \|\| status === 410/, "expired push subscriptions must be recognized");
assert.match(pushFunction, /\.delete\(\)[\s\S]*?\.eq\("id", subscription\.id\)[\s\S]*?\.eq\("user_id", user\.id\)/, "expired cleanup must stay scoped to the authenticated user's row");
assert.match(supabaseConfig, /\[functions\.send-push\][\s\S]*?verify_jwt\s*=\s*true/, "gateway JWT verification must remain enabled for send-push");
for (const event of ["install", "activate", "push", "notificationclick"]) {
  assert.match(worker, new RegExp(`addEventListener\\('${event}'`), `service worker must handle ${event}`);
}

assert.match(dsa, /\(p\.notes \?\? ""\)\.toLowerCase\(\)/, "nullable DSA notes must not crash search");
assert.equal((dsa.match(/<option value="Need Revision">/g) ?? []).length, 2, "both DSA views must support Need Revision status");
assert.match(dsaModal, /format\(parseISO\(initial\.solved_at\), "yyyy-MM-dd"\)/, "saved DSA dates must be edited in local time");
assert.match(css, /\.app\.dark/, "dark theme styles must remain present");
for (const token of [
  "--bg:#FFFFFF", "--surface:#FFFFFF", "--surface2:#F5F5F5", "--text:#000000",
  "--muted:#525252", "--line:#E5E5E5", "--primary:#000000", "--on-primary:#FFFFFF",
  "--bg:#000000", "--surface:#111111", "--surface2:#171717", "--text:#FFFFFF",
  "--muted:#A3A3A3", "--line:#333333", "--primary:#FFFFFF", "--on-primary:#000000",
  "--chart-secondary:#737373", "--chart-secondary:#A3A3A3"
]) assert.ok(css.includes(token), `central theme palette must include ${token}`);
assert.match(html, /localStorage\.getItem\("taskflow-theme"\)/, "saved theme must be read before React mounts to avoid a flash");
assert.match(html, /document\.documentElement\.dataset\.theme\s*=\s*initialTheme/, "the initial root theme must match the saved preference");
assert.match(app, /themeButtonRef\.current\?\.getBoundingClientRect\(\)/, "theme reveal must measure the clicked theme button");
assert.match(app, /bounds\.left\s*\+\s*bounds\.width\s*\/\s*2/, "theme reveal must originate at the button's horizontal center");
assert.match(app, /bounds\.top\s*\+\s*bounds\.height\s*\/\s*2/, "theme reveal must originate at the button's vertical center");
assert.match(app, /startViewTransition\(applyTheme\)/, "supported browsers must use the View Transition API");
assert.match(app, /prefers-reduced-motion:\s*reduce/, "reduced-motion preferences must bypass the reveal");
assert.match(app, /themeTransitionRef\.current\) return/, "rapid clicks must not overlap theme transitions");
assert.match(app, /localStorage\.setItem\("taskflow-theme"/, "theme selection must persist across reloads");
assert.match(app, /aria-label=\{dark\?"Switch to light theme":"Switch to dark theme"\}/, "theme toggle must have an accessible state label");
assert.match(css, /::view-transition-new\(root\).*?circle\(0 at var\(--theme-reveal-x\) var\(--theme-reveal-y\)\)/, "new theme must start as a circular curtain at the button center");
assert.match(css, /taskflow-theme-curtain 760ms/, "theme curtain must use the requested premium transition timing");
for (const [sourceName, source] of [["styles.css", css], ["index.html", html], ["App.tsx", app]]) {
  for (const [, literal] of source.matchAll(/#([0-9a-f]{3,8})\b/gi)) {
    const channels = literal.length <= 4
      ? [...literal.slice(0, 3)].map((digit) => parseInt(digit + digit, 16))
      : literal.slice(0, 6).match(/.{2}/g).map((channel) => parseInt(channel, 16));
    assert.equal(channels[0], channels[1], `${sourceName} color #${literal} must be monochrome`);
    assert.equal(channels[1], channels[2], `${sourceName} color #${literal} must be monochrome`);
  }
}
assert.match(css, /\.stat-icon\{[^}]*background:var\(--primary2\);color:var\(--primary\)/, "all dashboard statistic icons must share one monochrome treatment");
assert.match(css, /\.analytics-stat-icon\{[^}]*background:var\(--primary2\);color:var\(--primary\)/, "analytics statistic icons must share the same monochrome treatment");
assert.match(css, /\.task-bar\{background:var\(--primary\)\}\.dsa-bar\{background:var\(--chart-secondary\)\}/, "chart series must use distinct neutral intensities");
for (const width of [1100, 850, 700]) assert.match(css, new RegExp(`@media\\(max-width:${width}px\\)`), `responsive breakpoint ${width}px must remain present`);
assert.match(app, /workspaceLoading&&/, "account data must have a visible loading state");
assert.match(app, /Could not load tasks/, "workspace loading errors must be surfaced");

console.log("Source audit passed: RLS/query scoping, Kanban wiring, rounds/calendar, authenticated push, DSA null/date handling, themes, and responsive/loading states.");
