-- BrickCode backend (Task B1) — Row Level Security.
--
-- Posture: every table denies by default. Teachers (authenticated) reach only
-- their own data, scoped through the class-ownership chain. There are NO anon
-- policies anywhere — the simulator's only reach is the submit_session RPC.

-- security-definer helper: "does the current teacher own this class?"
-- Runs as owner so the lookup bypasses RLS (avoids recursive policy evaluation)
-- while still keying off auth.uid().
create or replace function public.owns_class(p_class_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.classes c
    where c.id = p_class_id and c.teacher_id = auth.uid()
  );
$$;

-- Used inside the RLS policies below (evaluated as authenticated). EXECUTE
-- defaults to PUBLIC and this is PostgREST-callable, so lock it down: anon must
-- not be able to call it directly (its only callable function is submit_session).
revoke execute on function public.owns_class(uuid) from public;
grant  execute on function public.owns_class(uuid) to authenticated;

alter table public.teachers enable row level security;
alter table public.classes  enable row level security;
alter table public.students enable row level security;
alter table public.sessions enable row level security;
alter table public.events   enable row level security;

-- Table privileges: the teacher (authenticated) gets row-level access that the
-- policies below then scope to their own data. (Granted explicitly rather than
-- relying on implicit default privileges, so the backend is self-contained and
-- reproducible.) Anon is granted nothing here — its only path is the RPC.
grant select, update         on public.teachers to authenticated;
grant select, insert, update on public.classes  to authenticated;
grant select, insert, update on public.students to authenticated;
grant select, insert, update on public.sessions to authenticated;
grant select, insert, update on public.events   to authenticated;

-- teachers: a teacher reads/updates only their own row
create policy teachers_select_own on public.teachers
  for select using (id = auth.uid());
create policy teachers_update_own on public.teachers
  for update using (id = auth.uid()) with check (id = auth.uid());

-- classes
create policy classes_select_own on public.classes
  for select using (teacher_id = auth.uid());
create policy classes_insert_own on public.classes
  for insert with check (teacher_id = auth.uid());
create policy classes_update_own on public.classes
  for update using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

-- students (scoped by owning class)
create policy students_select_own on public.students
  for select using (public.owns_class(class_id));
create policy students_insert_own on public.students
  for insert with check (public.owns_class(class_id));
create policy students_update_own on public.students
  for update using (public.owns_class(class_id)) with check (public.owns_class(class_id));

-- sessions (scoped by owning class)
create policy sessions_select_own on public.sessions
  for select using (public.owns_class(class_id));
create policy sessions_insert_own on public.sessions
  for insert with check (public.owns_class(class_id));
create policy sessions_update_own on public.sessions
  for update using (public.owns_class(class_id)) with check (public.owns_class(class_id));

-- events (scoped through the parent session's class)
create policy events_select_own on public.events
  for select using (
    exists (
      select 1 from public.sessions s
      where s.id = events.session_id and public.owns_class(s.class_id)
    )
  );
create policy events_insert_own on public.events
  for insert with check (
    exists (
      select 1 from public.sessions s
      where s.id = events.session_id and public.owns_class(s.class_id)
    )
  );
create policy events_update_own on public.events
  for update using (
    exists (
      select 1 from public.sessions s
      where s.id = events.session_id and public.owns_class(s.class_id)
    )
  );
