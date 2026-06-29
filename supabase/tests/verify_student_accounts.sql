-- Verifies the student-accounts model. Run inside the db container; rolled back.
begin;

-- Two auth users: a teacher and a student (role in metadata drives the trigger).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
 ('00000000-0000-0000-0000-000000000000','11111111-1111-1111-1111-111111111111',
  'authenticated','authenticated','teacher@example.com','x', now(), now(), now(), '{}',
  '{"display_name":"Teacher","role":"teacher"}'),
 ('00000000-0000-0000-0000-000000000000','22222222-2222-2222-2222-222222222222',
  'authenticated','authenticated','kid@example.com','x', now(), now(), now(), '{}',
  '{"role":"student"}');

do $$ begin
  if (select count(*) from public.teachers) <> 1 then raise exception 'FAIL: trigger should make exactly 1 teacher (student excluded)'; end if;
  raise notice 'PASS: role-aware trigger — teacher row created, student excluded';
end $$;

-- Teacher creates a class.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
insert into public.classes (name) values ('Class A');
select class_code as code from public.classes limit 1 \gset
reset role;

-- Student joins the class + submits a session (authenticated as the student).
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select public.join_class(:'code', 'Estrella7');
select public.submit_session_auth(
  json_build_object('id','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','started_at',now(),'ended_at',now(),
                    'challenge_ids',json_build_array('challenge-01'),'schema_version',1)::jsonb,
  json_build_array(json_build_object('type','block_executed','t_monotonic',1,'payload',json_build_object('blockType','robot_move_for'),'schema_version',1))::jsonb
);
-- re-submit same id → idempotent (no dup events)
select public.submit_session_auth(
  json_build_object('id','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','schema_version',1)::jsonb,
  json_build_array(json_build_object('type','dup','schema_version',1))::jsonb
);

do $$ begin
  -- student can read ONLY their own student row
  if (select count(*) from public.students) <> 1 then raise exception 'FAIL: student should see own row only'; end if;
  -- student cannot read sessions (no student select policy)
  if (select count(*) from public.sessions) <> 0 then raise exception 'FAIL: student must not read sessions'; end if;
  raise notice 'PASS: student sees own student row, cannot read sessions';
end $$;
reset role;

-- Verify (as owner) idempotency held: 1 session, 1 event.
do $$
declare s int; e int;
begin
  select count(*) into s from public.sessions where id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  select count(*) into e from public.events where session_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if s <> 1 or e <> 1 then raise exception 'FAIL: idempotency broke (sessions=%, events=%)', s, e; end if;
  raise notice 'PASS: submit_session_auth idempotent (1 session, 1 event)';
end $$;

-- Teacher reads the student (by pseudonym) + the session.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
do $$ begin
  if (select pseudonym from public.students limit 1) <> 'Estrella7' then raise exception 'FAIL: teacher should see pseudonym'; end if;
  if (select count(*) from public.sessions) <> 1 then raise exception 'FAIL: teacher should see the session'; end if;
  raise notice 'PASS: teacher sees student (pseudonym) + session';
end $$;
reset role;

-- The anonymous submit path is gone.
do $$ begin
  if exists (select 1 from pg_proc where proname='submit_session') then
    raise exception 'FAIL: anon submit_session still exists';
  end if;
  raise notice 'PASS: anonymous submit_session removed';
end $$;

\echo 'ALL STUDENT-ACCOUNT CHECKS PASSED'
rollback;
