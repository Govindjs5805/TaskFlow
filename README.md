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
- Reminder times are stored, and upcoming dates are shown in the app. This starter version does not yet send background push notifications or email notifications. Those require a service worker/notification permission and a scheduled backend function (for example Supabase Edge Functions + cron).
- The calendar currently shows events and task due dates; selecting a date with entries displays their titles.
