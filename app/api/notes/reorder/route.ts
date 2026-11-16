import { z } from "zod";
import { getCurrentUserId } from "@/lib/auth";
import { badRequest, fromError, ok } from "@/lib/http";
import { reorderNotes } from "@/lib/repositories/reminders";

const schema = z.object({ items: z.array(z.object({ id: z.string().min(1).max(128), position: z.number().finite() })).min(1).max(5000) });
export async function PATCH(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const { items } = schema.parse(await request.json());
    if (!await reorderNotes(userId, items)) return badRequest("Could not reorder these notes");
    return ok({ reordered: true });
  } catch (error) { return fromError(error); }
}
