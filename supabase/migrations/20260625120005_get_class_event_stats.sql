-- BrickCode backend (Task B2) — server-side analytics aggregation.
--
-- Per-student summary for a class: run count, failed-challenge count, and a
-- block-type frequency map. Computed in SQL (the Data Science angle), not in the
-- browser.
--
-- SECURITY INVOKER (the default): this is a READ, so it runs as the authenticated
-- teacher and the existing owns_class RLS chain scopes every inner SELECT for
-- free. Passing another teacher's class_id yields zero rows — not a leak — so no
-- explicit ownership check is needed (unlike submit_session, which is DEFINER
-- precisely because anon has no row access).

create or replace function public.get_class_event_stats(p_class_id uuid)
returns table (
  student_id      uuid,
  pseudonym       text,
  run_count       bigint,
  failure_count   bigint,
  block_frequency jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  with st as (
    select id, pseudonym from public.students where class_id = p_class_id
  ),
  runs as (
    select s.student_id, count(*) as run_count
    from public.sessions s
    where s.class_id = p_class_id
    group by s.student_id
  ),
  fails as (
    select se.student_id, count(*) as failure_count
    from public.events e
    join public.sessions se on se.id = e.session_id
    where se.class_id = p_class_id
      and e.type = 'challenge_evaluated'
      and (e.payload->>'success') = 'false'
    group by se.student_id
  ),
  blocks as (
    select student_id, jsonb_object_agg(block_type, cnt) as block_frequency
    from (
      select se.student_id              as student_id,
             e.payload->>'blockType'    as block_type,
             count(*)                   as cnt
      from public.events e
      join public.sessions se on se.id = e.session_id
      where se.class_id = p_class_id
        and e.type = 'block_executed'
        and e.payload->>'blockType' is not null
      group by se.student_id, e.payload->>'blockType'
    ) x
    group by student_id
  )
  select
    st.id,
    st.pseudonym,
    coalesce(runs.run_count, 0),
    coalesce(fails.failure_count, 0),
    coalesce(blocks.block_frequency, '{}'::jsonb)
  from st
  left join runs   on runs.student_id   = st.id
  left join fails  on fails.student_id  = st.id
  left join blocks on blocks.student_id = st.id
  order by st.pseudonym;
$$;

revoke execute on function public.get_class_event_stats(uuid) from public;
grant  execute on function public.get_class_event_stats(uuid) to authenticated;
