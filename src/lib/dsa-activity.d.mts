export type DsaActivityProblem = {
  id: string;
  status: string;
  solved_at: string | null;
};

export type DsaActivityDay = {
  date: Date;
  dateKey: string;
  count: number;
};

export type DsaYearActivity = {
  year: number;
  days: DsaActivityDay[];
  weeks: Array<Array<DsaActivityDay | null>>;
  startOffset: number;
  totalSolved: number;
  activeDays: number;
  longestStreak: number;
  currentStreak: number;
  undatedSolvedCount: number;
};

export function getDsaActivityLevel(count: number): 0 | 1 | 2 | 3 | 4;
export function getDsaMonthWeekSpans(
  year: number,
  startOffset: number,
  weekCount: number,
): Array<{ month: number; startWeek: number; endWeek: number }>;
export function getDsaYearActivity(
  problems: readonly DsaActivityProblem[],
  year: number,
  today?: Date,
): DsaYearActivity;
