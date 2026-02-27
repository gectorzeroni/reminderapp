import { getCurrentUserId } from "@/lib/auth";
import { archiveReminder } from "@/lib/repositories/reminders";
import { archiveSchema } from "@/lib/validation";
import { fromError, notFound, ok } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const userId = await getCurrentUserId();
    const parsed = archiveSchema.parse(await request.json());
    const reminder = await archiveReminder(userId, id, parsed);
    if (!reminder) return notFound("Reminder not found");
    return ok({ reminder });
  } catch (error) {
    return fromError(error);
  }
}
