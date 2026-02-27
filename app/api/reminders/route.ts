import { createReminderSchema } from "@/lib/validation";
import { createReminder } from "@/lib/repositories/reminders";
import { getCurrentUserId } from "@/lib/auth";
import { fromError, ok } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const json = await request.json();
    const parsed = createReminderSchema.parse(json);
    const reminder = await createReminder(userId, parsed);
    return ok({ reminder }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
