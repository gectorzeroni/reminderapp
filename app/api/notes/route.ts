import { getCurrentUserId } from "@/lib/auth";
import { canUseFeed } from "@/lib/repositories/feeds";
import { badRequest, fromError, ok } from "@/lib/http";
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
    const { text, feed } = createNoteSchema.parse(await request.json());
    if (!(await canUseFeed(userId, feed))) return badRequest("Tab not found");
    const note = await createReminder(userId, {
      note: text,
      feed,
      remindAt: null,
      attachments: []
    });
    return ok({ note }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
