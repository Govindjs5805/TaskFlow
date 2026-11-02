import { eachDayOfInterval, format, getDayOfYear, isValid, parseISO, startOfDay, subDays } from "date-fns";

export function getDsaActivityLevel(count) {
  if (!Number.isFinite(count) || count <= 0) return 0;
  if (count >= 4) return 4;
  return Math.floor(count);
}

export function getDsaMonthWeekSpans(year, startOffset, weekCount) {
  const monthStarts = Array.from({ length: 12 }, (_, month) => {
    const firstOfMonth = new Date(year, month, 1);
    return Math.floor((startOffset + getDayOfYear(firstOfMonth) - 1) / 7);
  });

  return monthStarts.map((startWeek, month) => ({
    month,
    startWeek,
    endWeek: month === 11 ? weekCount : Math.max(startWeek + 1, monthStarts[month + 1]),
  }));
}

export function getDsaYearActivity(problems, year, today = new Date()) {
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  const yearDays = eachDayOfInterval({ start, end });
  const startOffset = start.getDay();
  const weekCount = Math.ceil((startOffset + yearDays.length) / 7);
  const weeks = Array.from({ length: weekCount }, () => Array(7).fill(null));
  const allActiveDays = new Map();
  const seenProblemIds = new Set();
  const undatedSolvedIds = new Set();

  for (const problem of problems) {
    if (problem.status !== "Solved" || !problem.id || seenProblemIds.has(problem.id)) continue;
    seenProblemIds.add(problem.id);

    if (!problem.solved_at || typeof problem.solved_at !== "string") {
      undatedSolvedIds.add(problem.id);
      continue;
    }

    const solvedDate = parseISO(problem.solved_at);
    if (!isValid(solvedDate)) {
      undatedSolvedIds.add(problem.id);
      continue;
    }

    const dateKey = format(solvedDate, "yyyy-MM-dd");
    if (!allActiveDays.has(dateKey)) allActiveDays.set(dateKey, new Set());
    allActiveDays.get(dateKey).add(problem.id);
  }

  const days = yearDays.map((date, dayIndex) => {
    const dateKey = format(date, "yyyy-MM-dd");
    const day = { date, dateKey, count: allActiveDays.get(dateKey)?.size ?? 0 };
    const weekIndex = Math.floor((startOffset + dayIndex) / 7);
    weeks[weekIndex][date.getDay()] = day;
    return day;
  });

  const totalSolved = days.reduce((sum, day) => sum + day.count, 0);
  const activeDays = days.filter((day) => day.count > 0).length;
  let longestStreak = 0;
  let streak = 0;
  for (const day of days) {
    streak = day.count > 0 ? streak + 1 : 0;
    longestStreak = Math.max(longestStreak, streak);
  }

  const todayStart = startOfDay(isValid(today) ? today : new Date());
  let streakDay = allActiveDays.has(format(todayStart, "yyyy-MM-dd"))
    ? todayStart
    : subDays(todayStart, 1);
  let currentStreak = 0;
  while (streakDay <= todayStart && allActiveDays.has(format(streakDay, "yyyy-MM-dd"))) {
    currentStreak += 1;
    streakDay = subDays(streakDay, 1);
  }

  return {
    year,
    days,
    weeks,
    startOffset,
    totalSolved,
    activeDays,
    longestStreak,
    currentStreak,
    undatedSolvedCount: undatedSolvedIds.size,
  };
}
