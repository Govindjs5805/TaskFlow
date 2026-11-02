import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getDsaActivityLevel, getDsaYearActivity } from "../src/lib/dsa-activity.mjs";

const localDate = (year, month, day, hour = 12) => new Date(year, month - 1, day, hour).toISOString();
const problem = (id, status, solved_at) => ({ id, status, solved_at });

const records = [
  problem("jan-1", "Solved", localDate(2024, 1, 1)),
  problem("jan-2", "Solved", localDate(2024, 1, 2)),
  problem("jan-2", "Solved", localDate(2024, 1, 2)), // duplicated rows must not inflate counts
  problem("jan-4", "Solved", localDate(2024, 1, 4)),
  problem("jan-5-a", "Solved", localDate(2024, 1, 5)),
  problem("jan-5-b", "Solved", localDate(2024, 1, 5)),
  problem("jan-6", "Solved", localDate(2024, 1, 6)),
  problem("old-year", "Solved", localDate(2023, 12, 31)),
  problem("not-solved", "Attempted", localDate(2024, 1, 5)),
  problem("undated", "Solved", null),
  problem("invalid-date", "Solved", "not-a-date"),
];

const year = getDsaYearActivity(records, 2024, new Date(2024, 0, 6, 12));
assert.equal(year.days.length, 366, "leap years include every calendar day");
assert.equal(year.weeks.flat().filter(Boolean).length, 366, "the week grid has exactly one cell per year day");
assert.equal(year.weeks.length, Math.ceil((year.startOffset + 366) / 7));
assert.equal(year.totalSolved, 6, "only unique currently solved problems with valid dates count");
assert.equal(year.activeDays, 5);
assert.equal(year.longestStreak, 3, "longest streak counts consecutive active dates");
assert.equal(year.currentStreak, 3, "current streak includes today and walks back across consecutive active dates");
assert.equal(year.undatedSolvedCount, 2, "undated and invalid solved timestamps are identified, not guessed");
assert.equal(year.days.find((day) => day.dateKey === "2024-01-05")?.count, 2);
assert.equal(year.days.find((day) => day.dateKey === "2024-01-03")?.count, 0);

const noToday = getDsaYearActivity(records, 2024, new Date(2024, 0, 7, 12));
assert.equal(noToday.currentStreak, 3, "current streak continues when the last solve was yesterday");
const brokenStreak = getDsaYearActivity(records, 2024, new Date(2024, 0, 8, 12));
assert.equal(brokenStreak.currentStreak, 0, "a gap through yesterday ends the current streak");

const previousYear = getDsaYearActivity(records, 2023, new Date(2024, 0, 6, 12));
assert.equal(previousYear.totalSolved, 1, "year switching isolates the selected year's activity");
assert.equal(previousYear.days.length, 365);
assert.equal(previousYear.currentStreak, 3, "current streak is based on the latest activity across years");

const empty = getDsaYearActivity([
  problem("todo", "To Do", localDate(2024, 6, 10)),
  problem("no-date", "Solved", null),
], 2024, new Date(2024, 6, 10, 12));
assert.equal(empty.totalSolved, 0);
assert.equal(empty.activeDays, 0);
assert.equal(empty.longestStreak, 0);
assert.equal(empty.currentStreak, 0);
assert.equal(empty.days.length, 366);

assert.equal(getDsaActivityLevel(0), 0);
assert.equal(getDsaActivityLevel(1), 1);
assert.equal(getDsaActivityLevel(2), 2);
assert.equal(getDsaActivityLevel(3), 3);
assert.equal(getDsaActivityLevel(12), 4);

const trackerSource = readFileSync(new URL("../src/components/dsa/DsaTracker.tsx", import.meta.url), "utf8");
const stylesheet = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
assert.match(trackerSource, /getDsaYearActivity\(problems, selectedYear\), \[problems, selectedYear\]/, "activity must refresh when saved DSA data or selected year changes");
assert.match(trackerSource, /setSelectedYear\(Number\(event\.target\.value\)\)/, "the year selector must switch the displayed calendar");
assert.match(trackerSource, /className="dsa-activity-scroll"/, "the calendar must have a horizontally scrollable responsive viewport");
assert.match(stylesheet, /@media\(max-width:700px\)\{\.dsa-activity-panel[\s\S]*?\.dsa-activity-metrics\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/, "the heatmap summary must adapt to narrow screens");

console.log("DSA activity tests passed: leap-year grid, unique solved counts, date handling, year switching, empty state, and streaks.");
