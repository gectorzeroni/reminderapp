import { getCurrentUserId } from "@/lib/auth";
import { fromError, notFound, ok } from "@/lib/http";
import { updateReminder } from "@/lib/repositories/reminders";
import { updateReminderSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const userId = await getCurrentUserId();
    const parsed = updateReminderSchema.parse(await request.json());
    const reminder = await updateReminder(userId, id, parsed);
    if (!reminder) return notFound("Reminder not found");
    return ok({ reminder });
  } catch (error) {
    return fromError(error);
  }
}
