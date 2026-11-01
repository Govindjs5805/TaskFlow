import { useState } from "react";
import { Plus, Pencil, Trash2, ExternalLink, GripVertical, ChevronRight, Briefcase } from "lucide-react";
import type { Application, JobStatus, ApplicationRound } from "../../types";
import { format, parseISO } from "date-fns";

interface JobKanbanProps {
  applications: Application[];
  rounds?: ApplicationRound[];
  onEdit: (app: Application) => void;
  onDelete: (id: string) => void;
  onMoveApplication: (appId: string, newStatus: JobStatus) => void;
  onAddApplication: (initialStatus?: JobStatus) => void;
  onOpenRounds?: (app: Application) => void;
}

type PipelineColumnId = "applied" | "assessment" | "interview" | "selected" | "archived";

interface PipelineColumn {
  id: PipelineColumnId;
  title: string;
  color: string;
  defaultStatus: JobStatus;
  matchingStatuses: JobStatus[];
}

const PIPELINE_COLUMNS: PipelineColumn[] = [
  {
    id: "applied",
    title: "Applied",
    color: "var(--primary)",
    defaultStatus: "Applied",
    matchingStatuses: ["Applied"]
  },
  {
    id: "assessment",
    title: "Assessment",
    color: "var(--warning)",
    defaultStatus: "Assessment Scheduled",
    matchingStatuses: ["Assessment Scheduled", "Assessment Completed"]
  },
  {
    id: "interview",
    title: "Interview",
    color: "var(--info)",
    defaultStatus: "Interview Call",
    matchingStatuses: ["Interview Call", "Technical Round", "HR Round"]
  },
  {
    id: "selected",
    title: "Selected / Offer",
    color: "var(--success)",
    defaultStatus: "Selected",
    matchingStatuses: ["Selected"]
  },
  {
    id: "archived",
    title: "Archived",
    color: "var(--muted)",
    defaultStatus: "Rejected",
    matchingStatuses: ["Rejected", "On Hold", "Withdrawn"]
  }
];

const niceDate = (s?: string | null) => (s ? format(parseISO(s), "dd MMM yyyy") : null);

export function JobKanban({
  applications,
  rounds,
  onEdit,
  onDelete,
  onMoveApplication,
  onAddApplication,
  onOpenRounds
}: JobKanbanProps) {
  const [draggedAppId, setDraggedAppId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<PipelineColumnId | null>(null);

  const getColForStatus = (status: JobStatus): PipelineColumnId => {
    const col = PIPELINE_COLUMNS.find((c) => c.matchingStatuses.includes(status));
    return col ? col.id : "applied";
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedAppId(id);
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, colId: PipelineColumnId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverCol !== colId) {
      setDragOverCol(colId);
    }
  };

  const handleDragLeave = (_e: React.DragEvent, colId: PipelineColumnId) => {
    if (dragOverCol === colId) {
      setDragOverCol(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetCol: PipelineColumn) => {
    e.preventDefault();
    const appId = e.dataTransfer.getData("text/plain") || draggedAppId;
    setDragOverCol(null);
    setDraggedAppId(null);
    if (appId) {
      const app = applications.find((a) => a.id === appId);
      if (app) {
        // If current status is already one of the matching statuses for this column, keep it, else default:
        const currentInTarget = targetCol.matchingStatuses.includes(app.status);
        const newStatus = currentInTarget ? app.status : targetCol.defaultStatus;
        onMoveApplication(appId, newStatus);
      }
    }
  };

  return (
    <div className="kanban-board pipeline-kanban" role="region" aria-label="Placement Pipeline Board">
      {PIPELINE_COLUMNS.map((col) => {
        const colApps = applications.filter((a) => col.matchingStatuses.includes(a.status));
        const isOver = dragOverCol === col.id;

        return (
          <div
            key={col.id}
            className={`kanban-column ${isOver ? "drag-over" : ""}`}
            onDragOver={(e) => handleDragOver(e, col.id)}
            onDragLeave={(e) => handleDragLeave(e, col.id)}
            onDrop={(e) => handleDrop(e, col)}
          >
            <div className="kanban-col-head">
              <div className="col-title-group">
                <span className="col-bullet" style={{ background: col.color }} />
                <h4>{col.title}</h4>
                <span className="col-count">{colApps.length}</span>
              </div>
              <button
                className="icon-btn small-btn"
                title={`Add application in ${col.title}`}
                onClick={() => onAddApplication(col.defaultStatus)}
              >
                <Plus size={15} />
              </button>
            </div>

            <div className="kanban-card-list">
              {colApps.map((a) => {
                const isCurrentDrag = draggedAppId === a.id;
                const formattedDate = niceDate(a.applied_at);
                const currentColId = getColForStatus(a.status);

                return (
                  <div
                    key={a.id}
                    className={`kanban-card job-card ${isCurrentDrag ? "is-dragging" : ""}`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, a.id)}
                    onDragEnd={() => {
                      setDraggedAppId(null);
                      setDragOverCol(null);
                    }}
                  >
                    <div className="card-top-row">
                      <div className="card-drag-handle" title="Drag across pipeline stages">
                        <GripVertical size={14} />
                      </div>
                      <span className="job-type-pill">{a.job_type}</span>
                      {a.package_lpa && (
                        <span className="package-pill">₹{a.package_lpa} LPA</span>
                      )}
                    </div>

                    <div className="job-card-main">
                      <div className="company-logo small">
                        {a.company.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="job-card-info">
                        <b className="company-name">{a.company}</b>
                        <span className="job-role-text">{a.role}</span>
                      </div>
                    </div>

                    <div className="job-card-substatus">
                      <span className={`status-pill status-${a.status.toLowerCase().replaceAll(" ", "-")}`}>
                        {a.status}
                      </span>
                    </div>

                    {a.next_step && (
                      <div className="job-next-step-box">
                        <small>Next:</small> {a.next_step}
                      </div>
                    )}

                    <div className="kanban-card-footer">
                      <span className="due-meta">
                        {formattedDate ? `Applied: ${formattedDate}` : "No date"}
                      </span>

                      <div className="row-actions">
                        {onOpenRounds && (
                          <button
                            className="soft-badge-btn"
                            title="View and manage interview rounds"
                            onClick={() => onOpenRounds(a)}
                          >
                            <Briefcase size={12} />
                            <span>
                              Rounds
                              {rounds && rounds.filter((r) => r.application_id === a.id).length > 0
                                ? ` (${rounds.filter((r) => r.application_id === a.id).length})`
                                : ""}
                            </span>
                          </button>
                        )}
                        <button
                          className="icon-btn"
                          onClick={() => onEdit(a)}
                          title="Edit application"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          className="icon-btn danger"
                          onClick={() => onDelete(a.id)}
                          title="Delete application"
                        >
                          <Trash2 size={13} />
                        </button>
                        {a.job_url && (
                          <a
                            className="icon-btn"
                            href={a.job_url}
                            target="_blank"
                            rel="noreferrer"
                            title="Job URL"
                          >
                            <ExternalLink size={13} />
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Touch / Quick-move fallback for mobile & accessible users */}
                    <div className="card-quick-move">
                      <span className="quick-move-label">Move to:</span>
                      {PIPELINE_COLUMNS.filter((c) => c.id !== currentColId).map((c) => (
                        <button
                          key={c.id}
                          className="quick-move-btn"
                          onClick={() => onMoveApplication(a.id, c.defaultStatus)}
                        >
                          {c.title}
                          <ChevronRight size={10} />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}

              {colApps.length === 0 && (
                <div className="kanban-empty-col">
                  <span>No applications</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
