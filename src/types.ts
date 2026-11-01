export type Priority = "Low" | "Medium" | "High";

export type TaskStatus = "todo" | "in_progress" | "completed";

export type JobStatus =
  | "Applied" | "Assessment Scheduled" | "Assessment Completed"
  | "Interview Call" | "Technical Round" | "HR Round"
  | "Selected" | "Rejected" | "On Hold" | "Withdrawn";

export type Task = {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: Priority;
  due_at: string | null;
  reminder_at: string | null;
  completed: boolean;
  status?: TaskStatus;
  completed_at?: string | null;
  position?: number;
  created_at?: string;
};

export type RoundType =
  | "Online Assessment"
  | "Technical Round 1"
  | "Technical Round 2"
  | "System Design"
  | "Managerial"
  | "HR Round"
  | "Other";

export type RoundStatus =
  | "Scheduled"
  | "In Progress"
  | "Cleared"
  | "Rejected"
  | "Pending Result"
  | "Waived";

export type ApplicationRound = {
  id: string;
  application_id: string;
  user_id?: string;
  round_type: RoundType;
  round_name: string;
  scheduled_at: string | null;
  platform: string;
  meeting_link: string;
  interviewer?: string;
  status: RoundStatus;
  score: string;
  feedback: string;
  notes: string;
  created_at?: string;
  updated_at?: string;
};

export type Application = {
  id: string;
  company: string;
  role: string;
  job_type: string;
  applied_at: string | null;
  job_url: string;
  status: JobStatus;
  package_lpa: number | null;
  next_step: string;
  notes: string;
  rounds?: ApplicationRound[];
};

export type EventItem = {
  id: string;
  title: string;
  event_type: string;
  starts_at: string;
  reminder_at: string | null;
  application_id: string | null;
  notes: string;
};

export type DsaDifficulty = "Easy" | "Medium" | "Hard";
export type DsaStatus = "To Do" | "Attempted" | "Solved" | "Revisit" | "Need Revision";
export type DsaPlatform = "LeetCode" | "GeeksforGeeks" | "HackerRank" | "Codeforces" | "Other";
export type DsaTopic =
  | "Arrays"
  | "Strings"
  | "Hashing"
  | "Two Pointers"
  | "Sliding Window"
  | "Binary Search"
  | "Linked Lists"
  | "Stacks"
  | "Queues"
  | "Trees"
  | "Graphs"
  | "Dynamic Programming"
  | "Greedy"
  | "Backtracking"
  | "SQL"
  | "Other";

export type DsaProblem = {
  id: string;
  user_id?: string;
  title: string;
  platform: string;
  problem_url: string;
  difficulty: DsaDifficulty;
  topic: DsaTopic;
  status: DsaStatus;
  time_spent_minutes: number;
  solved_at: string | null;
  notes: string;
  code_snippet: string;
  created_at?: string;
  updated_at?: string;
};

export type PushSubscriptionRecord = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  created_at?: string;
};
