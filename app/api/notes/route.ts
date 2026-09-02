import { getCurrentUserId } from "@/lib/auth";
import { fromError, ok } from "@/lib/http";
import { createReminder, getNotes } from "@/lib/repositories/reminders";
import { createNoteSchema } from "@/lib/validation";

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const notes = await getNotes(userId);
    return ok({ notes });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const { text } = createNoteSchema.parse(await request.json());
    const note = await createReminder(userId, {
      note: text,
      remindAt: null,
      attachments: []
    });
    return ok({ note }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
