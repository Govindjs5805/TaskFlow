import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const helperUrl = new URL("../src/lib/analytics.ts", import.meta.url);
const helperSource = readFileSync(helperUrl, "utf8");
const compiledHelper = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const helperModule = { exports: {} };
new Function("require", "module", "exports", compiledHelper)(createRequire(helperUrl), helperModule, helperModule.exports);
const { getDsaWeeklyAnalytics, getGoalPercent, getPlacementAnalytics, getPreviousWeek, getTaskWeeklyAnalytics, getWeekRange, normalizeWeeklyGoals } = helperModule.exports;

const localDate = (year, month, day, hour = 12) => new Date(year, month - 1, day, hour, 0, 0, 0);
const asIso = (date) => date.toISOString();
const weekFrom = (date) => getWeekRange(date);

const sundayWeek = weekFrom(localDate(2026, 11, 1));
assert.equal(sundayWeek.start.getFullYear(), 2026);
assert.equal(sundayWeek.start.getMonth(), 9);
assert.equal(sundayWeek.start.getDate(), 26);
assert.equal(sundayWeek.end.getDate(), 1);
assert.equal(sundayWeek.days.length, 7);

const mondayWeek = weekFrom(localDate(2026, 11, 2, 0));
assert.equal(mondayWeek.start.getDate(), 2);
assert.equal(mondayWeek.start.getDay(), 1);
assert.equal(mondayWeek.endExclusive.getDate(), 9);
assert.equal(mondayWeek.endExclusive.getHours(), 0);
assert.equal(getPreviousWeek(mondayWeek).endExclusive.getTime(), mondayWeek.start.getTime());

const task = (id, completedAt, dueAt, createdAt = "2026-10-01T10:00:00.000Z", completed = true) => ({
  id,
  title: id,
  description: "",
  category: "Personal",
  priority: "Medium",
  due_at: dueAt,
  reminder_at: null,
  completed,
  completed_at: completedAt,
  created_at: createdAt,
});

const taskStats = getTaskWeeklyAnalytics([
  task("monday", asIso(localDate(2026, 11, 2, 8)), asIso(localDate(2026, 11, 3))),
  task("monday-boundary", asIso(localDate(2026, 11, 2, 0)), asIso(localDate(2026, 11, 2, 0))),
  task("sunday", asIso(localDate(2026, 11, 8, 20)), asIso(localDate(2026, 11, 8))),
  task("next-monday", asIso(localDate(2026, 11, 9, 0)), null),
  task("previous-week", asIso(localDate(2026, 11, 1, 10)), null),
  task("estimated", asIso(localDate(2026, 11, 4, 9)), null, asIso(localDate(2026, 11, 4, 9))),
  task("no-date", null, null),
  task("incomplete", null, asIso(localDate(2026, 11, 4)), undefined, false),
], mondayWeek);
assert.equal(taskStats.completed, 3);
assert.equal(taskStats.previousWeekCompleted, 1);
assert.equal(taskStats.daily[0].count, 2);
assert.equal(taskStats.daily[6].count, 1);
assert.equal(taskStats.estimatedExcluded, 1);
assert.equal(taskStats.untimedExcluded, 1);
assert.equal(taskStats.dueCount, 4);
assert.equal(taskStats.completedDueCount, 3);
assert.equal(taskStats.completionPercent, 75);

const emptyTasks = getTaskWeeklyAnalytics([], mondayWeek);
assert.equal(emptyTasks.completed, 0);
assert.equal(emptyTasks.previousWeekCompleted, 0);
assert.equal(emptyTasks.completionPercent, 0);
assert.equal(emptyTasks.daily.length, 7);
assert.deepEqual(emptyTasks.daily.map((day) => day.count), Array(7).fill(0));

const problem = (id, solvedAt, difficulty, topic) => ({
  id,
  title: id,
  platform: "LeetCode",
  problem_url: "",
  difficulty,
  topic,
  status: "Solved",
  time_spent_minutes: 0,
  solved_at: solvedAt,
  notes: "",
  code_snippet: "",
});
const dsaStats = getDsaWeeklyAnalytics([
  problem("monday-easy", asIso(localDate(2026, 11, 2, 8)), "Easy", "Arrays"),
  problem("sunday-hard", asIso(localDate(2026, 11, 8, 20)), "Hard", "Graphs"),
  problem("previous-medium", asIso(localDate(2026, 11, 1, 10)), "Medium", "Arrays"),
], mondayWeek);
assert.equal(dsaStats.solved, 2);
assert.equal(dsaStats.previousWeekSolved, 1);
assert.deepEqual(dsaStats.difficulty, { Easy: 1, Medium: 0, Hard: 1 });
assert.deepEqual(dsaStats.topics, [{ topic: "Arrays", count: 1 }, { topic: "Graphs", count: 1 }]);
assert.equal(dsaStats.daily[0].count, 1);
assert.equal(dsaStats.daily[6].count, 1);

const emptyDsa = getDsaWeeklyAnalytics([], mondayWeek);
assert.equal(emptyDsa.solved, 0);
assert.equal(emptyDsa.topics.length, 0);
assert.deepEqual(emptyDsa.difficulty, { Easy: 0, Medium: 0, Hard: 0 });
assert.equal(getGoalPercent(12, 10), 100);
assert.equal(getGoalPercent(0, 0), 0);
assert.deepEqual(normalizeWeeklyGoals({ tasks: 7.8, dsa: -3 }), { tasks: 7, dsa: 0 });
assert.deepEqual(normalizeWeeklyGoals(null), { tasks: 5, dsa: 10 });

const placementStats = getPlacementAnalytics([
  { id: "1", company: "A", role: "Engineer", job_type: "Full-time", applied_at: null, job_url: "", status: "Applied", package_lpa: null, next_step: "", notes: "" },
  { id: "2", company: "B", role: "Engineer", job_type: "Full-time", applied_at: null, job_url: "", status: "Assessment Scheduled", package_lpa: null, next_step: "", notes: "" },
  { id: "3", company: "C", role: "Engineer", job_type: "Full-time", applied_at: null, job_url: "", status: "Technical Round", package_lpa: null, next_step: "", notes: "" },
  { id: "4", company: "D", role: "Engineer", job_type: "Full-time", applied_at: null, job_url: "", status: "Selected", package_lpa: null, next_step: "", notes: "" },
  { id: "5", company: "E", role: "Engineer", job_type: "Full-time", applied_at: null, job_url: "", status: "Rejected", package_lpa: null, next_step: "", notes: "" },
]);
assert.equal(placementStats.total, 5);
assert.equal(placementStats.assessments, 1);
assert.equal(placementStats.interviews, 1);
assert.equal(placementStats.selected, 1);
assert.equal(placementStats.rejected, 1);
assert.equal(placementStats.pipeline.reduce((sum, item) => sum + item.count, 0), 5);

console.log("Analytics week boundaries, empty weeks, legacy data, comparisons, goals, and placement checks passed.");
