export type Priority = "Low" | "Medium" | "High";
export type JobStatus =
  | "Applied" | "Assessment Scheduled" | "Assessment Completed"
  | "Interview Call" | "Technical Round" | "HR Round"
  | "Selected" | "Rejected" | "On Hold" | "Withdrawn";

export type Task = {
  id: string; title: string; description: string; category: string;
  priority: Priority; due_at: string | null; reminder_at: string | null;
  completed: boolean; created_at?: string;
};
export type Application = {
  id: string; company: string; role: string; job_type: string;
  applied_at: string | null; job_url: string; status: JobStatus;
  package_lpa: number | null; next_step: string; notes: string;
};
export type EventItem = {
  id: string; title: string; event_type: string; starts_at: string;
  reminder_at: string | null; application_id: string | null; notes: string;
};
