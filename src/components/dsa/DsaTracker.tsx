import { useState, useMemo } from "react";
import {
  Code2, Plus, Search, ExternalLink, Pencil, Trash2, CheckCircle2,
  Clock, BookOpen, Layers, Check, ChevronDown, ChevronUp, BarChart2,
  Target, Flame, RefreshCw, X
} from "lucide-react";
import { format, parseISO } from "date-fns";
import type { DsaProblem, DsaDifficulty, DsaPlatform, DsaStatus, DsaTopic } from "../../types";
import { DsaProblemModal } from "./DsaProblemModal";

interface DsaTrackerProps {
  problems: DsaProblem[];
  onSaveProblem: (problem: DsaProblem) => Promise<void>;
  onDeleteProblem: (id: string) => Promise<void>;
  onNotify: (msg: string) => void;
}

const PLATFORMS: DsaPlatform[] = ["LeetCode", "GeeksforGeeks", "HackerRank", "Codeforces", "Other"];
const DIFFICULTIES: DsaDifficulty[] = ["Easy", "Medium", "Hard"];
const STATUSES: DsaStatus[] = ["To Do", "Attempted", "Solved", "Revisit", "Need Revision"];
const TOPICS: DsaTopic[] = [
  "Arrays",
  "Strings",
  "Hashing",
  "Two Pointers",
  "Sliding Window",
  "Binary Search",
  "Linked Lists",
  "Stacks",
  "Queues",
  "Trees",
  "Graphs",
  "Dynamic Programming",
  "Greedy",
  "Backtracking",
  "SQL",
  "Other"
];

export function DsaTracker({
  problems,
  onSaveProblem,
  onDeleteProblem,
  onNotify
}: DsaTrackerProps) {
  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState<string>("All");
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("All");
  const [selectedTopic, setSelectedTopic] = useState<string>("All");
  const [selectedStatus, setSelectedStatus] = useState<string>("All");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProblem, setEditingProblem] = useState<DsaProblem | null>(null);

  // Expanded notes/snippets for card/table rows
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // Statistics Calculations
  const stats = useMemo(() => {
    const total = problems.length;
    const solved = problems.filter((p) => p.status === "Solved").length;
    const attempted = problems.filter((p) => p.status === "Attempted").length;
    const revisit = problems.filter((p) => p.status === "Revisit" || p.status === "Need Revision").length;
    const todo = problems.filter((p) => p.status === "To Do").length;
    const remaining = total - solved;
    const percentage = total > 0 ? Math.round((solved / total) * 100) : 0;

    // Difficulty breakdown
    const easyTotal = problems.filter((p) => p.difficulty === "Easy").length;
    const easySolved = problems.filter((p) => p.difficulty === "Easy" && p.status === "Solved").length;

    const medTotal = problems.filter((p) => p.difficulty === "Medium").length;
    const medSolved = problems.filter((p) => p.difficulty === "Medium" && p.status === "Solved").length;

    const hardTotal = problems.filter((p) => p.difficulty === "Hard").length;
    const hardSolved = problems.filter((p) => p.difficulty === "Hard" && p.status === "Solved").length;

    // Topic breakdown
    const topicStats = TOPICS.map((t) => {
      const topicProblems = problems.filter((p) => p.topic === t);
      const topicSolved = topicProblems.filter((p) => p.status === "Solved").length;
      return {
        topic: t,
        total: topicProblems.length,
        solved: topicSolved,
        percent: topicProblems.length > 0 ? Math.round((topicSolved / topicProblems.length) * 100) : 0
      };
    }).filter((t) => t.total > 0);

    return {
      total,
      solved,
      attempted,
      revisit,
      todo,
      remaining,
      percentage,
      easy: { total: easyTotal, solved: easySolved, pct: easyTotal > 0 ? Math.round((easySolved / easyTotal) * 100) : 0 },
      medium: { total: medTotal, solved: medSolved, pct: medTotal > 0 ? Math.round((medSolved / medTotal) * 100) : 0 },
      hard: { total: hardTotal, solved: hardSolved, pct: hardTotal > 0 ? Math.round((hardSolved / hardTotal) * 100) : 0 },
      topicStats
    };
  }, [problems]);

  // Filtered Problems
  const filteredProblems = useMemo(() => {
    return problems.filter((p) => {
      const matchesSearch =
        searchQuery.trim() === "" ||
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.topic.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.notes ?? "").toLowerCase().includes(searchQuery.toLowerCase());

      const matchesPlatform = selectedPlatform === "All" || p.platform === selectedPlatform;
      const matchesDifficulty = selectedDifficulty === "All" || p.difficulty === selectedDifficulty;
      const matchesTopic = selectedTopic === "All" || p.topic === selectedTopic;
      const matchesStatus =
        selectedStatus === "All" ||
        p.status === selectedStatus ||
        (selectedStatus === "Revisit" && p.status === "Need Revision");

      return matchesSearch && matchesPlatform && matchesDifficulty && matchesTopic && matchesStatus;
    });
  }, [problems, searchQuery, selectedPlatform, selectedDifficulty, selectedTopic, selectedStatus]);

  const handleOpenAdd = () => {
    setEditingProblem(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (p: DsaProblem) => {
    setEditingProblem(p);
    setIsModalOpen(true);
  };

  const handleQuickStatusChange = async (p: DsaProblem, nextStatus: DsaStatus) => {
    const isNowSolved = nextStatus === "Solved";
    const updated: DsaProblem = {
      ...p,
      status: nextStatus,
      solved_at: isNowSolved
        ? (p.status === "Solved" && p.solved_at ? p.solved_at : new Date().toISOString())
        : p.solved_at
    };
    try {
      await onSaveProblem(updated);
      onNotify(`Status updated to ${nextStatus}`);
    } catch {
      // The parent reports the persistence error and restores its previous row.
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (window.confirm(`Delete "${title}"?`)) {
      try {
        await onDeleteProblem(id);
        onNotify("Problem deleted");
      } catch {
        // The parent reports the persistence error and restores the deleted row.
      }
    }
  };

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    selectedPlatform !== "All" ||
    selectedDifficulty !== "All" ||
    selectedTopic !== "All" ||
    selectedStatus !== "All";

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedPlatform("All");
    setSelectedDifficulty("All");
    setSelectedTopic("All");
    setSelectedStatus("All");
  };

  const formatSolvedDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    try {
      return format(parseISO(dateStr), "dd MMM yyyy");
    } catch {
      return dateStr.slice(0, 10);
    }
  };

  return (
    <section className="page dsa-page">
      {/* Page Heading */}
      <div className="page-heading">
        <div>
          <p className="muted">Master patterns, algorithms, and technical interviews.</p>
          <h2>DSA & Problem Tracker</h2>
        </div>
        <button className="primary-btn" onClick={handleOpenAdd}>
          <Plus size={17} /> Add problem
        </button>
      </div>

      {/* Analytics & Progress Dashboard */}
      <div className="dsa-dashboard-grid">
        {/* Card 1: Total Solved & Overview */}
        <div className="panel dsa-stat-card main-stat">
          <div className="dsa-stat-head">
            <span className="muted">Total Solved</span>
            <div className="stat-icon green">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="dsa-stat-hero">
            <span className="hero-number">{stats.solved}</span>
            <span className="hero-total">/ {stats.total}</span>
          </div>
          <div className="dsa-progress-bar-wrap">
            <div
              className="dsa-progress-bar-fill purple"
              style={{ width: `${stats.percentage}%` }}
            />
          </div>
          <div className="dsa-stat-footer">
            <span>{stats.percentage}% completed</span>
            <span className="muted">{stats.remaining} remaining</span>
          </div>
        </div>

        {/* Card 2: Difficulty Distribution */}
        <div className="panel dsa-stat-card difficulty-stat">
          <div className="dsa-stat-head">
            <span className="muted">Difficulty Breakdown</span>
            <div className="stat-icon green">
              <BarChart2 size={18} />
            </div>
          </div>
          <div className="diff-bars-list">
            <div className="diff-row">
              <div className="diff-row-labels">
                <span className="diff-tag easy">Easy</span>
                <span className="diff-fraction">
                  <b>{stats.easy.solved}</b> / {stats.easy.total}
                </span>
              </div>
              <div className="dsa-mini-bar">
                <div
                  className="dsa-mini-bar-fill easy"
                  style={{ width: `${stats.easy.pct}%` }}
                />
              </div>
            </div>

            <div className="diff-row">
              <div className="diff-row-labels">
                <span className="diff-tag medium">Medium</span>
                <span className="diff-fraction">
                  <b>{stats.medium.solved}</b> / {stats.medium.total}
                </span>
              </div>
              <div className="dsa-mini-bar">
                <div
                  className="dsa-mini-bar-fill medium"
                  style={{ width: `${stats.medium.pct}%` }}
                />
              </div>
            </div>

            <div className="diff-row">
              <div className="diff-row-labels">
                <span className="diff-tag hard">Hard</span>
                <span className="diff-fraction">
                  <b>{stats.hard.solved}</b> / {stats.hard.total}
                </span>
              </div>
              <div className="dsa-mini-bar">
                <div
                  className="dsa-mini-bar-fill hard"
                  style={{ width: `${stats.hard.pct}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Status Pipeline */}
        <div className="panel dsa-stat-card pipeline-stat">
          <div className="dsa-stat-head">
            <span className="muted">Study Pipeline</span>
            <div className="stat-icon green">
              <Flame size={18} />
            </div>
          </div>
          <div className="pipeline-chips-grid">
            <div
              className={`pipeline-chip ${selectedStatus === "Solved" ? "active" : ""}`}
              onClick={() => setSelectedStatus(selectedStatus === "Solved" ? "All" : "Solved")}
            >
              <span className="chip-label">Solved</span>
              <strong className="chip-val green">{stats.solved}</strong>
            </div>
            <div
              className={`pipeline-chip ${selectedStatus === "Attempted" ? "active" : ""}`}
              onClick={() => setSelectedStatus(selectedStatus === "Attempted" ? "All" : "Attempted")}
            >
              <span className="chip-label">Attempted</span>
              <strong className="chip-val green">{stats.attempted}</strong>
            </div>
            <div
              className={`pipeline-chip ${selectedStatus === "Revisit" ? "active" : ""}`}
              onClick={() => setSelectedStatus(selectedStatus === "Revisit" ? "All" : "Revisit")}
            >
              <span className="chip-label">Revisit</span>
              <strong className="chip-val orange">{stats.revisit}</strong>
            </div>
            <div
              className={`pipeline-chip ${selectedStatus === "To Do" ? "active" : ""}`}
              onClick={() => setSelectedStatus(selectedStatus === "To Do" ? "All" : "To Do")}
            >
              <span className="chip-label">To Do</span>
              <strong className="chip-val muted">{stats.todo}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Topic Progress Badges (Expandable / Scrollable) */}
      {stats.topicStats.length > 0 && (
        <div className="panel dsa-topic-strip">
          <div className="strip-title">
            <Layers size={14} />
            <span>Topic Mastery</span>
          </div>
          <div className="topic-badges-container">
            {stats.topicStats.map((t) => (
              <button
                type="button"
                key={t.topic}
                className={`topic-badge-item ${selectedTopic === t.topic ? "active" : ""}`}
                onClick={() => setSelectedTopic(selectedTopic === t.topic ? "All" : t.topic)}
                title={`Filter by ${t.topic}`}
              >
                <span className="topic-name">{t.topic}</span>
                <span className="topic-count">
                  {t.solved}/{t.total}
                </span>
                <div className="topic-badge-bar">
                  <div className="topic-badge-fill" style={{ width: `${t.percent}%` }} />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters and Controls Bar */}
      <div className="dsa-controls-bar panel">
        <div className="dsa-search-wrap">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search problems, topics or notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="icon-btn search-clear"
              onClick={() => setSearchQuery("")}
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="dsa-filter-group">
          {/* Platform Filter */}
          <select
            className="filter-select"
            value={selectedPlatform}
            onChange={(e) => setSelectedPlatform(e.target.value)}
          >
            <option value="All">All Platforms</option>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          {/* Difficulty Filter */}
          <select
            className="filter-select"
            value={selectedDifficulty}
            onChange={(e) => setSelectedDifficulty(e.target.value)}
          >
            <option value="All">All Difficulties</option>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {/* Topic Filter */}
          <select
            className="filter-select"
            value={selectedTopic}
            onChange={(e) => setSelectedTopic(e.target.value)}
          >
            <option value="All">All Topics</option>
            {TOPICS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            className="filter-select"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            <option value="All">All Statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {hasActiveFilters && (
            <button type="button" className="soft-btn small reset-btn" onClick={clearFilters}>
              Reset
            </button>
          )}
        </div>

        {/* View Switcher */}
        <div className="segmented-control">
          <button
            type="button"
            className={viewMode === "table" ? "active" : ""}
            onClick={() => setViewMode("table")}
            title="Table View"
          >
            Table
          </button>
          <button
            type="button"
            className={viewMode === "cards" ? "active" : ""}
            onClick={() => setViewMode("cards")}
            title="Card View"
          >
            Cards
          </button>
        </div>
      </div>

      {/* Problem Content View */}
      {viewMode === "table" ? (
        <div className="panel table-wrap">
          <table className="data-table dsa-table">
            <thead>
              <tr>
                <th style={{ width: "40px" }}>Status</th>
                <th>Problem</th>
                <th>Topic</th>
                <th>Difficulty</th>
                <th>Solved Date</th>
                <th>Time Spent</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProblems.map((p) => {
                const isExpanded = expandedRowId === p.id;
                return (
                  <tr key={p.id} className={p.status === "Solved" ? "row-solved" : ""}>
                    <td>
                      <select
                        className={`status-dropdown-pill ${p.status.toLowerCase().replace(/\s+/g, "-")}`}
                        value={p.status}
                        onChange={(e) => handleQuickStatusChange(p, e.target.value as DsaStatus)}
                        title="Change status"
                      >
                        <option value="To Do">To Do</option>
                        <option value="Attempted">Attempted</option>
                        <option value="Solved">Solved</option>
                        <option value="Revisit">Revisit</option>
                        <option value="Need Revision">Need Revision</option>
                      </select>
                    </td>

                    <td>
                      <div className="dsa-title-cell">
                        <div className="dsa-title-main">
                          <span className="platform-tag">{p.platform}</span>
                          <b>{p.title}</b>
                          {p.problem_url && (
                            <a
                              href={p.problem_url}
                              target="_blank"
                              rel="noreferrer"
                              className="icon-btn small-ext"
                              title="Open Problem"
                            >
                              <ExternalLink size={13} />
                            </a>
                          )}
                        </div>
                        {(p.notes || p.code_snippet) && (
                          <button
                            type="button"
                            className="notes-preview-btn"
                            onClick={() => setExpandedRowId(isExpanded ? null : p.id)}
                          >
                            <BookOpen size={11} />
                            <span>{isExpanded ? "Hide notes" : "View notes & code"}</span>
                            {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                          </button>
                        )}
                        {isExpanded && (
                          <div className="dsa-expanded-box">
                            {p.notes && (
                              <div className="expanded-notes">
                                <b>Approach Notes:</b>
                                <p>{p.notes}</p>
                              </div>
                            )}
                            {p.code_snippet && (
                              <div className="expanded-snippet">
                                <b>Code Snippet:</b>
                                <pre>{p.code_snippet}</pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>

                    <td>
                      <span className="topic-pill">{p.topic}</span>
                    </td>

                    <td>
                      <span className={`diff-pill ${p.difficulty.toLowerCase()}`}>
                        {p.difficulty}
                      </span>
                    </td>

                    <td className="muted font-tabular">
                      {formatSolvedDate(p.solved_at)}
                    </td>

                    <td className="muted font-tabular">
                      {p.time_spent_minutes > 0 ? (
                        <span className="time-badge">
                          <Clock size={12} /> {p.time_spent_minutes}m
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>

                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="icon-btn"
                          title="Edit Problem"
                          onClick={() => handleOpenEdit(p)}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn danger"
                          title="Delete Problem"
                          onClick={() => handleDelete(p.id, p.title)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredProblems.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon-wrap">
                <Code2 size={24} />
              </div>
              <b>No coding problems found</b>
              <span>
                {hasActiveFilters
                  ? "Try adjusting your search query or filters."
                  : "Add your first DSA problem to kickstart your preparation!"}
              </span>
              {hasActiveFilters ? (
                <button type="button" className="soft-btn" onClick={clearFilters}>
                  Clear all filters
                </button>
              ) : (
                <button type="button" className="primary-btn" onClick={handleOpenAdd}>
                  <Plus size={15} /> Add first problem
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Cards View */
        <div className="dsa-cards-grid">
          {filteredProblems.map((p) => {
            const isExpanded = expandedRowId === p.id;
            return (
              <div key={p.id} className={`panel dsa-card ${p.status === "Solved" ? "is-solved" : ""}`}>
                <div className="dsa-card-top">
                  <div className="dsa-card-badges">
                    <span className="platform-tag">{p.platform}</span>
                    <span className={`diff-pill ${p.difficulty.toLowerCase()}`}>
                      {p.difficulty}
                    </span>
                    <span className="topic-pill">{p.topic}</span>
                  </div>

                  <div className="row-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      title="Edit Problem"
                      onClick={() => handleOpenEdit(p)}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn danger"
                      title="Delete Problem"
                      onClick={() => handleDelete(p.id, p.title)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="dsa-card-title-row">
                  <h4>{p.title}</h4>
                  {p.problem_url && (
                    <a
                      href={p.problem_url}
                      target="_blank"
                      rel="noreferrer"
                      className="icon-btn small-ext"
                      title="Open in new tab"
                    >
                      <ExternalLink size={13} />
                    </a>
                  )}
                </div>

                <div className="dsa-card-meta">
                  <select
                    className={`status-dropdown-pill ${p.status.toLowerCase().replace(/\s+/g, "-")}`}
                    value={p.status}
                    onChange={(e) => handleQuickStatusChange(p, e.target.value as DsaStatus)}
                  >
                    <option value="To Do">To Do</option>
                    <option value="Attempted">Attempted</option>
                    <option value="Solved">Solved</option>
                    <option value="Revisit">Revisit</option>
                    <option value="Need Revision">Need Revision</option>
                  </select>

                  <div className="dsa-card-timing">
                    {p.time_spent_minutes > 0 && (
                      <span className="time-badge">
                        <Clock size={11} /> {p.time_spent_minutes}m
                      </span>
                    )}
                    {p.solved_at && (
                      <span className="solved-date-tag">
                        <Check size={11} /> {formatSolvedDate(p.solved_at)}
                      </span>
                    )}
                  </div>
                </div>

                {(p.notes || p.code_snippet) && (
                  <div className="dsa-card-expand">
                    <button
                      type="button"
                      className="notes-preview-btn"
                      onClick={() => setExpandedRowId(isExpanded ? null : p.id)}
                    >
                      <BookOpen size={11} />
                      <span>{isExpanded ? "Hide notes & code" : "Notes & code snippet"}</span>
                      {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                    </button>
                    {isExpanded && (
                      <div className="dsa-expanded-box">
                        {p.notes && <p className="card-notes-text">{p.notes}</p>}
                        {p.code_snippet && (
                          <pre className="card-code-text">{p.code_snippet}</pre>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {filteredProblems.length === 0 && (
            <div className="panel empty-state" style={{ gridColumn: "1 / -1" }}>
              <div className="empty-icon-wrap">
                <Code2 size={24} />
              </div>
              <b>No coding problems found</b>
              <span>Try adjusting your search filters or add a new problem.</span>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <DsaProblemModal
          initial={editingProblem}
          onClose={() => {
            setIsModalOpen(false);
            setEditingProblem(null);
          }}
          onSave={async (saved) => {
            try {
              await onSaveProblem(saved);
              setIsModalOpen(false);
              setEditingProblem(null);
            } catch {
              // Keep the editor open so the user can retry after a save failure.
            }
          }}
        />
      )}
    </section>
  );
}
