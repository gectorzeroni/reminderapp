-- Smart Reminders MVP schema (Supabase/Postgres)
-- Run in Supabase SQL editor or as a migration.

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'auto_archive_policy') then
    create type auto_archive_policy as enum ('never', '24h', '7d');
  end if;
  if not exists (select 1 from pg_type where typname = 'reminder_status') then
    create type reminder_status as enum ('upcoming', 'archived');
  end if;
  if not exists (select 1 from pg_type where typname = 'archive_reason') then
    create type archive_reason as enum ('completed', 'auto', 'manual');
  end if;
  if not exists (select 1 from pg_type where typname = 'attachment_kind') then
    create type attachment_kind as enum ('link', 'image', 'file', 'text_snippet');
  end if;
  if not exists (select 1 from pg_type where typname = 'metadata_status') then
    create type metadata_status as enum ('pending', 'ready', 'failed');
  end if;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  timezone text not null default 'UTC',
  auto_archive_policy auto_archive_policy not null default 'never',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.note_feeds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 30),
  created_at timestamptz not null default now()
);
create unique index if not exists note_feeds_user_name_unique on public.note_feeds (user_id, lower(trim(name)));
alter table public.note_feeds enable row level security;
revoke all on public.note_feeds from anon, authenticated;

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  note text,
  feed text not null default 'all' check (feed in ('all', 'ideas') or feed ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  pinned boolean not null default false,
  checked boolean not null default false,
  status reminder_status not null default 'upcoming',
  archive_reason archive_reason,
  remind_at timestamptz,
  archived_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reminders
  add column if not exists pinned boolean not null default false;

alter table public.reminders
  add column if not exists checked boolean not null default false;

create table if not exists public.reminder_attachments (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references public.reminders(id) on delete cascade,
  kind attachment_kind not null,
  storage_path text,
  mime_type text,
  file_name text,
  file_size_bytes bigint,
  url text,
  text_content text,
  preview_title text,
  preview_icon_url text,
  preview_image_url text,
  metadata_status metadata_status not null default 'pending',
  created_at timestamptz not null default now()
);

create index if not exists reminders_user_id_remind_at_idx on public.reminders(user_id, remind_at);
create index if not exists reminders_user_id_status_idx on public.reminders(user_id, status);
create index if not exists reminders_user_id_pinned_idx on public.reminders(user_id, pinned);
create index if not exists attachments_reminder_id_idx on public.reminder_attachments(reminder_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists reminders_set_updated_at on public.reminders;
create trigger reminders_set_updated_at
before update on public.reminders
for each row execute function public.set_updated_at();

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

alter table public.profiles enable row level security;
alter table public.reminders enable row level security;
alter table public.reminder_attachments enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
for update using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
for insert with check (auth.uid() = id);

drop policy if exists "reminders_select_own" on public.reminders;
create policy "reminders_select_own" on public.reminders
for select using (auth.uid() = user_id);

drop policy if exists "reminders_insert_own" on public.reminders;
create policy "reminders_insert_own" on public.reminders
for insert with check (auth.uid() = user_id);

drop policy if exists "reminders_update_own" on public.reminders;
create policy "reminders_update_own" on public.reminders
for update using (auth.uid() = user_id);

drop policy if exists "reminders_delete_own" on public.reminders;
create policy "reminders_delete_own" on public.reminders
for delete using (auth.uid() = user_id);

drop policy if exists "attachments_select_own" on public.reminder_attachments;
create policy "attachments_select_own" on public.reminder_attachments
for select using (
  exists (
    select 1 from public.reminders r
    where r.id = reminder_id and r.user_id = auth.uid()
  )
);

drop policy if exists "attachments_insert_own" on public.reminder_attachments;
create policy "attachments_insert_own" on public.reminder_attachments
for insert with check (
  exists (
    select 1 from public.reminders r
    where r.id = reminder_id and r.user_id = auth.uid()
  )
);

drop policy if exists "attachments_update_own" on public.reminder_attachments;
create policy "attachments_update_own" on public.reminder_attachments
for update using (
  exists (
    select 1 from public.reminders r
    where r.id = reminder_id and r.user_id = auth.uid()
  )
);

drop policy if exists "attachments_delete_own" on public.reminder_attachments;
create policy "attachments_delete_own" on public.reminder_attachments
for delete using (
  exists (
    select 1 from public.reminders r
    where r.id = reminder_id and r.user_id = auth.uid()
  )
);

-- Storage setup (run once; bucket creation may require dashboard/admin permissions)
-- insert into storage.buckets (id, name, public) values ('reminder-files', 'reminder-files', false)
-- on conflict (id) do nothing;
--
-- Example RLS policy for storage.objects:
-- create policy "Users access own reminder files" on storage.objects
-- for all to authenticated
-- using (bucket_id = 'reminder-files' and (storage.foldername(name))[1] = auth.uid()::text)
-- with check (bucket_id = 'reminder-files' and (storage.foldername(name))[1] = auth.uid()::text);
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
