import { useState } from "react";
import {
  X, Plus, Calendar, Clock, ExternalLink, User, Award,
  CheckCircle2, XCircle, AlertCircle, HelpCircle, Pencil, Trash2,
  ChevronDown, ChevronUp, Layers
} from "lucide-react";
import type { Application, ApplicationRound, RoundType, RoundStatus, JobStatus } from "../../types";
import { format, parseISO } from "date-fns";

interface ApplicationRoundsModalProps {
  application: Application;
  rounds: ApplicationRound[];
  onClose: () => void;
  onSaveRound: (round: ApplicationRound) => Promise<boolean | void> | boolean | void;
  onDeleteRound: (roundId: string) => Promise<boolean | void> | boolean | void;
  onUpdateApplicationStatus?: (appId: string, status: JobStatus) => Promise<void> | void;
}

const ROUND_TYPES: RoundType[] = [
  "Online Assessment",
  "Technical Round 1",
  "Technical Round 2",
  "System Design",
  "Managerial",
  "HR Round",
  "Other"
];

const ROUND_STATUSES: RoundStatus[] = [
  "Scheduled",
  "In Progress",
  "Cleared",
  "Rejected",
  "Pending Result",
  "Waived"
];

const PLATFORMS = [
  "HackerRank",
  "CodeSignal",
  "LeetCode",
  "Google Meet",
  "Zoom",
  "Microsoft Teams",
  "In-Person",
  "Other"
];

const uid = () => crypto.randomUUID();
const dateTimeLocal = (s?: string | null) => (s ? format(parseISO(s), "yyyy-MM-dd'T'HH:mm") : "");
const localIso = (s: string) => (s ? new Date(s).toISOString() : null);

export function ApplicationRoundsModal({
  application,
  rounds,
  onClose,
  onSaveRound,
  onDeleteRound,
  onUpdateApplicationStatus
}: ApplicationRoundsModalProps) {
  const [editingRound, setEditingRound] = useState<ApplicationRound | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Form states
  const [roundType, setRoundType] = useState<RoundType>("Online Assessment");
  const [roundName, setRoundName] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [platform, setPlatform] = useState("HackerRank");
  const [meetingLink, setMeetingLink] = useState("");
  const [interviewer, setInterviewer] = useState("");
  const [status, setStatus] = useState<RoundStatus>("Scheduled");
  const [score, setScore] = useState("");
  const [feedback, setFeedback] = useState("");
  const [notes, setNotes] = useState("");

  const appRounds = rounds
    .filter((r) => r.application_id === application.id)
    .sort((a, b) => {
      if (a.scheduled_at && b.scheduled_at) {
        return +new Date(a.scheduled_at) - +new Date(b.scheduled_at);
      }
      return 0;
    });

  const openNewRoundForm = () => {
    setEditingRound(null);
    setRoundType("Online Assessment");
    setRoundName(`Round ${appRounds.length + 1}: Online Assessment`);
    setScheduledAt("");
    setPlatform("HackerRank");
    setMeetingLink("");
    setInterviewer("");
    setStatus("Scheduled");
    setScore("");
    setFeedback("");
    setNotes("");
    setIsFormOpen(true);
  };

  const openEditRoundForm = (round: ApplicationRound) => {
    setEditingRound(round);
    setRoundType(round.round_type);
    setRoundName(round.round_name);
    setScheduledAt(dateTimeLocal(round.scheduled_at));
    setPlatform(round.platform || "Google Meet");
    setMeetingLink(round.meeting_link || "");
    setInterviewer(round.interviewer || "");
    setStatus(round.status);
    setScore(round.score || "");
    setFeedback(round.feedback || "");
    setNotes(round.notes || "");
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newRound: ApplicationRound = {
      id: editingRound?.id || uid(),
      application_id: application.id,
      round_type: roundType,
      round_name: roundName.trim() || roundType,
      scheduled_at: localIso(scheduledAt),
      platform: platform.trim(),
      meeting_link: meetingLink.trim(),
      interviewer: interviewer.trim(),
      status,
      score: score.trim(),
      feedback: feedback.trim(),
      notes: notes.trim()
    };

    const saved = await onSaveRound(newRound);
    if (saved === false) return;
    setIsFormOpen(false);
    setEditingRound(null);

    // Auto-suggest updating application status if appropriate
    if (onUpdateApplicationStatus) {
      if (status === "Cleared" && roundType === "HR Round" && application.status !== "Selected") {
        if (window.confirm("You cleared the HR round! Would you like to update the application status to 'Selected'?")) {
          await onUpdateApplicationStatus(application.id, "Selected");
        }
      } else if (status === "Rejected" && application.status !== "Rejected") {
        if (window.confirm("Mark this overall application status as 'Rejected'?")) {
          await onUpdateApplicationStatus(application.id, "Rejected");
        }
      }
    }
  };

  const getStatusBadge = (st: RoundStatus) => {
    switch (st) {
      case "Cleared":
        return <span className="round-badge cleared"><CheckCircle2 size={12}/> Cleared</span>;
      case "Scheduled":
        return <span className="round-badge scheduled"><Calendar size={12}/> Scheduled</span>;
      case "In Progress":
        return <span className="round-badge in-progress"><Clock size={12}/> In Progress</span>;
      case "Rejected":
        return <span className="round-badge rejected"><XCircle size={12}/> Rejected</span>;
      case "Pending Result":
        return <span className="round-badge pending"><AlertCircle size={12}/> Pending Result</span>;
      case "Waived":
        return <span className="round-badge waived"><HelpCircle size={12}/> Waived</span>;
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal modal-lg" role="dialog" aria-modal="true" aria-label="Assessment and Interview Rounds">
        <div className="modal-head">
          <div className="rounds-header-info">
            <div className="company-logo round-logo">
              {application.company.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <h3>{application.company} — Assessment & Interview Rounds</h3>
              <p className="muted">
                {application.role} · {application.job_type} · Status: <b>{application.status}</b>
                {application.package_lpa ? ` · ₹${application.package_lpa} LPA` : ""}
              </p>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        {/* Top bar controls */}
        <div className="rounds-toolbar">
          <div className="rounds-summary-stat">
            <Layers size={16} />
            <span>
              <b>{appRounds.length}</b> {appRounds.length === 1 ? "round" : "rounds"} tracked
            </span>
            <span className="rounds-count-cleared">
              ({appRounds.filter((r) => r.status === "Cleared").length} cleared)
            </span>
          </div>

          <button
            className="primary-btn small"
            onClick={() => {
              if (isFormOpen && !editingRound) {
                setIsFormOpen(false);
              } else {
                openNewRoundForm();
              }
            }}
          >
            {isFormOpen && !editingRound ? (
              <>
                <ChevronUp size={15} /> Close Form
              </>
            ) : (
              <>
                <Plus size={15} /> Add Round
              </>
            )}
          </button>
        </div>

        {/* Add/Edit Round Form */}
        {isFormOpen && (
          <form className="round-form-panel" onSubmit={handleSubmit}>
            <div className="form-head">
              <h4>{editingRound ? `Edit: ${editingRound.round_name}` : "Add New Assessment / Interview Round"}</h4>
              <button
                type="button"
                className="icon-btn small-btn"
                onClick={() => { setIsFormOpen(false); setEditingRound(null); }}
              >
                <X size={14} />
              </button>
            </div>

            <div className="form-grid">
              <label className="field">
                <span>Round Type *</span>
                <select
                  value={roundType}
                  onChange={(e) => {
                    const val = e.target.value as RoundType;
                    setRoundType(val);
                    if (!editingRound) {
                      setRoundName(`Round ${appRounds.length + 1}: ${val}`);
                    }
                  }}
                >
                  {ROUND_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Round Name / Title *</span>
                <input
                  required
                  value={roundName}
                  onChange={(e) => setRoundName(e.target.value)}
                  placeholder="e.g. Technical Round 1: DSA & Problem Solving"
                />
              </label>

              <label className="field">
                <span>Status *</span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as RoundStatus)}
                >
                  {ROUND_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Scheduled Date & Time</span>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </label>

              <label className="field">
                <span>Platform</span>
                <input
                  list="platform-options"
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  placeholder="e.g. HackerRank, Google Meet"
                />
                <datalist id="platform-options">
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </label>

              <label className="field">
                <span>Platform URL / Meeting Link</span>
                <input
                  type="url"
                  value={meetingLink}
                  onChange={(e) => setMeetingLink(e.target.value)}
                  placeholder="https://..."
                />
              </label>

              <label className="field">
                <span>Interviewer Name / Details</span>
                <input
                  value={interviewer}
                  onChange={(e) => setInterviewer(e.target.value)}
                  placeholder="e.g. John Doe (Tech Lead)"
                />
              </label>

              <label className="field">
                <span>Score / Result</span>
                <input
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                  placeholder="e.g. 100/100, Strong Hire"
                />
              </label>
            </div>

            <label className="field">
              <span>Feedback / Questions Asked</span>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="What algorithms or concepts were asked? What feedback did you receive?"
              />
            </label>

            <label className="field">
              <span>Preparation Notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Topics to revise, reminders, key points to emphasize..."
              />
            </label>

            <div className="modal-actions">
              <button
                type="button"
                className="outline-btn"
                onClick={() => { setIsFormOpen(false); setEditingRound(null); }}
              >
                Cancel
              </button>
              <button type="submit" className="primary-btn">
                {editingRound ? "Save Changes" : "Add Round"}
              </button>
            </div>
          </form>
        )}

        {/* Chronological Timeline */}
        <div className="rounds-timeline-container">
          {appRounds.length === 0 && !isFormOpen && (
            <div className="empty-state">
              <Layers size={32} />
              <b>No rounds scheduled yet</b>
              <span>Add your first assessment or interview round to track progress step-by-step.</span>
              <button className="primary-btn small" onClick={openNewRoundForm} style={{ marginTop: 12 }}>
                <Plus size={15} /> Add first round
              </button>
            </div>
          )}

          {appRounds.length > 0 && (
            <div className="rounds-timeline">
              {appRounds.map((round, idx) => {
                const formattedDate = round.scheduled_at
                  ? format(parseISO(round.scheduled_at), "EEE, dd MMM yyyy · h:mm a")
                  : "Date not scheduled";

                return (
                  <div key={round.id} className="timeline-item">
                    {/* Step marker */}
                    <div className="timeline-marker">
                      <div className={`timeline-dot dot-${round.status.toLowerCase().replaceAll(" ", "-")}`}>
                        <span>{idx + 1}</span>
                      </div>
                      {idx < appRounds.length - 1 && <div className="timeline-connector" />}
                    </div>

                    {/* Timeline Card */}
                    <div className="timeline-card">
                      <div className="timeline-card-head">
                        <div>
                          <div className="timeline-tags">
                            <span className="round-type-tag">{round.round_type}</span>
                            {getStatusBadge(round.status)}
                          </div>
                          <h4 className="timeline-title">{round.round_name}</h4>
                        </div>

                        <div className="row-actions">
                          <button
                            className="icon-btn"
                            title="Edit Round"
                            onClick={() => openEditRoundForm(round)}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            className="icon-btn danger"
                            title="Delete Round"
                            onClick={async () => {
                              if (window.confirm(`Delete ${round.round_name}?`)) {
                                await onDeleteRound(round.id);
                              }
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Meta Information */}
                      <div className="timeline-meta-grid">
                        <div className="meta-item">
                          <Clock size={13} />
                          <span>{formattedDate}</span>
                        </div>

                        {round.platform && (
                          <div className="meta-item">
                            <span className="platform-tag">{round.platform}</span>
                            {round.meeting_link && (
                              <a
                                href={round.meeting_link}
                                target="_blank"
                                rel="noreferrer"
                                className="timeline-link"
                                title="Open meeting / test URL"
                              >
                                Join URL <ExternalLink size={12} />
                              </a>
                            )}
                          </div>
                        )}

                        {round.interviewer && (
                          <div className="meta-item">
                            <User size={13} />
                            <span>Interviewer: <b>{round.interviewer}</b></span>
                          </div>
                        )}

                        {round.score && (
                          <div className="meta-item">
                            <Award size={13} />
                            <span>Score / Verdict: <b>{round.score}</b></span>
                          </div>
                        )}
                      </div>

                      {/* Notes / Feedback */}
                      {round.feedback && (
                        <div className="timeline-detail-box feedback-box">
                          <b>Feedback / Questions:</b>
                          <p>{round.feedback}</p>
                        </div>
                      )}

                      {round.notes && (
                        <div className="timeline-detail-box notes-box">
                          <b>Preparation Notes:</b>
                          <p>{round.notes}</p>
                        </div>
                      )}

                      {/* Quick status actions */}
                      <div className="timeline-quick-actions">
                        <span className="quick-label">Set status:</span>
                        {ROUND_STATUSES.filter((s) => s !== round.status).slice(0, 4).map((s) => (
                          <button
                            key={s}
                            className="quick-status-chip"
                            onClick={async () => {
                              await onSaveRound({ ...round, status: s });
                            }}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="outline-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
