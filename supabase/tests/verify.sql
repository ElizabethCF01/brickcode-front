-- BrickCode backend (Task B1) — acceptance verification.
--
-- Run against the local stack:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/verify.sql
--
-- Exercises every B1 acceptance criterion by simulating roles with set role +
-- request.jwt.claims (so auth.uid() resolves), all inside ONE transaction that
-- is rolled back at the end — re-runnable without residue. Any failed assertion
-- aborts with a clear message (ON_ERROR_STOP).

begin;

-- ── Setup: two teachers via auth.users (exercises handle_new_user trigger) ────
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
values
 ('00000000-0000-0000-0000-000000000000','11111111-1111-1111-1111-111111111111',
  'authenticated','authenticated','teacherA@example.com','x',
  now(), now(), now(), '{}', '{"display_name":"Teacher A"}'),
 ('00000000-0000-0000-0000-000000000000','22222222-2222-2222-2222-222222222222',
  'authenticated','authenticated','teacherB@example.com','x',
  now(), now(), now(), '{}', '{"display_name":"Teacher B"}');

do $$ begin
  if (select count(*) from public.teachers
        where id in ('11111111-1111-1111-1111-111111111111',
                     '22222222-2222-2222-2222-222222222222')) <> 2 then
    raise exception 'FAIL: handle_new_user trigger did not create teacher rows';
  end if;
  raise notice 'PASS: trigger created teacher rows on signup';
end $$;

-- ── Teacher A creates a class (tests teacher_id + class_code defaults) ────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

insert into public.classes (name) values ('Class A');

select class_code as code_a
  from public.classes
  where teacher_id = '11111111-1111-1111-1111-111111111111'
  limit 1 \gset

\echo 'class created with auto class_code:' :'code_a'
-- assert length 6 (psql vars are not interpolated inside DO blocks, so guard in
-- plain SQL: a wrong length divides by zero → ON_ERROR_STOP aborts the run)
select case when length(:'code_a') = 6 then 1 else 1/0 end as class_code_len_ok;

reset role;

-- ── Simulator (anon): RPC happy path ─────────────────────────────────────────
set local role anon;
select set_config('request.jwt.claims', NULL, true);

select public.submit_session(
  :'code_a',
  'pupil-1',
  json_build_object('id','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                    'started_at', now(), 'ended_at', now(),
                    'challenge_ids', json_build_array('challenge-01'),
                    'schema_version', 1)::jsonb,
  json_build_array(
    json_build_object('type','program_run_ended','t_monotonic',1.0,'t_wall',1700000000000::bigint,'schema_version',1),
    json_build_object('type','motor_set_speed','t_monotonic',0.5,'payload',json_build_object('port','A','speed',50),'schema_version',1)
  )::jsonb
) as sid \gset

\echo 'PASS: submit_session returned session id' :'sid'

-- ── Invalid class code fails cleanly ─────────────────────────────────────────
do $$ begin
  begin
    perform public.submit_session('ZZZZZZ','pupil-x',
      '{"id":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","schema_version":1}'::jsonb, '[]'::jsonb);
    raise exception 'FAIL: expected invalid class code error, none raised';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'invalid class code' then raise; end if;
      raise notice 'PASS: invalid class code rejected (%)', sqlerrm;
  end;
end $$;

-- ── Idempotency: re-send the SAME session id → no duplicates ──────────────────
select public.submit_session(
  :'code_a', 'pupil-1',
  json_build_object('id','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                    'started_at', now(), 'schema_version', 1)::jsonb,
  json_build_array(json_build_object('type','should_not_duplicate','schema_version',1))::jsonb
);

reset role;

do $$
declare s_count int; e_count int;
begin
  select count(*) into s_count from public.sessions
    where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  select count(*) into e_count from public.events
    where session_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if s_count <> 1 then raise exception 'FAIL: duplicate sessions (%).', s_count; end if;
  if e_count <> 2 then raise exception 'FAIL: events not idempotent (% , expected 2)', e_count; end if;
  raise notice 'PASS: idempotent re-send → 1 session, 2 events (no duplicates)';
end $$;

-- ── Anon cannot read tables (grants revoked + no policy) ──────────────────────
set local role anon;
select set_config('request.jwt.claims', NULL, true);
do $$
declare n int;
begin
  begin
    execute 'select count(*) from public.sessions' into n;
    if n <> 0 then raise exception 'FAIL: anon read % session rows', n; end if;
    raise notice 'PASS: anon select sessions returned 0 rows';
  exception when insufficient_privilege then
    raise notice 'PASS: anon select sessions denied (insufficient_privilege)';
  end;
end $$;
-- ── Anon's ONLY callable function is submit_session ──────────────────────────
set local role anon;
select set_config('request.jwt.claims', NULL, true);
do $$ begin
  begin
    perform public.gen_class_code();
    raise exception 'FAIL: anon was able to call gen_class_code';
  exception when insufficient_privilege then
    raise notice 'PASS: anon cannot call gen_class_code (insufficient_privilege)';
  end;
  begin
    perform public.owns_class('00000000-0000-0000-0000-000000000000');
    raise exception 'FAIL: anon was able to call owns_class';
  exception when insufficient_privilege then
    raise notice 'PASS: anon cannot call owns_class (insufficient_privilege)';
  end;
end $$;
reset role;

-- ── Teacher isolation: A sees own data, B sees none of A's ───────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.sessions) < 1 then
    raise exception 'FAIL: teacher A cannot see their own session';
  end if;
  if (select count(*) from public.events) < 2 then
    raise exception 'FAIL: teacher A cannot see their own events';
  end if;
  raise notice 'PASS: teacher A sees own sessions + events';
end $$;

select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.classes)  <> 0 then raise exception 'FAIL: teacher B sees A''s classes';  end if;
  if (select count(*) from public.students) <> 0 then raise exception 'FAIL: teacher B sees A''s students'; end if;
  if (select count(*) from public.sessions) <> 0 then raise exception 'FAIL: teacher B sees A''s sessions'; end if;
  if (select count(*) from public.events)   <> 0 then raise exception 'FAIL: teacher B sees A''s events';   end if;
  raise notice 'PASS: teacher B is fully isolated from teacher A';
end $$;
reset role;

\echo '──────────────────────────────────────────────'
\echo 'ALL B1 ACCEPTANCE CHECKS PASSED'
\echo '──────────────────────────────────────────────'

rollback;
