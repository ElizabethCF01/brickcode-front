# Hosting BrickCode on a cloud Supabase project

Local dev uses `supabase start` (Docker). To run a real two-machine demo (student
simulator on one machine, teacher dashboard on another), point the app at a hosted
Supabase project. This is a guided, user-driven step — it needs your Supabase account.

## 1. Create the project
- At [supabase.com](https://supabase.com) → **New project** (free tier is fine).
- Note: the **Project URL**, the **anon (public) key**, and the **project ref** (the
  subdomain, e.g. `abcdefgh`). You also set a DB password.
- ⚠️ Never use the **service_role** key in the app or in any committed file — anon only.

## 2. Push the schema (migrations) to the cloud
From `brickcode/`:
```bash
supabase login                       # one-time, opens browser
supabase link --project-ref <ref>    # connects this repo to the cloud project
supabase db push                     # applies supabase/migrations/* to the cloud DB
```
`db push` runs the exact same checked-in migrations as local — schema, RLS,
`submit_session`, and `get_class_event_stats` — so the cloud backend is identical.

## 3. Point the app at the cloud
Set the build/runtime env (e.g. in your host's env or a `.env.production`):
```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```
The student leaves `VITE_CLASS_CODE` unset and joins via the in-app "Unirse a una
clase" screen instead.

> **Email confirmation differs from local.** Local Supabase has email confirmation
> **off** (signup → immediate session → straight into the dashboard). Hosted projects
> default it **on**, so a self-registering teacher gets "revisa tu correo" and must
> confirm before logging in. Either confirm via the emailed link, or disable
> confirmations in the project's Auth settings for a frictionless demo.

## 4. Verify
- Teacher: open the deployed app at `/dashboard`, sign up / log in, create a class.
- Student (other machine): open `/`, join with that class code, run a program.
- The teacher's dashboard shows the student's session — same as the local round-trip.

> The static app (simulator + dashboard) is one Vite build; deploy it to any static
> host (Vercel/Netlify/etc.). SPA history fallback must route unknown paths to
> `index.html` so `/dashboard` works.
