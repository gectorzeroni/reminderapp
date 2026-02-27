import { getCurrentUserId } from "@/lib/auth";
import { ok, fromError } from "@/lib/http";
import { getUpcomingReminders } from "@/lib/repositories/reminders";

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const reminders = await getUpcomingReminders(userId);
    return ok({ reminders });
  } catch (error) {
    return fromError(error);
  }
}
