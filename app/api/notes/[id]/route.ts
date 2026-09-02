import { getCurrentUserId } from "@/lib/auth";
import { fromError, notFound, ok } from "@/lib/http";
import { deleteNote } from "@/lib/repositories/reminders";

type Context = { params: Promise<{ id: string }> };

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
