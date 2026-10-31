# Laneway Education — Staff & Student Portal

An internal portal for trainer rosters, announcements, notifications and week-by-week class content plans.
**Demo rebuild:** every person, email and record in the seed data is fictional.

React + TypeScript + Vite · Tailwind CSS v4 + shadcn/ui · TanStack Query · Tiptap ·
Node API (Hono) · **plain PostgreSQL** with row-level security.

## Quick start (local)

Requires Node 24+ and Docker (for the local Postgres).

```bash
npm install
cp .env.example .env
npm run db:up      # Postgres 17 on port 5433 (docker-compose.yml)
npm run db:reset   # create the schema and load the demo data
npm run dev        # API on :8787 + web on http://localhost:5173
```

Already have Postgres? Skip `db:up` and point `DATABASE_URL` in `.env` at it.

The login page has **demo login buttons**. All demo accounts use the password `LanewayDemo2026!`.

| Role    | Email                 | Person          |
|---------|-----------------------|-----------------|
| Admin   | admin@example.com     | Grace Holloway  |
| Trainer | trainer@example.com   | Marcus Webb     |
| Student | student@example.com   | Lucas Pereira   |

The other 4 trainers and 39 students follow the pattern `first.last@example.com`.

| Script | What it does |
|---|---|
| `npm run dev` | API server (auto-restarts) and Vite dev server, with `/api` proxied to the API |
| `npm run build` / `npm start` | Production build, then one Node process serving the API and `dist/` |
| `npm run build:vercel` | Build, migrate and package for Vercel (see below) |
| `npm run db:migrate` | Apply pending SQL migrations from `db/migrations` |
| `npm run db:seed` / `db:reset` | Load the demo data / drop everything, migrate and seed |
| `npm run test:rls` | 58 access-control checks through the API (run on fresh seed data) |
| `npm run user:password -- <email>` | Set a user's password from the terminal (hidden input, stored as a bcrypt hash) |

## Deploying for free

The app is one Node process plus a Postgres database, so it runs on any host that can run Node or a
Docker image. On startup it applies migrations, and with `SEED_IF_EMPTY=true` it loads the demo data
into an empty database.

**Environment variables:** `DATABASE_URL` (required), `JWT_SECRET` (required in production, a long
random string), `PORT` (set by most hosts), `SEED_IF_EMPTY`, `MIGRATE_ON_START` (default on).
For email invites: `RESEND_API_KEY` and `MAIL_FROM` (see **Email invites** below), and optionally
`APP_URL` (the sign-in link's base, defaults to the site the admin is using).

### Email invites (Resend)

Admins invite people from **Users & roles → Invite user** (or re-send with the envelope icon). The
person gets an email with a temporary password valid for 7 days; when they first sign in they must
choose their own password before anything else works (the API enforces it). Anyone can change their
password later from the account menu. Emails go through [Resend](https://resend.com) (free tier:
3,000 a month, 100 a day):

1. In Resend, add and verify a domain you own (**Domains → Add domain**, then add the DNS records it
   shows). Until then Resend only delivers to your own Resend account's address, from
   `onboarding@resend.dev`.
2. Create an API key (**API Keys**, "Sending access" is enough) and set `RESEND_API_KEY` to it, and
   `MAIL_FROM="Laneway Education <portal@your-domain.com>"` (in Vercel: Settings → Environment
   Variables, then redeploy).

Without these, development prints invite emails in the API's console instead of sending them, and
production shows an error rather than creating an account nobody can sign in to.

### Vercel + Neon

Vercel runs the API as a serverless function (`server/vercel.ts`). `npm run build:vercel` builds the
frontend, applies migrations, seeds an empty database and writes Vercel's Build Output
(`scripts/build-vercel.ts`). Functions can't hold a stream open, so this build sets
`VITE_NOTIFICATIONS=poll` and the bell checks for new notifications every 20 seconds instead.

1. Push this folder to GitHub, then in [Vercel](https://vercel.com) choose **Add New → Project** and
   import the repo. `vercel.json` sets the install and build commands.
2. Before the first deploy, open **Storage → Neon** (free) and connect a database to the project.
   This sets `DATABASE_URL` (pooled, used by the API) and `DATABASE_URL_UNPOOLED` (direct, used
   for migrations).
3. Add environment variables `JWT_SECRET` (a long random string, e.g. from `openssl rand -hex 32`)
   and `DATABASE_POOL_SIZE=3`, plus `RESEND_API_KEY`/`MAIL_FROM` for email invites, then deploy.

Vercel's free Hobby plan is for personal, non-commercial use. Preview deployments run the
migrations too, against whichever database their `DATABASE_URL` points to.

### Neon (database) + Render (app)

1. **Database:** create a free project at [neon.tech](https://neon.tech). Copy the connection string
   with **connection pooling turned off** (the host has no `-pooler`), keeping `?sslmode=require`.
   The live notification bell uses `LISTEN`, which pooled connections don't support.
2. **App:** push this folder to a GitHub repo. In [Render](https://render.com), choose
   **New → Blueprint** and select the repo; `render.yaml` sets everything up. Paste the Neon string
   into `DATABASE_URL` when prompted. `JWT_SECRET` is generated for you.
3. Open the `onrender.com` URL. The first request after 15 idle minutes takes about a minute while
   the free instance wakes up.

### Other hosts

- **Docker-based (Koyeb, Fly.io, Railway, Google Cloud Run):** deploy the `Dockerfile` and set
  the environment variables above.
- **Other free Postgres (Supabase used as plain Postgres, Aiven, Render Postgres):** any Postgres
  15+ works if the connecting user owns the database and can create roles, since the migration
  creates the `laneway_app` role. Render's free Postgres is deleted after 30 days, so Neon is the
  better long-term choice.

## Roles and security

The role lives in `profiles.role`. **Access is enforced by row-level security in Postgres**; the API
and UI only mirror it.

- **How requests run:** the API connects as the database owner but runs every request in a
  transaction that switches to the unprivileged role `laneway_app` and sets `app.user_id` to the
  signed-in user (`server/db.ts`). Policies call `app.user_id()` the way Supabase policies call
  `auth.uid()`.
- **Signed-out requests:** a restrictive policy on every table means they see nothing, even where
  another policy would allow it.
- **Passwords:** stored as bcrypt hashes (pgcrypto) in `app.credentials`, which `laneway_app` can't
  read. They are only reachable through `app.authenticate()` and the admin-only `app.create_user()`.
- **Sessions:** a signed JWT in an httpOnly, SameSite=Lax cookie, valid for 7 days.

| | Admin | Trainer | Student |
|---|---|---|---|
| Roster | All shifts, full edit | Own and covering shifts; can request cover | Sessions of enrolled classes (timetable) |
| Announcements | Post to all / course / class | Post to own classes only | Read those targeted at them |
| Notifications | Own only | Own only | Own only (can only change `read_at`) |
| Content plans | Edit all | Read all, edit own classes | Read non-draft weeks of enrolled classes |
| Users, courses, classes, enrolments | Full edit | Read | Own enrolments and classes |

- A trainer's "own classes" are classes where they're the lead trainer (`classes.trainer_id`) or hold
  a non-cancelled shift (`public.teaches_class`).
- Users can't change their own role or email (trigger `guard_profile_update`).

## How the key features work

- **Overlap blocking:** trigger `check_shift_overlap` rejects any shift that overlaps another live
  shift for the person delivering it (the cover trainer if one is assigned). The API returns it as
  HTTP 409. The shift dialog shows the same check instantly and marks busy trainers in the cover
  picker.
- **Cover:** flagging a shift sets `needs_cover`. Assigning a cover trainer sets status to `covered`
  automatically. Trainers request cover through `request_cover()`.
- **Existing overlaps:** shifts that already overlap (for example, imported with the trigger
  bypassed) are found by `roster_conflicts()` and flagged on the admin dashboard and the roster.
- **Announcement notifications:** trigger `notify_announcement` inserts one notification per
  targeted student when an announcement is published. Edits don't notify again, and deleting an
  announcement removes its notifications.
- **Realtime bell:** triggers on `notifications` call `pg_notify`. The API holds one `LISTEN`
  connection while anyone is online and forwards each event to that user's browser tabs over
  server-sent events (`/api/notifications/stream`). With nobody online the connection closes, so
  Neon can scale to zero.
- **Month view and invoices:** the roster's Month tab shows a calendar. Selecting two consecutive
  weeks and pressing **Generate invoice** opens the fortnight's invoice in Laneway's template: one
  line per class (paid hours × hourly rate, with the term weeks), a line for marked assessments, and
  the total. **Print / Save as PDF** saves it as `Invoice-Laneway-<Month>-<day>-<year>.pdf` (the
  fortnight's last day), and **Spreadsheet (.xlsx)** downloads the matching invoice spreadsheet: a
  block per week with each session's content plan topics, then extra activities, with formulas for
  every total. Cancelled sessions are left out and covered sessions go to the cover trainer. A
  class's **paid hours per session** and **name on invoices** are set under Classes & enrolments
  (paid hours default to the rostered time). Rates and invoice details (ABN, address, bank) live in
  `trainer_billing`, which only the trainer and admins can read. Trainers edit their own details;
  only admins set the hourly and per-assessment rates (Users & roles → the receipt icon). GST-
  registered trainers get 10% GST and a tax invoice.
- **Assessments:** trainers record the assessments and reassessments they mark (activity, unit,
  course, term, quantity, date) under **My assessments**. Each entry is paid on the invoice for the
  fortnight it was marked in. `marked_assessments` is private to the trainer and admins.
- **Term length:** content plans cover a 10-week term. To change it, update `TERM_WEEKS` in
  `src/lib/dates.ts` and the `content_plans_week_number_check` constraint (with a new migration).
- **Duplicate plan:** `duplicate_content_plan()` runs with the caller's permissions, so RLS decides
  which classes can be copied into. Copied weeks start as drafts.
- **Dates:** shown as DD/MM/YYYY in Melbourne time. Shift dates and times are stored as Melbourne
  wall-clock values. On weekends the roster, timetable and dashboards default to the coming week.

## Additions to the brief's data model

- `classes.trainer_id` (lead trainer) and `classes.start_date` (week 1 of term, used to map
  `week_number` to dates).
- `roster_shifts.needs_cover` and `roster_shifts.notes`.
- `app.credentials` for password hashes; `created_at` / `updated_at` timestamps where useful.

## Project layout

```
db/migrations/         schema, functions, triggers, RLS and grants (plain SQL, applied in order)
db/seed.sql            demo users plus the Term 4 2026 IT classes, rosters and content plans
server/                Node API: auth, routes, realtime (SSE), migration runner, Vercel entry
scripts/               role-by-role access test, Vercel packaging
src/auth               session context and route guards
src/hooks              data hooks (TanStack Query) and realtime subscription
src/lib/api.ts         fetch wrapper for /api
src/pages              dashboards, roster, timetable, announcements, classes, admin
src/components         layout, roster, announcements, content-plan and shadcn/ui components
```

To change the schema, add a new file such as `db/migrations/002_add_x.sql`. It's applied on the
next `npm run db:migrate` or app start, and `src/lib/types.ts` holds the matching TypeScript types.
