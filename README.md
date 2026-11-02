# TaskFlow

TaskFlow is a responsive React + TypeScript productivity and placement tracker.

## Included
- To-do manager: create, edit, complete, delete, categories, priorities, due dates and reminder times
- Job application tracker: company, role, job type, applied date, link, package, notes and selection status
- Selection pipeline: Applied → Assessment → Interview → Selected / Rejected
- Calendar: monthly calendar view with task due dates and events
- Reminders: assessment, interview, deadline, follow-up, exam and custom reminders
- Dashboard, search, light/dark theme
- Supabase Auth and per-user cloud storage (once configured)

## Run locally
1. Install Node.js 20+.
2. Extract the project and open a terminal in this folder.
3. Run `npm install`.
4. Copy `.env.example` to `.env`.
5. Add your Supabase project URL and anon/public key to `.env`.
6. In Supabase → SQL Editor, run `supabase/schema.sql`.
7. In Supabase → Authentication → URL Configuration, add your local URL `http://localhost:5173` to allowed redirect URLs.
8. Run `npm run dev` and open the local URL shown by Vite.

## Supabase setup
Create a project at https://supabase.com. Copy the Project URL and anon/public key from Project Settings → API. Do not put a `service_role` key in a browser app.

The SQL creates `tasks`, `applications` and `events` tables with Row Level Security. Each signed-in user can access only their own records.

## Important notes
- Without `.env` credentials, the app opens in preview mode with sample data. In preview mode changes are held in React state and are not saved across refreshes.
- With Supabase configured and a user signed in, records are loaded from and saved to Supabase.
- Reminder times are stored, and in-tab reminders run while TaskFlow is open. The Reminders page can send a manual Web Push test through the authenticated `send-push` Edge Function. Scheduled background reminders are available after completing the setup below; email notifications are not configured.
- To deploy the manual push endpoint after setting `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` as Supabase Edge Function secrets, run `supabase functions deploy send-push --project-ref <PROJECT_REF>`. Its JWT verification remains enabled and its subscription queries use caller-scoped RLS.
- The calendar currently shows events and task due dates; selecting a date with entries displays their titles.

## Scheduled background Web Push

The scheduled dispatcher is a separate, server-only function. It uses UTC/database time and checks tasks, events, and application rounds every minute. It uses the existing reminder windows: tasks 10 minutes before through 5 minutes after, events 15 minutes before through 5 minutes after, and rounds 30 minutes before through 5 minutes after. Per-reminder and per-device delivery records prevent overlapping invocations from resending a successful push; transient device failures are retried with bounded backoff. The existing `send-push` function and its JWT verification are unchanged.

Complete these steps in order:

1. Confirm `supabase/schema.sql` and `supabase/migrations_v2.sql` have already been applied so the existing reminder tables and `push_subscriptions` table exist.
2. In Supabase Dashboard → Database → Extensions, enable `pg_cron`, `pg_net`, and Supabase Vault if they are not already enabled.
3. In Supabase Dashboard → Edge Functions → Secrets, add `CRON_SECRET` using at least 32 random bytes encoded as a URL-safe token with no whitespace. Keep the existing `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` secrets. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the Edge Function runtime; never put that key in Vercel or browser code.
4. Deploy the new function:

   ```sh
   supabase functions deploy dispatch-scheduled-reminders --project-ref <PROJECT_REF>
   ```

   `supabase/config.toml` disables gateway JWT verification for this function only because it authenticates with the dedicated `x-cron-secret` header. The handler rejects requests without the matching `CRON_SECRET`. The manual `send-push` function keeps JWT verification enabled.
5. In Supabase Dashboard → Database → Vault, add these two named secrets:

   - `taskflow_dispatch_function_url` = `https://<PROJECT_REF>.supabase.co/functions/v1/dispatch-scheduled-reminders`
   - `taskflow_cron_secret` = the same value configured as the Edge Function's `CRON_SECRET`

   Keep both values in Vault. The SQL migration contains neither value.
6. Review and run `supabase/migrations/20261102000000_scheduled_web_push_reminders.sql` in the Supabase SQL Editor using the `postgres` role. It creates the tracking tables and server-only RPCs, adds reminder-time indexes, and creates or updates the named every-minute Cron job. It does not alter existing reminder or subscription records.
7. Check Supabase Cron job history and Edge Function logs after setup. `pg_net` queues request headers until the HTTP request is sent, so restrict direct database login access and rotate `CRON_SECRET` if it is exposed.

Users must grant browser notification permission and register at least one push device in TaskFlow. Browser permission can later be revoked, and browser, device, or operating-system notification settings may suppress delivery. Web Push delivery is best effort and is not guaranteed.
