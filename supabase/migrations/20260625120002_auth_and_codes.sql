-- BrickCode backend (Task B1) — teacher bootstrap + class-code generation.

-- Auto-create a teachers row whenever a new Auth user signs up, so "create a
-- teacher account" immediately yields a usable, RLS-scoped teacher record.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.teachers (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Generate a short, human-readable, collision-free class code. Excludes
-- visually ambiguous characters (0/O, 1/I/L) so kids can type it reliably.
-- SECURITY DEFINER so the uniqueness check sees ALL classes (the class_code
-- UNIQUE constraint is global), not just the caller's RLS-visible rows.
create or replace function public.gen_class_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
  i int;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.classes where class_code = code);
  end loop;
  return code;
end;
$$;

-- Make class creation effortless for the teacher: teacher_id defaults to the
-- caller, class_code is auto-generated. RLS still enforces teacher_id = auth.uid().
alter table public.classes alter column teacher_id set default auth.uid();
alter table public.classes alter column class_code set default public.gen_class_code();

-- EXECUTE defaults to PUBLIC (which anon belongs to), and these functions are
-- PostgREST-callable. Lock them to the roles that actually need them so the anon
-- simulator's ONLY callable function is submit_session.
--   gen_class_code: invoked in the caller's context via the class_code default,
--                   so the teacher (authenticated) needs it.
--   handle_new_user: a trigger function — no role should call it directly.
revoke execute on function public.gen_class_code() from public;
grant  execute on function public.gen_class_code() to authenticated;
revoke execute on function public.handle_new_user() from public;
