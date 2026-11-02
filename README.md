# TaskFlow

**TaskFlow** is a responsive productivity and placement management application built with React, TypeScript, and Supabase. It helps users organize daily tasks, manage job applications, track interview rounds, and receive timely reminders.

## Features

### Task Management
- Create, edit, complete, and delete tasks.
- Organize tasks using categories and priorities.
- Set due dates and reminder times.
- Track task completion.

### Job Application Tracker
- Manage company and job application details.
- Track job roles, job types, application dates, packages, links, and notes.
- Monitor application status.
- Track selection stages: Applied → Assessment → Interview → Selected / Rejected.

### Calendar
- Monthly calendar view.
- View task deadlines and scheduled events.
- Select dates to view associated entries.

### Reminders and Notifications
- Assessment, interview, deadline, follow-up, exam, and custom reminders.
- In-app reminders while TaskFlow is open.
- Manual Web Push notifications.
- Automatic scheduled background Web Push reminders through Supabase Cron.
- Per-reminder and per-device delivery tracking.

### Dashboard and UI
- Productivity dashboard and analytics.
- Search functionality.
- Light and dark themes.
- Responsive user interface.

## Tech Stack

| Technology | Purpose |
|---|---|
| React 19 | Frontend |
| TypeScript | Type safety |
| Vite | Development and build |
| Tailwind CSS / CSS | Styling |
| Supabase | Backend and database |
| PostgreSQL | Database |
| Supabase Auth | Authentication |
| Supabase Edge Functions | Server-side notification processing |
| Web Push API | Browser push notifications |
| Supabase Cron | Scheduled background execution |
| Supabase Vault | Secure storage of scheduler credentials |

## Getting Started

### Prerequisites
- Node.js 20 or later
- npm
- Supabase account

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/Govindjs5805/TaskFlow.git
   ```

2. Navigate to the project directory:

   ```bash
   cd TaskFlow
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Create a `.env` file using `.env.example`:

   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   VITE_VAPID_PUBLIC_KEY=your_vapid_public_key
   ```

5. Configure the Supabase database using the SQL files described below.

6. Start the development server:

   ```bash
   npm run dev
   ```

7. Open the local URL provided by Vite.

## Supabase Configuration

1. Create a project at [Supabase](https://supabase.com).
2. Copy the Project URL and anon/public key from Project Settings → API.
3. Add the credentials to your `.env` file.
4. Apply the required database schema and migrations.

The database uses Row Level Security (RLS) to ensure users can access only their own records.

**Security:** Never expose the Supabase service-role key in frontend code, `.env` variables prefixed with `VITE_`, or public repositories.

## Authentication Configuration

In Supabase Dashboard:

1. Navigate to Authentication → URL Configuration.
2. Set the Site URL to your deployed application URL.
3. Add the following allowed redirect URLs:

   ```text
   http://localhost:5173/**
   https://your-production-domain/**
   ```

Replace the production domain with your actual deployment URL.

## Web Push Notification Setup

TaskFlow supports manual Web Push notifications through the authenticated `send-push` Edge Function.

### 1. Configure VAPID Secrets

Generate VAPID keys and add the following secrets under Supabase → Edge Functions → Secrets:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`

The public key is also configured in the frontend environment as `VITE_VAPID_PUBLIC_KEY`.

### 2. Deploy the Manual Push Function

```bash
supabase functions deploy send-push --project-ref <PROJECT_REF>
```

Keep JWT verification enabled for this function.

The function authenticates the signed-in user and uses user-scoped access to push subscriptions.

## Automatic Scheduled Background Reminders

TaskFlow includes a separate server-side dispatcher for automatic background Web Push notifications.

Unlike in-app reminders, scheduled reminders can be processed even when the user has closed the browser, provided the browser has an active push subscription and the device/browser supports Web Push.

### Reminder Types and Time Windows

| Reminder type | Delivery window |
|---|---|
| Tasks | 10 minutes before to 5 minutes after |
| Events | 15 minutes before to 5 minutes after |
| Application rounds | 30 minutes before to 5 minutes after |

The dispatcher:
- Checks reminders every minute.
- Uses database time (UTC).
- Skips completed tasks.
- Skips application rounds marked Cleared, Rejected, or Waived.
- Tracks delivery per reminder and device.
- Prevents overlapping executions from normally sending duplicate successful notifications.
- Uses bounded retries for transient failures.
- Removes expired push subscriptions when the push provider returns 404 or 410.

### Scheduled Reminder Setup

Complete the following steps in order.

#### 1. Enable Supabase Extensions

Navigate to Database → Extensions and enable:

- `pg_cron`
- `pg_net`
- Supabase Vault (`supabase_vault`)

#### 2. Configure the CRON_SECRET

Navigate to Supabase → Edge Functions → Secrets.

Generate a cryptographically secure random secret containing at least 32 random bytes, encoded as Base64 or another supported URL-safe format.

Add:

```text
CRON_SECRET
```

Use the generated secret as its value.

Keep the value private. Do not commit it to GitHub or expose it in frontend code.

Do not replace the existing VAPID secrets.

#### 3. Deploy the Scheduled Dispatcher

Deploy the separate dispatcher function:

```bash
supabase functions deploy dispatch-scheduled-reminders --project-ref <PROJECT_REF>
```

The dispatcher is configured with gateway JWT verification disabled because it uses a dedicated `x-cron-secret` request header.

The function independently validates this header against the `CRON_SECRET` Edge Function secret.

The existing `send-push` function retains JWT verification.

#### 4. Configure Supabase Vault

Navigate to Database → Vault and create the following named secrets:

| Secret name | Value |
|---|---|
| `taskflow_dispatch_function_url` | `https://<PROJECT_REF>.supabase.co/functions/v1/dispatch-scheduled-reminders` |
| `taskflow_cron_secret` | The exact same value configured as the Edge Function's `CRON_SECRET` |

Ensure both values are correct.

The two secrets must match the dispatcher configuration. Never expose their actual values in SQL screenshots, GitHub, or frontend code.

#### 5. Apply the Scheduled Reminder Migration

Open Supabase → SQL Editor.

Review and execute:

```text
supabase/migrations/20261102000000_scheduled_web_push_reminders.sql
```

The migration creates:
- Reminder delivery tracking tables.
- Atomic reminder claiming.
- Server-side RPC functions.
- Indexes for reminder queries.
- Cleanup and retry mechanisms.
- A named Supabase Cron job scheduled to run every minute.

It does not replace existing reminder or subscription records.

Ensure the existing database schema and required tables from `supabase/schema.sql` and `supabase/migrations_v2.sql` are already applied.

#### 6. Verify the Cron Job

Run:

```sql
SELECT
  jobid,
  jobname,
  schedule,
  active
FROM cron.job;
```

The scheduled dispatcher should appear with:

```text
taskflow-dispatch-scheduled-reminders
* * * * *
true
```

#### 7. Verify Cron Execution

Run:

```sql
SELECT
  jobid,
  runid,
  status,
  start_time,
  end_time,
  return_message
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 10;
```

Successful Cron executions confirm that the scheduled database job is running.

#### 8. Verify Edge Function Requests

Run:

```sql
SELECT
  id,
  status_code,
  timed_out,
  error_msg,
  created
FROM net._http_response
ORDER BY created DESC
LIMIT 10;
```

Expected HTTP response:

```text
200
```

A successful Cron execution alone does not guarantee successful Edge Function authentication or notification delivery.

### Troubleshooting

| HTTP status | Possible issue |
|---|---|
| 200 | Dispatcher accepted the request |
| 401 | Missing or mismatched `CRON_SECRET`, or authentication failure |
| 404 | Incorrect function URL or function not deployed |
| 500 | Server-side configuration or execution error |

If the dispatcher returns 401, verify that:

- `CRON_SECRET` exists in Supabase Edge Function Secrets.
- `taskflow_cron_secret` in Vault contains the exact same value.
- The Cron request sends the `x-cron-secret` header.
- The deployed dispatcher uses the expected authentication logic.

Do not disable authentication or change the existing `send-push` function to troubleshoot scheduled reminders.

## Deployment

TaskFlow can be deployed using Vercel.

1. Connect the GitHub repository to Vercel.
2. Configure the required frontend environment variables.
3. Deploy the application.

The frontend environment must not contain service-role keys or private VAPID keys.

## Important Notes

- Without Supabase credentials, the application operates in preview mode with sample data.
- Preview-mode changes are held in React state and are not saved across refreshes.
- Signed-in users can store their records in Supabase.
- In-app reminders require the application to be open.
- Manual Web Push notifications use the authenticated `send-push` function.
- Automatic scheduled reminders require the dispatcher, Vault secrets, database migration, and Cron configuration to be correctly deployed.
- Web Push delivery is best-effort and depends on browser support, notification permission, and an active push subscription.
- Email notifications are not currently configured.

## License

This project is intended for personal productivity and placement management.
