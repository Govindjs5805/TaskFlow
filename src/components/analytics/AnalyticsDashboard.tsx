import { useEffect, useMemo, useState } from "react";
import {
  addWeeks,
  format,
  isSameDay,
  isSameMonth,
} from "date-fns";
import {
  BarChart3,
  BriefcaseBusiness,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Code2,
  Target,
  TrendingUp,
} from "lucide-react";
import type { Application, DsaProblem, Task } from "../../types";
import {
  getDsaWeeklyAnalytics,
  getGoalPercent,
  getPlacementAnalytics,
  getTaskWeeklyAnalytics,
  getWeekRange,
  normalizeWeeklyGoals,
  type WeeklyGoals,
} from "../../lib/analytics";

type AnalyticsDashboardProps = {
  tasks: Task[];
  problems: DsaProblem[];
  applications: Application[];
  goals: WeeklyGoals;
  dsaLoading?: boolean;
  onSaveGoals: (goals: WeeklyGoals) => void | Promise<void>;
};

const changeLabel = (current: number, previous: number) => {
  const difference = current - previous;
  if (difference === 0) return `Same as last week (${previous})`;
  return `${difference > 0 ? "+" : ""}${difference} vs last week (${previous})`;
};

const StatCard = ({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  detail: string;
  tone: string;
}) => (
  <article className="panel analytics-stat-card">
    <div className={`analytics-stat-icon ${tone}`}>{icon}</div>
    <div className="analytics-stat-copy">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  </article>
);

export function AnalyticsDashboard({
  tasks,
  problems,
  applications,
  goals,
  dsaLoading = false,
  onSaveGoals,
}: AnalyticsDashboardProps) {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [draftGoals, setDraftGoals] = useState<WeeklyGoals>(goals);
  const week = useMemo(() => getWeekRange(selectedDate), [selectedDate]);
  const currentWeek = getWeekRange(new Date());
  const isCurrentOrFutureWeek = week.start >= currentWeek.start;
  const taskStats = useMemo(() => getTaskWeeklyAnalytics(tasks, week), [tasks, week]);
  const dsaStats = useMemo(() => getDsaWeeklyAnalytics(problems, week), [problems, week]);
  const placement = useMemo(() => getPlacementAnalytics(applications), [applications]);

  useEffect(() => setDraftGoals(goals), [goals]);

  const weekLabel = `${format(week.start, "MMM d")} – ${isSameMonth(week.start, week.end) ? format(week.end, "d, yyyy") : format(week.end, "MMM d, yyyy")}`;
  const taskTargetPercent = getGoalPercent(taskStats.completed, goals.tasks);
  const dsaTargetPercent = getGoalPercent(dsaStats.solved, goals.dsa);
  const chartMax = Math.max(1, ...taskStats.daily.map((day) => day.count), ...dsaStats.daily.map((day) => day.count));
  const topicMax = Math.max(1, ...dsaStats.topics.map((topic) => topic.count));
  const applicationMax = Math.max(1, ...placement.byStatus.map((status) => status.count));

  const saveGoals = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSaveGoals(normalizeWeeklyGoals(draftGoals));
  };

  return (
    <section className="page analytics-page">
      <div className="analytics-heading-row">
        <div>
          <p className="muted">A weekly view of your tasks, DSA practice, and applications.</p>
          <h2>Weekly productivity</h2>
        </div>
        <div className="analytics-week-nav" aria-label="Week navigation">
          <button
            className="soft-btn small"
            onClick={() => setSelectedDate((date) => addWeeks(date, -1))}
            aria-label="Show previous week"
          >
            <ChevronLeft size={16} /> Previous
          </button>
          <div className="analytics-week-label">
            <b>{weekLabel}</b>
            <span>{isSameDay(week.start, currentWeek.start) ? "This week" : "Selected week"}</span>
          </div>
          <button
            className="soft-btn small"
            onClick={() => setSelectedDate((date) => addWeeks(date, 1))}
            disabled={isCurrentOrFutureWeek}
            aria-label="Show next week"
            title={isCurrentOrFutureWeek ? "The current week is the latest available" : "Show next week"}
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="analytics-stats-grid">
        <StatCard
          icon={<CheckSquare size={19} />}
          label="Tasks completed"
          value={taskStats.completed}
          detail={changeLabel(taskStats.completed, taskStats.previousWeekCompleted)}
          tone="green"
        />
        <StatCard
          icon={<TrendingUp size={19} />}
          label="Task completion rate"
          value={`${taskStats.completionPercent}%`}
          detail={`${taskStats.completedDueCount} of ${taskStats.dueCount} due this week completed`}
          tone="green"
        />
        <StatCard
          icon={<Code2 size={19} />}
          label="DSA problems solved"
          value={dsaLoading ? "…" : dsaStats.solved}
          detail={dsaLoading ? "Loading problems" : changeLabel(dsaStats.solved, dsaStats.previousWeekSolved)}
          tone="green"
        />
        <StatCard
          icon={<BriefcaseBusiness size={19} />}
          label="Applications tracked"
          value={placement.total}
          detail={`${placement.interviews} interview · ${placement.assessments} assessment stages`}
          tone="green"
        />
      </div>

      <div className="analytics-grid analytics-grid-top">
        <article className="panel analytics-panel">
          <div className="panel-head">
            <div>
              <h3>Daily activity</h3>
              <p className="muted">Completed tasks and DSA problems, Monday to Sunday</p>
            </div>
            <BarChart3 className="analytics-head-icon" size={19} />
          </div>
          <div className="analytics-legend">
            <span><i className="legend-task" /> Tasks</span>
            <span><i className="legend-dsa" /> DSA solved</span>
          </div>
          <div className="analytics-bar-chart" role="img" aria-label="Daily completed tasks and DSA problems from Monday through Sunday">
            {week.days.map((day, index) => {
              const taskCount = taskStats.daily[index]?.count ?? 0;
              const dsaCount = dsaStats.daily[index]?.count ?? 0;
              return (
                <div className="analytics-day-column" key={day.toISOString()}>
                  <div className="analytics-day-bars">
                    <div className="analytics-bar-value task-value">{taskCount || ""}</div>
                    <div className="analytics-bar-value dsa-value">{dsaCount || ""}</div>
                    <div className="analytics-bar-track">
                      <i className="analytics-bar task-bar" style={{ height: taskCount ? `${Math.max(8, (taskCount / chartMax) * 100)}%` : "0%" }} />
                      <i className="analytics-bar dsa-bar" style={{ height: dsaCount ? `${Math.max(8, (dsaCount / chartMax) * 100)}%` : "0%" }} />
                    </div>
                  </div>
                  <b>{format(day, "EEE")}</b>
                  <span>{format(day, "d")}</span>
                </div>
              );
            })}
          </div>
          {(taskStats.estimatedExcluded > 0 || taskStats.untimedExcluded > 0) && (
            <p className="analytics-data-note">
              {taskStats.estimatedExcluded > 0 && `${taskStats.estimatedExcluded} estimated legacy completion date${taskStats.estimatedExcluded === 1 ? "" : "s"} excluded from this week. `}
              {taskStats.untimedExcluded > 0 && `${taskStats.untimedExcluded} completed task${taskStats.untimedExcluded === 1 ? " has" : "s have"} no completion date and cannot be placed in a week.`}
            </p>
          )}
        </article>

        <article className="panel analytics-panel analytics-goals-panel">
          <div className="panel-head">
            <div>
              <h3>Weekly goals</h3>
              <p className="muted">Progress for {isSameDay(week.start, currentWeek.start) ? "this week" : "the selected week"}</p>
            </div>
            <Target className="analytics-head-icon" size={19} />
          </div>
          <GoalProgress label="Tasks" completed={taskStats.completed} target={goals.tasks} percent={taskTargetPercent} tone="purple" />
          <GoalProgress label="DSA problems" completed={dsaLoading ? 0 : dsaStats.solved} target={goals.dsa} percent={dsaLoading ? 0 : dsaTargetPercent} tone="blue" />
          <form className="analytics-goals-form" onSubmit={saveGoals}>
            <label>
              <span>Tasks / week</span>
              <input type="number" min="0" max="1000" value={draftGoals.tasks} onChange={(event) => setDraftGoals((current) => ({ ...current, tasks: Number(event.target.value) }))} />
            </label>
            <label>
              <span>DSA / week</span>
              <input type="number" min="0" max="1000" value={draftGoals.dsa} onChange={(event) => setDraftGoals((current) => ({ ...current, dsa: Number(event.target.value) }))} />
            </label>
            <button className="primary-btn" type="submit">Save goals</button>
          </form>
        </article>
      </div>

      <div className="analytics-grid">
        <article className="panel analytics-panel">
          <div className="panel-head">
            <div>
              <h3>DSA difficulty</h3>
              <p className="muted">Problems solved in the selected week</p>
            </div>
            <Code2 className="analytics-head-icon" size={19} />
          </div>
          <div className="analytics-difficulty-grid">
            {(["Easy", "Medium", "Hard"] as const).map((level) => (
              <div className={`analytics-difficulty-card ${level.toLowerCase()}`} key={level}>
                <span>{level}</span><b>{dsaLoading ? "…" : dsaStats.difficulty[level]}</b>
              </div>
            ))}
          </div>
          <div className="analytics-subhead"><b>Topics practiced</b><span>{dsaStats.topics.length} topics</span></div>
          {dsaLoading ? <div className="analytics-empty">Loading DSA problems…</div> : dsaStats.topics.length ? (
            <div className="analytics-topic-list">
              {dsaStats.topics.map(({ topic, count }) => (
                <div className="analytics-topic-row" key={topic}>
                  <div><span>{topic}</span><b>{count}</b></div>
                  <div className="analytics-progress-track"><i style={{ width: `${(count / topicMax) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          ) : <div className="analytics-empty">No DSA problems solved in this week.</div>}
        </article>

        <article className="panel analytics-panel">
          <div className="panel-head">
            <div>
              <h3>Placement pipeline</h3>
              <p className="muted">Current stage across all tracked applications</p>
            </div>
            <BriefcaseBusiness className="analytics-head-icon" size={19} />
          </div>
          <div className="analytics-pipeline" aria-label="Applications by pipeline stage">
            {placement.pipeline.map((stage) => (
              <div className={`analytics-pipeline-stage ${stage.stage.toLowerCase()}`} key={stage.stage}>
                <b>{stage.count}</b><span>{stage.stage}</span>
              </div>
            ))}
          </div>
          <div className="analytics-placement-summary">
            <div><span>Assessments</span><b>{placement.assessments}</b></div>
            <div><span>Interviews</span><b>{placement.interviews}</b></div>
            <div><span>Selected</span><b>{placement.selected}</b></div>
            <div><span>Rejected</span><b>{placement.rejected}</b></div>
          </div>
          <div className="analytics-subhead"><b>Applications by current stage</b><span>{placement.total} total</span></div>
          <div className="analytics-stage-list">
            {placement.byStatus.map(({ status, count }) => (
              <div className="analytics-stage-row" key={status}>
                <span>{status}</span>
                <div className="analytics-progress-track"><i style={{ width: `${(count / applicationMax) * 100}%` }} /></div>
                <b>{count}</b>
              </div>
            ))}
          </div>
        </article>
      </div>
      <p className="analytics-local-note">Week boundaries follow your local timezone. Task history uses recorded completion dates; estimated legacy dates are excluded.</p>
    </section>
  );
}

function GoalProgress({
  label,
  completed,
  target,
  percent,
  tone,
}: {
  label: string;
  completed: number;
  target: number;
  percent: number;
  tone: "purple" | "blue";
}) {
  return (
    <div className="analytics-goal-progress">
      <div className="analytics-goal-label"><b>{label}</b><span>{target > 0 ? `${completed} / ${target}` : `${completed} done · no target`}</span></div>
      <div className={`analytics-progress-track ${tone}`}><i style={{ width: `${percent}%` }} /></div>
      <small>{target > 0 ? `${percent}%` : "Set a target to track progress"}</small>
    </div>
  );
}
