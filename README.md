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

## Google Calendar

Calendar events are read-only and refreshed when the page opens, approximately every 15 seconds while it is visible, and when you return to the tab. The app shows events overlapping the current local day from selected calendars, including recurring and all-day events. Connect up to two Google accounts from the Calendar menu. Disconnecting removes the stored token and stops displaying that account's events.

To enable the integration:

1. Apply `supabase/migrations/20261112000000_google_calendar_accounts.sql` to your Supabase project. The server requires `SUPABASE_SERVICE_ROLE_KEY`; the account table is inaccessible to browser roles.
2. Enable the Google Calendar API, configure the OAuth consent screen, and create a Web application OAuth client in Google Cloud. Add `http://localhost:3000/api/calendar/callback` (and your production callback URL) as authorized redirect URIs. Add test users while the consent screen is in testing mode.
3. Set `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI` (the exact registered callback URL), and `GOOGLE_CALENDAR_ENCRYPTION_KEY` in your server environment. Generate the encryption key with `openssl rand -hex 32`, keep it secret and stable, and back it up securely: changing it makes existing connections unreadable.
4. Restart the app and connect an account. A real signed-in Supabase user is required; demo users cannot persist Calendar connections.

### Deploying Calendar to Vercel

The Calendar configuration in `.env.local` is local to your computer. For a Vercel production deployment:

1. Deploy or import this repository into Vercel and identify its stable production URL, for example `https://your-app.vercel.app`. The Calendar implementation must be included in the deployed source.
2. In Google Cloud Console, open the Later project's OAuth client and add `https://your-app.vercel.app/api/calendar/callback` as an authorized redirect URI, replacing the example with the exact production URL. Keep the localhost URI for local development.
3. Under the Vercel project's Settings → Environment Variables, add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_ENCRYPTION_KEY`, and `GOOGLE_CALENDAR_REDIRECT_URI`. Copy the values from your local `.env.local`, except set the redirect URI to the production callback from step 2. `SUPABASE_STORAGE_BUCKET` is optional if using the default. Keep the service role key, client secret, and encryption key server-side; never prefix them with `NEXT_PUBLIC_` or commit `.env.local`.
4. Use the same Supabase project, Google OAuth client, and encryption key as local development if you want the same signed-in user to see their existing Calendar connections. Losing or changing the encryption key makes stored tokens unreadable.
5. In Supabase Authentication → URL Configuration, set the production Site URL and add `https://your-app.vercel.app/auth/callback` and `https://your-app.vercel.app/auth/reset-password` to the allowed redirect URLs. Keep the local URLs if you still sign in locally.
6. Redeploy after changing Vercel environment variables, sign in to the production app, and verify Calendar loads. Google OAuth redirect URIs must match exactly; changing preview deployment URLs need their own configuration and must not send credentials to an untrusted origin.

Google OAuth is currently in Testing mode: only listed test users can connect, and Calendar authorizations expire after seven days. Production hosting on Vercel does not change that Google setting. Calendar checks for updates while the page is visible; it does not use webhooks.

### Note feeds

Apply `supabase/migrations/20261113000000_add_note_feeds.sql` before deploying the All and Ideas feeds. Existing notes default to All.
