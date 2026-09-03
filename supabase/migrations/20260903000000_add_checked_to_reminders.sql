alter table public.reminders
  add column if not exists checked boolean not null default false;

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'reminders'
  ) then
    alter publication supabase_realtime add table public.reminders;
  end if;
end $$;
