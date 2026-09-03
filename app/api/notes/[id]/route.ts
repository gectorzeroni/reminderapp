import { getCurrentUserId } from "@/lib/auth";
import { fromError, notFound, ok } from "@/lib/http";
import { deleteNote, updateReminder } from "@/lib/repositories/reminders";
import { updateNoteSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await context.params;
    const input = updateNoteSchema.parse(await request.json());
    const note = await updateReminder(userId, id, input);
    if (!note) return notFound("Note not found");
    return ok({ note });
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await context.params;
    const deleted = await deleteNote(userId, id);
    if (!deleted) return notFound("Note not found");
    return ok({ deleted: true });
  } catch (error) {
    return fromError(error);
  }
}
