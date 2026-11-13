alter table public.reminders
  add column if not exists feed text not null default 'all'
  check (feed in ('all', 'ideas'));
