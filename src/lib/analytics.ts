import {
  addDays,
  addWeeks,
  eachDayOfInterval,
  isValid,
  parseISO,
  startOfDay,
  startOfWeek,
} from "date-fns";
import type { Application, DsaDifficulty, DsaProblem, Task } from "../types";

export type WeekRange = {
  start: Date;
  end: Date;
  endExclusive: Date;
  days: Date[];
};

export type WeeklyGoals = {
  tasks: number;
  dsa: number;
};

export const DEFAULT_WEEKLY_GOALS: WeeklyGoals = { tasks: 5, dsa: 10 };

export const normalizeWeeklyGoals = (value: unknown): WeeklyGoals => {
  if (!value || typeof value !== "object") return DEFAULT_WEEKLY_GOALS;
  const candidate = value as Partial<Record<keyof WeeklyGoals, unknown>>;
  const normalizeTarget = (target: unknown, fallback: number) => {
    const parsed = typeof target === "number" ? target : Number(target);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(1000, Math.floor(parsed))) : fallback;
  };
  return {
    tasks: normalizeTarget(candidate.tasks, DEFAULT_WEEKLY_GOALS.tasks),
    dsa: normalizeTarget(candidate.dsa, DEFAULT_WEEKLY_GOALS.dsa),
  };
};

export const getWeekRange = (date: Date): WeekRange => {
  const start = startOfWeek(startOfDay(date), { weekStartsOn: 1 });
  const end = addDays(start, 6);
  return {
    start,
    end,
    endExclusive: addDays(start, 7),
    days: eachDayOfInterval({ start, end }),
  };
};

export const isDateInWeek = (value: string | null | undefined, week: WeekRange): boolean => {
  if (!value) return false;
  const date = parseISO(value);
  return isValid(date) && date >= week.start && date < week.endExclusive;
};

export const getPreviousWeek = (week: WeekRange): WeekRange => getWeekRange(addWeeks(week.start, -1));

const isEstimatedLegacyCompletion = (task: Task): boolean => {
  if (!task.completed_at || !task.created_at) return false;
  const completedAt = parseISO(task.completed_at);
  const createdAt = parseISO(task.created_at);
  return isValid(completedAt) && isValid(createdAt) && completedAt.getTime() === createdAt.getTime();
};

export type DailyCount = { date: Date; count: number };

export type TaskWeeklyAnalytics = {
  completed: number;
  previousWeekCompleted: number;
  daily: DailyCount[];
  dueCount: number;
  completedDueCount: number;
  completionPercent: number;
  estimatedExcluded: number;
  untimedExcluded: number;
};

const countPreciseTaskCompletions = (tasks: Task[], week: WeekRange) => {
  let estimatedExcluded = 0;
  let untimedExcluded = 0;
  const precise = tasks.filter((task) => {
    if (!task.completed) return false;
    if (!task.completed_at) {
      untimedExcluded += 1;
      return false;
    }
    if (isEstimatedLegacyCompletion(task)) {
      if (isDateInWeek(task.completed_at, week)) estimatedExcluded += 1;
      return false;
    }
    return isDateInWeek(task.completed_at, week);
  });
  return { precise, estimatedExcluded, untimedExcluded };
};

export const getTaskWeeklyAnalytics = (tasks: Task[], week: WeekRange): TaskWeeklyAnalytics => {
  const { precise, estimatedExcluded, untimedExcluded } = countPreciseTaskCompletions(tasks, week);
  const previousWeek = getPreviousWeek(week);
  const previous = countPreciseTaskCompletions(tasks, previousWeek).precise.length;
  const daily = week.days.map((date) => ({
    date,
    count: precise.filter((task) => isDateInWeek(task.completed_at, {
      start: date,
      end: date,
      endExclusive: addDays(date, 1),
      days: [date],
    })).length,
  }));
  const dueThisWeek = tasks.filter((task) => isDateInWeek(task.due_at, week));
  const completedDueCount = dueThisWeek.filter((task) => task.completed).length;
  return {
    completed: precise.length,
    previousWeekCompleted: previous,
    daily,
    dueCount: dueThisWeek.length,
    completedDueCount,
    completionPercent: dueThisWeek.length ? Math.round((completedDueCount / dueThisWeek.length) * 100) : 0,
    estimatedExcluded,
    untimedExcluded,
  };
};

export type DsaWeeklyAnalytics = {
  solved: number;
  previousWeekSolved: number;
  daily: DailyCount[];
  difficulty: Record<DsaDifficulty, number>;
  topics: { topic: string; count: number }[];
};

const solvedInWeek = (problems: DsaProblem[], week: WeekRange) =>
  problems.filter((problem) => Boolean(problem.solved_at) && isDateInWeek(problem.solved_at, week));

export const getDsaWeeklyAnalytics = (problems: DsaProblem[], week: WeekRange): DsaWeeklyAnalytics => {
  const solved = solvedInWeek(problems, week);
  const previousWeek = getPreviousWeek(week);
  const previous = solvedInWeek(problems, previousWeek).length;
  const difficulty: Record<DsaDifficulty, number> = { Easy: 0, Medium: 0, Hard: 0 };
  const topics = new Map<string, number>();
  solved.forEach((problem) => {
    difficulty[problem.difficulty] += 1;
    topics.set(problem.topic, (topics.get(problem.topic) ?? 0) + 1);
  });
  return {
    solved: solved.length,
    previousWeekSolved: previous,
    daily: week.days.map((date) => ({
      date,
      count: solved.filter((problem) => isDateInWeek(problem.solved_at, {
        start: date,
        end: date,
        endExclusive: addDays(date, 1),
        days: [date],
      })).length,
    })),
    difficulty,
    topics: [...topics.entries()].map(([topic, count]) => ({ topic, count })).sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic)),
  };
};

export const getGoalPercent = (actual: number, target: number): number =>
  target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;

export const getPlacementAnalytics = (applications: Application[]) => {
  const statuses = [
    "Applied", "Assessment Scheduled", "Assessment Completed", "Interview Call",
    "Technical Round", "HR Round", "Selected", "Rejected", "On Hold", "Withdrawn",
  ];
  const byStatus = statuses.map((status) => ({
    status,
    count: applications.filter((application) => application.status === status).length,
  }));
  const assessmentStatuses = new Set(["Assessment Scheduled", "Assessment Completed"]);
  const interviewStatuses = new Set(["Interview Call", "Technical Round", "HR Round"]);
  const countStatus = (accepted: Set<string>) => applications.filter((application) => accepted.has(application.status)).length;
  return {
    total: applications.length,
    byStatus,
    assessments: countStatus(assessmentStatuses),
    interviews: countStatus(interviewStatuses),
    selected: applications.filter((application) => application.status === "Selected").length,
    rejected: applications.filter((application) => application.status === "Rejected").length,
    pipeline: [
      { stage: "Applied", count: countStatus(new Set(["Applied"])) },
      { stage: "Assessment", count: countStatus(assessmentStatuses) },
      { stage: "Interview", count: countStatus(interviewStatuses) },
      { stage: "Selected", count: countStatus(new Set(["Selected"])) },
      { stage: "Rejected", count: countStatus(new Set(["Rejected"])) },
      { stage: "Other", count: countStatus(new Set(["On Hold", "Withdrawn"])) },
    ],
  };
};

