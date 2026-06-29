-- BrickCode — student accounts (email/password auth, mandatory login).
--
-- Shifts students from anonymous/pseudonymous to authenticated accounts. Two
-- authenticated roles now exist (teacher, student), distinguished by
-- user_metadata.role. Students link to auth.users, enroll in a class via
-- join_class, and submit via submit_session_auth (resolved by auth.uid()).
-- The anonymous submit path is removed.
--
-- PRIVACY NOTE: student emails live only in auth.users (teachers cannot read it);
-- the dashboard remains pseudonym-only. This is a deliberate change from the
-- earlier "no PII / students never log in" model — see docs/architecture.md.

-- 1. Link a student row to an auth account (one account ⇒ one student row).
alter table public.students
  add column auth_user_id uuid references auth.users(id) on delete cascade;
create unique index students_auth_user_id_key on public.students(auth_user_id);

-- 2. Role-aware signup trigger: only teachers get a teachers row. Students
--    (role='student') get none — they are enrolled via join_class. Absent role
--    defaults to teacher for backward compatibility with existing teacher signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.raw_user_meta_data->>'role', 'teacher') = 'teacher' then
    insert into public.teachers (id, display_name)
    values (new.id, coalesce(new.raw_user_meta_data->>'display_name', ''))
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

-- 3. Enrollment: a signed-in student joins a class by code. DEFINER so it can
--    resolve the code (students can't read other teachers' classes) and create
--    the students row (students can't insert under RLS). Idempotent per account.
create or replace function public.join_class(p_class_code text, p_pseudonym text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_id uuid;
  v_student_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select id into v_class_id from public.classes where class_code = p_class_code;
  if v_class_id is null then
    raise exception 'invalid class code';
  end if;

  insert into public.students (class_id, pseudonym, auth_user_id)
  values (v_class_id, p_pseudonym, auth.uid())
  on conflict (auth_user_id) do update
    set class_id = excluded.class_id, pseudonym = excluded.pseudonym
  returning id into v_student_id;

  return v_student_id;
end;
$$;

-- 4. Authenticated submit: ties the session to the caller's student row
--    (resolved by auth.uid()). Same idempotent insert as the old anon RPC.
create or replace function public.submit_session_auth(p_session jsonb, p_events jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_class_id   uuid;
  v_session_id uuid;
  v_rowcount   int;
begin
  select id, class_id into v_student_id, v_class_id
  from public.students where auth_user_id = auth.uid();
  if v_student_id is null then
    raise exception 'not enrolled';
  end if;

  v_session_id := nullif(p_session->>'id', '')::uuid;
  if v_session_id is null then
    raise exception 'session id required';
  end if;

  insert into public.sessions (
    id, student_id, class_id, started_at, ended_at,
    challenge_ids, event_count, schema_version
  )
  values (
    v_session_id, v_student_id, v_class_id,
    (p_session->>'started_at')::timestamptz,
    (p_session->>'ended_at')::timestamptz,
    case when jsonb_typeof(p_session->'challenge_ids') = 'array'
         then array(select jsonb_array_elements_text(p_session->'challenge_ids'))
         else null end,
    coalesce((p_session->>'event_count')::int, jsonb_array_length(coalesce(p_events, '[]'::jsonb))),
    (p_session->>'schema_version')::int
  )
  on conflict (id) do nothing;

  get diagnostics v_rowcount = row_count;
  if v_rowcount > 0 then
    insert into public.events (
      session_id, type, t_monotonic, t_wall, challenge_id, payload, schema_version
    )
    select
      v_session_id, e->>'type', (e->>'t_monotonic')::double precision,
      (e->>'t_wall')::bigint, e->>'challenge_id', e->'payload', (e->>'schema_version')::int
    from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) as e;
  end if;

  return v_session_id;
end;
$$;

-- 5. Student RLS: a student may read ONLY their own student row (to check
--    enrollment). Sessions/events stay teacher-only for reads; student writes go
--    through the DEFINER RPC above, so no student insert/select policy is needed
--    on sessions/events.
create policy students_select_self on public.students
  for select using (auth_user_id = auth.uid());

-- 6. Remove the anonymous write path entirely (login is now mandatory).
drop function if exists public.submit_session(text, text, jsonb, jsonb);

-- Grants for the new functions: authenticated only; never public/anon.
revoke execute on function public.join_class(text, text) from public;
grant  execute on function public.join_class(text, text) to authenticated;
revoke execute on function public.submit_session_auth(jsonb, jsonb) from public;
grant  execute on function public.submit_session_auth(jsonb, jsonb) to authenticated;
