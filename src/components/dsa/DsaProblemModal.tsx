import { useState } from "react";
import { X, Code2, ExternalLink, Calendar, Clock, BookOpen } from "lucide-react";
import type { DsaProblem, DsaDifficulty, DsaPlatform, DsaStatus, DsaTopic } from "../../types";
import { format } from "date-fns";

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

interface DsaProblemModalProps {
  initial: DsaProblem | null;
  onClose: () => void;
  onSave: (problem: DsaProblem) => void;
}

export function DsaProblemModal({ initial, onClose, onSave }: DsaProblemModalProps) {
  const [title, setTitle] = useState(initial?.title || "");
  const [platform, setPlatform] = useState<string>(initial?.platform || "LeetCode");
  const [problemUrl, setProblemUrl] = useState(initial?.problem_url || "");
  const [difficulty, setDifficulty] = useState<DsaDifficulty>(initial?.difficulty || "Medium");
  const [topic, setTopic] = useState<DsaTopic>(initial?.topic || "Arrays");
  const [status, setStatus] = useState<DsaStatus>(initial?.status || "To Do");
  const [timeSpent, setTimeSpent] = useState<string>(
    initial?.time_spent_minutes !== undefined ? String(initial.time_spent_minutes) : "0"
  );
  const [solvedAt, setSolvedAt] = useState<string>(
    initial?.solved_at
      ? initial.solved_at.slice(0, 10)
      : initial?.status === "Solved"
      ? format(new Date(), "yyyy-MM-dd")
      : ""
  );
  const [notes, setNotes] = useState(initial?.notes || "");
  const [codeSnippet, setCodeSnippet] = useState(initial?.code_snippet || "");

  const handleStatusChange = (newStatus: DsaStatus) => {
    if (newStatus === "Solved" && status !== "Solved") {
      setSolvedAt(format(new Date(), "yyyy-MM-dd"));
    }
    setStatus(newStatus);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const finalSolvedAt: string | null = status === "Solved"
      ? (solvedAt ? new Date(solvedAt).toISOString() : initial?.solved_at || new Date().toISOString())
      : initial?.solved_at || null;

    onSave({
      id: initial?.id || crypto.randomUUID(),
      title: title.trim(),
      platform,
      problem_url: problemUrl.trim(),
      difficulty,
      topic,
      status,
      time_spent_minutes: Math.max(0, parseInt(timeSpent, 10) || 0),
      solved_at: finalSolvedAt,
      notes: notes.trim(),
      code_snippet: codeSnippet.trim()
    });
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="modal dsa-modal" onSubmit={handleSubmit}>
        <div className="modal-head">
          <div className="dsa-modal-title">
            <div className="dsa-title-icon">
              <Code2 size={18} />
            </div>
            <div>
              <h3>{initial ? "Edit Coding Problem" : "Add Coding Problem"}</h3>
              <p className="modal-subtitle">Track algorithm solutions, notes, and revision status.</p>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body-scroll">
          <label className="field">
            <span>Problem Title *</span>
            <input
              autoFocus
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Two Sum, 3Sum, Trapping Rain Water..."
            />
          </label>

          <div className="form-grid">
            <label className="field">
              <span>Platform</span>
              <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Difficulty</span>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as DsaDifficulty)}
                className={`difficulty-select ${difficulty.toLowerCase()}`}
              >
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span>Problem URL</span>
            <div className="input-with-action">
              <input
                type="url"
                value={problemUrl}
                onChange={(e) => setProblemUrl(e.target.value)}
                placeholder="https://leetcode.com/problems/..."
              />
              {problemUrl && (
                <a
                  href={problemUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="icon-btn small-action"
                  title="Open Problem"
                >
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
          </label>

          <div className="form-grid">
            <label className="field">
              <span>Topic</span>
              <select value={topic} onChange={(e) => setTopic(e.target.value as DsaTopic)}>
                {TOPICS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Status</span>
              <select
                value={status}
                onChange={(e) => handleStatusChange(e.target.value as DsaStatus)}
                className="status-select"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="form-grid">
            <label className="field">
              <span className="field-label-row">
                <Calendar size={13} /> Solved Date
              </span>
              <input
                type="date"
                value={solvedAt}
                onChange={(e) => setSolvedAt(e.target.value)}
                placeholder="YYYY-MM-DD"
              />
            </label>

            <label className="field">
              <span className="field-label-row">
                <Clock size={13} /> Time Spent (minutes)
              </span>
              <input
                type="number"
                min="0"
                step="5"
                value={timeSpent}
                onChange={(e) => setTimeSpent(e.target.value)}
                placeholder="e.g. 25"
              />
            </label>
          </div>

          <label className="field">
            <span className="field-label-row">
              <BookOpen size={13} /> Notes & Approach / Intuition
            </span>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Key pattern (e.g. two-pointer opposite ends), time/space complexity O(N), edge cases..."
            />
          </label>

          <label className="field">
            <span className="field-label-row">
              <Code2 size={13} /> Code Snippet / Key Function (Optional)
            </span>
            <textarea
              rows={4}
              className="code-textarea"
              value={codeSnippet}
              onChange={(e) => setCodeSnippet(e.target.value)}
              placeholder="class Solution:&#10;    def twoSum(self, nums, target):&#10;        ..."
            />
          </label>
        </div>

        <div className="modal-actions">
          <button type="button" className="outline-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-btn" type="submit">
            {initial ? "Save Changes" : "Add Problem"}
          </button>
        </div>
      </form>
    </div>
  );
}
