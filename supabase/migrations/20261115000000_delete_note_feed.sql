-- Move notes before deleting a tab in the same transaction.
create or replace function public.delete_note_feed(p_user_id uuid, p_feed_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.note_feeds where id = p_feed_id and user_id = p_user_id for update;
  if not found then return false; end if;
  update public.reminders set feed = 'all' where user_id = p_user_id and feed = p_feed_id::text;
  delete from public.note_feeds where id = p_feed_id and user_id = p_user_id;
  return true;
end;
$$;
revoke all on function public.delete_note_feed(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_note_feed(uuid, uuid) to service_role;
