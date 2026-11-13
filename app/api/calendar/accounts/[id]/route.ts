import { getCurrentUserId } from "@/lib/auth";
import { calendarDb } from "@/lib/calendar";
import { fromError, ok } from "@/lib/http";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await context.params;
    const { error } = await calendarDb().from("google_calendar_accounts").delete().eq("id", id).eq("user_id", userId);
    if (error) throw error;
    return ok({ success: true });
  } catch (error) { return fromError(error); }
}
