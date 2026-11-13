import { getCurrentUserId } from "@/lib/auth";
import { calendarDb } from "@/lib/calendar";
import { fromError, ok } from "@/lib/http";

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const { data, error } = await calendarDb().from("google_calendar_accounts").select("id,email").eq("user_id", userId).order("created_at");
    if (error) throw error;
    return ok({ accounts: data });
  } catch (error) { return fromError(error); }
}
