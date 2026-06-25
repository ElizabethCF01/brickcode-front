-- BrickCode backend (Task B1) — core relational schema.
--
-- Privacy story: teachers own classes; students are PSEUDONYMOUS (no PII, ever);
-- sessions + their events belong to a student within a class. The simulator
-- (anon) never touches these tables directly — it writes through the
-- submit_session RPC (see later migration). Reads are teacher-only via RLS.

-- Teachers map 1:1 to Supabase Auth users. A trigger (see auth migration)
-- creates this row automatically on signup.
create table public.teachers (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

create table public.classes (
  id         uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  name       text not null,
  class_code text not null unique,
  created_at timestamptz not null default now()
);

create table public.students (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.classes(id) on delete cascade,
  pseudonym  text not null,   -- pseudonymous label ONLY — NEVER real names / PII
  created_at timestamptz not null default now(),
  -- lets the submit_session RPC upsert a student by (class, pseudonym)
  unique (class_id, pseudonym)
);

create table public.sessions (
  id             uuid primary key,   -- CLIENT-generated (no default) → idempotency key
  student_id     uuid not null references public.students(id) on delete cascade,
  class_id       uuid not null references public.classes(id) on delete cascade,
  started_at     timestamptz,
  ended_at       timestamptz,
  challenge_ids  text[],
  event_count    int,
  schema_version int
);

create table public.events (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.sessions(id) on delete cascade,
  type           text,
  t_monotonic    double precision,
  t_wall         bigint,
  challenge_id   text,
  payload        jsonb,
  schema_version int
);

create index events_session_id_idx  on public.events(session_id);
create index sessions_student_id_idx on public.sessions(student_id);
create index sessions_class_id_idx   on public.sessions(class_id);
create index students_class_id_idx   on public.students(class_id);
