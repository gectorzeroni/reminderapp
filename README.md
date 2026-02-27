# Smart Reminders (MVP Scaffold)

Personal reminder web app built with `Next.js` + `React`, with Supabase-ready integration points and a local in-memory development repository for fast prototyping.

## What is implemented

- Main screen with centered upcoming reminders
- Bottom composer with drag/drop + paste for links, text, images, files
- Archive button in bottom-right corner with archive panel
- Avatar/settings menu with timezone + auto-archive policy
- Reminder card actions: done, archive, snooze, reschedule
- API routes from the plan (`/api/reminders`, `/api/reminders/upcoming`, `/api/reminders/archive`, etc.)
- Best-effort link title/favicon enrichment on create
- In-memory repository (works without Supabase)
- Supabase schema + RLS SQL (`/database/supabase_schema.sql`)
- Supabase Edge Function sketch for scheduled auto-archive (`/supabase/functions/auto-archive/index.ts`)

## Local run

1. Install dependencies:

```bash
npm install
```

2. Start dev server:

```bash
npm run dev
```

3. Open `http://localhost:3000`

## Supabase integration (next step)

Set these env vars in `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Then:

1. Run the SQL in `/database/supabase_schema.sql`
2. Replace the in-memory repository in `/lib/repositories/reminders.ts` with Supabase-backed queries (the API contracts and types are already in place)
3. Wire auth UI/page flow to Supabase Auth in `/app/auth/sign-in/page.tsx`
4. Implement signed upload URLs in `/app/api/uploads/route.ts`

## Optional reminder date migration (required for "save without date")

If you already ran the original schema, run this SQL once to allow reminders without a date/time:

```sql
alter table public.reminders
  alter column remind_at drop not null;
```

## Notes

- Current implementation defaults to demo mode (`demo-user`) if auth is not configured.
- File/image uploads are metadata-only in local mode (no binary upload destination yet).
