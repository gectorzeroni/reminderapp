-- Three distinct slots per user; the note remains in its original feed.
create table if not exists public.top_three_notes (
  user_id uuid not null references auth.users(id) on delete cascade,
  slot smallint not null check (slot between 1 and 3),
  note_id uuid not null references public.reminders(id) on delete cascade,
  primary key (user_id, slot),
  unique (user_id, note_id)
);
alter table public.top_three_notes enable row level security;
revoke all on public.top_three_notes from anon, authenticated;

create or replace function public.add_top_three_note(p_user_id uuid, p_note_id uuid)
returns text language plpgsql security invoker set search_path = '' as $$
declare available_slot smallint;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  if not exists (select 1 from public.reminders where id = p_note_id and user_id = p_user_id) then
    return 'not_found';
  end if;
  if exists (select 1 from public.top_three_notes where user_id = p_user_id and note_id = p_note_id) then
    return 'already_added';
  end if;
  select n::smallint into available_slot from pg_catalog.generate_series(1, 3) n
    where not exists (select 1 from public.top_three_notes where user_id = p_user_id and slot = n)
    order by n limit 1;
  if available_slot is null then return 'full'; end if;
  insert into public.top_three_notes(user_id, slot, note_id) values (p_user_id, available_slot, p_note_id);
  return 'added';
end;
$$;
revoke all on function public.add_top_three_note(uuid, uuid) from public, anon, authenticated;
grant execute on function public.add_top_three_note(uuid, uuid) to service_role;
