import { useState } from "react";
import { Plus, Pencil, Trash2, Clock3, Check, GripVertical, ChevronRight } from "lucide-react";
import type { Task, TaskStatus } from "../../types";
import { format, parseISO } from "date-fns";

interface TaskKanbanProps {
  tasks: Task[];
  onToggle: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onMoveTask: (taskId: string, targetStatus: TaskStatus) => void;
  onAddTask: (initialStatus?: TaskStatus) => void;
}

const COLUMNS: { id: TaskStatus; title: string; color: string }[] = [
  { id: "todo", title: "To Do", color: "var(--primary)" },
  { id: "in_progress", title: "In Progress", color: "var(--warning)" },
  { id: "completed", title: "Completed", color: "var(--success)" }
];

const niceDate = (s?: string | null) => (s ? format(parseISO(s), "dd MMM yyyy") : null);

export function TaskKanban({
  tasks,
  onToggle,
  onEdit,
  onDelete,
  onMoveTask,
  onAddTask
}: TaskKanbanProps) {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<TaskStatus | null>(null);

  const getTaskStatus = (t: Task): TaskStatus => {
    if (t.status) return t.status;
    return t.completed ? "completed" : "todo";
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedTaskId(id);
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, colId: TaskStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverCol !== colId) {
      setDragOverCol(colId);
    }
  };

  const handleDragLeave = (_e: React.DragEvent, colId: TaskStatus) => {
    if (dragOverCol === colId) {
      setDragOverCol(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetStatus: TaskStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/plain") || draggedTaskId;
    setDragOverCol(null);
    setDraggedTaskId(null);
    if (taskId) {
      onMoveTask(taskId, targetStatus);
    }
  };

  return (
    <div className="kanban-board" role="region" aria-label="Tasks Kanban Board">
      {COLUMNS.map((col) => {
        const colTasks = tasks.filter((t) => getTaskStatus(t) === col.id);
        const isOver = dragOverCol === col.id;

        return (
          <div
            key={col.id}
            className={`kanban-column ${isOver ? "drag-over" : ""}`}
            onDragOver={(e) => handleDragOver(e, col.id)}
            onDragLeave={(e) => handleDragLeave(e, col.id)}
            onDrop={(e) => handleDrop(e, col.id)}
          >
            <div className="kanban-col-head">
              <div className="col-title-group">
                <span className="col-bullet" style={{ background: col.color }} />
                <h4>{col.title}</h4>
                <span className="col-count">{colTasks.length}</span>
              </div>
              <button
                className="icon-btn small-btn"
                title={`Add task to ${col.title}`}
                onClick={() => onAddTask(col.id)}
              >
                <Plus size={15} />
              </button>
            </div>

            <div className="kanban-card-list">
              {colTasks.map((t) => {
                const isCurrentDrag = draggedTaskId === t.id;
                const formattedDate = niceDate(t.due_at);
                const currentStatus = getTaskStatus(t);

                return (
                  <div
                    key={t.id}
                    className={`kanban-card ${t.completed ? "is-done" : ""} ${
                      isCurrentDrag ? "is-dragging" : ""
                    }`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, t.id)}
                    onDragEnd={() => {
                      setDraggedTaskId(null);
                      setDragOverCol(null);
                    }}
                  >
                    <div className="card-top-row">
                      <div className="card-drag-handle" title="Drag to reorder or move column">
                        <GripVertical size={14} />
                      </div>
                      <span className="category-pill">{t.category}</span>
                      <span className={`priority ${t.priority.toLowerCase()}`}>
                        {t.priority}
                      </span>
                    </div>

                    <b className="kanban-card-title">{t.title}</b>
                    {t.description && (
                      <p className="kanban-card-desc">{t.description}</p>
                    )}

                    <div className="kanban-card-footer">
                      {formattedDate ? (
                        <span className="due-meta">
                          <Clock3 size={11} />
                          {formattedDate}
                        </span>
                      ) : (
                        <span className="due-meta muted-sub">No due date</span>
                      )}

                      <div className="row-actions">
                        <button
                          className={`check-circle small ${t.completed ? "checked" : ""}`}
                          onClick={() => onToggle(t)}
                          title={t.completed ? "Mark incomplete" : "Mark complete"}
                        >
                          {t.completed && <Check size={11} />}
                        </button>
                        <button
                          className="icon-btn"
                          onClick={() => onEdit(t)}
                          title="Edit task"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          className="icon-btn danger"
                          onClick={() => onDelete(t.id)}
                          title="Delete task"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Touch / Quick-move fallback for mobile & accessible users */}
                    <div className="card-quick-move">
                      <span className="quick-move-label">Move to:</span>
                      {COLUMNS.filter((c) => c.id !== currentStatus).map((c) => (
                        <button
                          key={c.id}
                          className="quick-move-btn"
                          onClick={() => onMoveTask(t.id, c.id)}
                        >
                          {c.title}
                          <ChevronRight size={10} />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}

              {colTasks.length === 0 && (
                <div className="kanban-empty-col">
                  <span>No tasks</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
