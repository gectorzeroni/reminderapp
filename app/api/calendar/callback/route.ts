import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { calendarConfig, calendarDb, encryptToken, exchangeToken } from "@/lib/calendar";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cookieStore = await cookies();
  const saved = cookieStore.get("calendar-oauth")?.value;
  cookieStore.set("calendar-oauth", "", { path: "/api/calendar/callback", maxAge: 0 });
  try {
    const state = saved ? JSON.parse(saved) as { state: string; userId: string } : null;
    const userId = await getCurrentUserId();
    if (!state || state.userId !== userId || !url.searchParams.get("state") || state.state !== url.searchParams.get("state")) throw new Error("Calendar connection expired. Please try again.");
    const code = url.searchParams.get("code");
    if (!code) throw new Error("Calendar connection was cancelled.");
    const { redirectUri } = calendarConfig();
    const tokens = await exchangeToken({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });
    if (!tokens.refresh_token) throw new Error("Google did not grant offline access. Please try connecting again.");
    const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` }, cache: "no-store" });
    if (!response.ok) throw new Error("Could not identify the Google account.");
    const account = await response.json() as { sub?: string; email?: string };
    if (!account.sub || !account.email) throw new Error("Could not identify the Google account.");
    const { error } = await calendarDb().from("google_calendar_accounts").upsert({ user_id: userId, google_id: account.sub, email: account.email, refresh_token: encryptToken(tokens.refresh_token) }, { onConflict: "user_id,google_id" });
    if (error) throw new Error("Could not save this account. You can connect up to two accounts.");
    return NextResponse.redirect(new URL("/?calendar=connected", request.url));
  } catch (error) {
    const target = new URL("/", request.url);
    target.searchParams.set("calendar_error", error instanceof Error ? error.message : "Could not connect Google Calendar.");
    return NextResponse.redirect(target);
  }
}
