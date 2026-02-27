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

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  note text,
  status reminder_status not null default 'upcoming',
  archive_reason archive_reason,
  remind_at timestamptz,
  archived_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
