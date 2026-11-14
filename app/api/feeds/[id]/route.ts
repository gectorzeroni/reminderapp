import { z } from "zod";
import { getCurrentUserId } from "@/lib/auth";
import { badRequest, fromError, notFound, ok } from "@/lib/http";
import { deleteCustomFeed, renameCustomFeed } from "@/lib/repositories/feeds";
import { createFeedSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) {
  try {
    const userId = await getCurrentUserId();
    const id = z.string().uuid().parse((await context.params).id);
    const { name } = createFeedSchema.parse(await request.json());
    if (["all", "ideas"].includes(name.toLowerCase())) return badRequest("That tab already exists");
    const feed = await renameCustomFeed(userId, id, name);
    return feed ? ok({ feed }) : notFound("Tab not found");
  } catch (error) { return fromError(error); }
}
export async function DELETE(_request: Request, context: Context) {
  try {
    const userId = await getCurrentUserId();
    const id = z.string().uuid().parse((await context.params).id);
    return await deleteCustomFeed(userId, id) ? ok({ deleted: true }) : notFound("Tab not found");
  } catch (error) { return fromError(error); }
}
