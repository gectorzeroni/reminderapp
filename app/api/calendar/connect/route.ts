import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { calendarConfig, calendarDb } from "@/lib/calendar";

export async function GET(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const { clientId, redirectUri } = calendarConfig();
    const { count, error } = await calendarDb().from("google_calendar_accounts").select("id", { count: "exact", head: true }).eq("user_id", userId);
    if (error) throw error;
    if ((count ?? 0) >= 2) throw new Error("Disconnect an account before adding another. You can connect up to two accounts.");
    const state = randomBytes(32).toString("base64url");
    (await cookies()).set("calendar-oauth", JSON.stringify({ state, userId }), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/calendar/callback", maxAge: 600 });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: "openid email https://www.googleapis.com/auth/calendar.readonly", access_type: "offline", prompt: "consent select_account", state }).toString();
    return NextResponse.redirect(url);
  } catch (error) {
    const target = new URL("/", request.url);
    target.searchParams.set("calendar_error", error instanceof Error ? error.message : "Could not connect Google Calendar.");
    return NextResponse.redirect(target);
  }
}
