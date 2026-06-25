-- BrickCode backend (Task B1) — controlled write path for the simulator.
--
-- The anon simulator calls submit_session() with a class code and a session
-- bundle. The function (SECURITY DEFINER, owned by the migration role) validates
-- the code, resolves/creates the pseudonymous student, and inserts the session +
-- events atomically. Anon never touches tables directly.

create or replace function public.submit_session(
  p_class_code        text,
  p_student_pseudonym text,
  p_session           jsonb,   -- { id, started_at, ended_at, challenge_ids, event_count, schema_version }
  p_events            jsonb    -- array of event objects
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_id   uuid;
  v_student_id uuid;
  v_session_id uuid;
  v_rowcount   int;
begin
  -- 1. validate the class code
  select id into v_class_id from public.classes where class_code = p_class_code;
  if v_class_id is null then
    raise exception 'invalid class code';
  end if;

  -- 2. resolve/create the pseudonymous student within the class
  insert into public.students (class_id, pseudonym)
  values (v_class_id, p_student_pseudonym)
  on conflict (class_id, pseudonym) do update set pseudonym = excluded.pseudonym
  returning id into v_student_id;

  -- 3. client-generated session id drives idempotency
  v_session_id := nullif(p_session->>'id', '')::uuid;
  if v_session_id is null then
    raise exception 'session id required';
  end if;

  insert into public.sessions (
    id, student_id, class_id, started_at, ended_at,
    challenge_ids, event_count, schema_version
  )
  values (
    v_session_id,
    v_student_id,
    v_class_id,
    (p_session->>'started_at')::timestamptz,
    (p_session->>'ended_at')::timestamptz,
    case when jsonb_typeof(p_session->'challenge_ids') = 'array'
         then array(select jsonb_array_elements_text(p_session->'challenge_ids'))
         else null end,
    coalesce(
      (p_session->>'event_count')::int,
      jsonb_array_length(coalesce(p_events, '[]'::jsonb))
    ),
    (p_session->>'schema_version')::int
  )
  on conflict (id) do nothing;

  -- 4. idempotency: if the session already existed, the insert affected 0 rows.
  --    Skip event insertion entirely so a re-sent flush is a clean no-op.
  get diagnostics v_rowcount = row_count;
  if v_rowcount > 0 then
    insert into public.events (
      session_id, type, t_monotonic, t_wall, challenge_id, payload, schema_version
    )
    select
      v_session_id,
      e->>'type',
      (e->>'t_monotonic')::double precision,
      (e->>'t_wall')::bigint,
      e->>'challenge_id',
      e->'payload',
      (e->>'schema_version')::int
    from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) as e;
  end if;

  return v_session_id;
end;
$$;

-- ── Grants / lockdown ───────────────────────────────────────────────────────
-- Anon (the simulator) gets ZERO table privileges — belt-and-suspenders on top
-- of RLS. Its only reach into the backend is the RPC below.
revoke all on all tables in schema public from anon;

-- The RPC must be callable ONLY through our intended path. Lock it down, then
-- grant execute to anon (simulator) and authenticated (teacher, harmless).
revoke all on function public.submit_session(text, text, jsonb, jsonb) from public;
grant execute on function public.submit_session(text, text, jsonb, jsonb) to anon, authenticated;
