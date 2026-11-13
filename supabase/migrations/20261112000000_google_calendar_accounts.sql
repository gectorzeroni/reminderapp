-- Tokens are encrypted by the server and accessible only with the service role.
create table if not exists public.google_calendar_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  google_id text not null,
  email text not null,
  refresh_token text not null,
  created_at timestamptz not null default now(),
  unique (user_id, google_id)
);
alter table public.google_calendar_accounts enable row level security;
revoke all on public.google_calendar_accounts from anon, authenticated;

create or replace function public.limit_google_calendar_accounts() returns trigger
language plpgsql as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.user_id::text));
  if not exists (select 1 from public.google_calendar_accounts where user_id = new.user_id and google_id = new.google_id)
     and (select count(*) from public.google_calendar_accounts where user_id = new.user_id) >= 2 then
    raise exception 'At most two Google Calendar accounts are allowed';
  end if;
  return new;
end;
$$;
drop trigger if exists google_calendar_account_limit on public.google_calendar_accounts;
create trigger google_calendar_account_limit before insert on public.google_calendar_accounts
for each row execute function public.limit_google_calendar_accounts();
