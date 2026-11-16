import { z } from "zod";
import { getCurrentUserId } from "@/lib/auth";
import { badRequest, fromError, notFound, ok } from "@/lib/http";
import { addTopThree, getTopThree, removeTopThree } from "@/lib/repositories/top-three";

const inputSchema = z.object({ noteId: z.string().min(1).max(128) });
export async function GET() {
  try { return ok({ noteIds: await getTopThree(await getCurrentUserId()) }); }
  catch (error) { return fromError(error); }
}
export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const { noteId } = inputSchema.parse(await request.json());
    const result = await addTopThree(userId, noteId);
    if (result === "not_found") return notFound("Note not found");
    if (result === "full") return badRequest("Top 3 is full. Remove a note before adding another.");
    return ok({ noteIds: await getTopThree(userId) });
  } catch (error) { return fromError(error); }
}
export async function DELETE(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const { noteId } = inputSchema.parse(await request.json());
    await removeTopThree(userId, noteId);
    return ok({ noteIds: await getTopThree(userId) });
  } catch (error) { return fromError(error); }
}
