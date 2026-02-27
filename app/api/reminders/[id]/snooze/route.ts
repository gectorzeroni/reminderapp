import { getCurrentUserId } from "@/lib/auth";
import { fromError, notFound, ok } from "@/lib/http";
import { snoozeReminder } from "@/lib/repositories/reminders";
import { snoozeSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const userId = await getCurrentUserId();
    const parsed = snoozeSchema.parse(await request.json());
    const reminder = await snoozeReminder(userId, id, parsed);
    if (!reminder) return notFound("Reminder not found");
    return ok({ reminder });
  } catch (error) {
    return fromError(error);
  }
}
