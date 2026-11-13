import { getCurrentUserId } from "@/lib/auth";
import { calendarDb, decryptToken, exchangeToken, googlePages } from "@/lib/calendar";
import { badRequest, fromError, ok } from "@/lib/http";

type GoogleEvent = { id: string; summary?: string; htmlLink?: string; status?: string; start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string } };
export async function GET(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const params = new URL(request.url).searchParams;
    const start = new Date(params.get("start") ?? "");
    const end = new Date(params.get("end") ?? "");
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end.getTime() <= start.getTime() || end.getTime() - start.getTime() > 27 * 3600000) return badRequest("Invalid date range");
    const { data, error } = await calendarDb().from("google_calendar_accounts").select("id,email,refresh_token").eq("user_id", userId);
    if (error) throw error;
    const results = await Promise.all((data ?? []).map(async (account) => {
      try {
        const token = await exchangeToken({ refresh_token: decryptToken(account.refresh_token), grant_type: "refresh_token" });
        const calendars = await googlePages<{ id: string; selected?: boolean }>(new URL("https://www.googleapis.com/calendar/v3/users/me/calendarList"), token.access_token);
        const events = await Promise.all(calendars.filter((calendar) => calendar.selected !== false).map(async (calendar) => {
          const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events`);
          url.search = new URLSearchParams({ timeMin: start.toISOString(), timeMax: end.toISOString(), singleEvents: "true", maxResults: "2500" }).toString();
          return (await googlePages<GoogleEvent>(url, token.access_token)).filter((event) => event.status !== "cancelled" && event.start).map((event) => ({ id: `${account.id}:${calendar.id}:${event.id}`, title: event.summary || "Untitled event", start: event.start?.dateTime ?? event.start?.date, end: event.end?.dateTime ?? event.end?.date, allDay: !event.start?.dateTime, url: event.htmlLink, account: account.email }));
        }));
        return { events: events.flat(), error: null };
      } catch { return { events: [], error: `Could not load events for ${account.email}. Try reconnecting this account.` }; }
    }));
    return ok({ events: results.flatMap((result) => result.events), errors: results.flatMap((result) => result.error ? [result.error] : []) });
  } catch (error) { return fromError(error); }
}
