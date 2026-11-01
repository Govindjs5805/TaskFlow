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
const worker = read("../public/sw.js");
const baseSchema = read("../supabase/schema.sql");
const migration = read("../supabase/migrations_v2.sql");
const css = read("../src/styles.css");

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
for (const event of ["install", "activate", "push", "notificationclick"]) {
  assert.match(worker, new RegExp(`addEventListener\\('${event}'`), `service worker must handle ${event}`);
}

assert.match(dsa, /\(p\.notes \?\? ""\)\.toLowerCase\(\)/, "nullable DSA notes must not crash search");
assert.equal((dsa.match(/<option value="Need Revision">/g) ?? []).length, 2, "both DSA views must support Need Revision status");
assert.match(dsaModal, /format\(parseISO\(initial\.solved_at\), "yyyy-MM-dd"\)/, "saved DSA dates must be edited in local time");
assert.match(css, /\.app\.dark/, "dark theme styles must remain present");
for (const width of [1100, 850, 700]) assert.match(css, new RegExp(`@media\\(max-width:${width}px\\)`), `responsive breakpoint ${width}px must remain present`);
assert.match(app, /workspaceLoading&&/, "account data must have a visible loading state");
assert.match(app, /Could not load tasks/, "workspace loading errors must be surfaced");

console.log("Source audit passed: RLS/query scoping, Kanban wiring, rounds/calendar, notifications, DSA null/date handling, themes, and responsive/loading states.");
