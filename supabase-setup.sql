-- Run once in a NEW Supabase project's SQL Editor. No credentials or user data.
begin;
create table public.workday_agendas (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  constraint workday_payload_valid check (
    payload->>'version' = '1' and jsonb_typeof(payload->'tasks') = 'array'
    and jsonb_array_length(payload->'tasks') <= 5000
    and octet_length(payload::text) <= 10485760
  )
);
alter table public.workday_agendas enable row level security;
revoke all on public.workday_agendas from anon, authenticated;
grant select, insert, update on public.workday_agendas to authenticated;
create policy workday_read_own on public.workday_agendas for select to authenticated
  using ((select auth.uid()) = user_id);
create policy workday_insert_own on public.workday_agendas for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy workday_update_own on public.workday_agendas for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Compare-and-swap inside a database transaction. Empty result = stale revision.
create function public.save_workday_agenda(expected_revision bigint, new_payload jsonb)
returns table(revision bigint)
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Login required'; end if;
  if expected_revision = 0 then
    return query insert into public.workday_agendas as a (user_id, payload, revision)
      values (auth.uid(), new_payload, 1)
      on conflict (user_id) do nothing returning a.revision;
  else
    return query update public.workday_agendas as a
      set payload = new_payload, revision = a.revision + 1, updated_at = now()
      where a.user_id = auth.uid() and a.revision = expected_revision returning a.revision;
  end if;
end;
$$;
revoke all on function public.save_workday_agenda(bigint, jsonb) from public, anon;
grant execute on function public.save_workday_agenda(bigint, jsonb) to authenticated;
commit;
