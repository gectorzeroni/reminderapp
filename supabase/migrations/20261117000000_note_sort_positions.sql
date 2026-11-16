alter table public.reminders add column if not exists sort_position double precision;

create or replace function public.reorder_note_positions(p_user_id uuid, p_note_ids uuid[], p_positions double precision[])
returns boolean language plpgsql security invoker set search_path = '' as $$
declare item_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 1));
  item_count := coalesce(pg_catalog.array_length(p_note_ids, 1), 0);
  if item_count < 1 or item_count > 5000 or item_count <> coalesce(pg_catalog.array_length(p_positions, 1), 0) then return false; end if;
  if (select count(distinct x) from pg_catalog.unnest(p_note_ids) x) <> item_count then return false; end if;
  if (select count(*) from public.reminders where user_id = p_user_id and id = any(p_note_ids)) <> item_count then return false; end if;
  if (select count(distinct feed) from public.reminders where user_id = p_user_id and id = any(p_note_ids)) <> 1 then return false; end if;
  update public.reminders r set sort_position = p_positions[v.ordinality::integer]
  from pg_catalog.unnest(p_note_ids) with ordinality as v(id, ordinality)
  where r.id = v.id and r.user_id = p_user_id;
  return true;
end;
$$;
revoke all on function public.reorder_note_positions(uuid, uuid[], double precision[]) from public, anon, authenticated;
grant execute on function public.reorder_note_positions(uuid, uuid[], double precision[]) to service_role;

create or replace function public.reorder_top_three(p_user_id uuid, p_note_ids uuid[])
returns boolean language plpgsql security invoker set search_path = '' as $$
declare item_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  item_count := coalesce(pg_catalog.array_length(p_note_ids, 1), 0);
  if item_count < 1 or item_count > 3 then return false; end if;
  if (select count(distinct x) from pg_catalog.unnest(p_note_ids) x) <> item_count then return false; end if;
  if (select count(*) from public.top_three_notes where user_id = p_user_id) <> item_count then return false; end if;
  if (select count(*) from public.top_three_notes where user_id = p_user_id and note_id = any(p_note_ids)) <> item_count then return false; end if;
  delete from public.top_three_notes where user_id = p_user_id;
  insert into public.top_three_notes(user_id, slot, note_id)
    select p_user_id, ordinality::smallint, id from pg_catalog.unnest(p_note_ids) with ordinality as v(id, ordinality);
  return true;
end;
$$;
revoke all on function public.reorder_top_three(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.reorder_top_three(uuid, uuid[]) to service_role;

create or replace function public.remove_top_three_note(p_user_id uuid, p_note_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  delete from public.top_three_notes where user_id = p_user_id and note_id = p_note_id;
end;
$$;
revoke all on function public.remove_top_three_note(uuid, uuid) from public, anon, authenticated;
grant execute on function public.remove_top_three_note(uuid, uuid) to service_role;
