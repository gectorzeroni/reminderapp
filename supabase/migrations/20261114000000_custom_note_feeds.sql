-- Custom tab IDs are stored in reminders.feed alongside the built-in feed names.
create table if not exists public.note_feeds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 30),
  created_at timestamptz not null default now()
);
create unique index if not exists note_feeds_user_name_unique on public.note_feeds (user_id, lower(trim(name)));
alter table public.note_feeds enable row level security;
revoke all on public.note_feeds from anon, authenticated;

alter table public.reminders drop constraint if exists reminders_feed_check;
alter table public.reminders add constraint reminders_feed_check
  check (feed in ('all', 'ideas') or feed ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');
