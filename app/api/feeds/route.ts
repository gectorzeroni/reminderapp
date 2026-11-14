import { getCurrentUserId } from "@/lib/auth";
import { badRequest, fromError, ok } from "@/lib/http";
import { createCustomFeed, getCustomFeeds } from "@/lib/repositories/feeds";
import { createFeedSchema } from "@/lib/validation";

export async function GET() {
  try { return ok({ feeds: await getCustomFeeds(await getCurrentUserId()) }); }
  catch (error) { return fromError(error); }
}
export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const { name } = createFeedSchema.parse(await request.json());
    if (["all", "ideas"].includes(name.toLowerCase())) return badRequest("That tab already exists");
    return ok({ feed: await createCustomFeed(userId, name) }, { status: 201 });
  } catch (error) { return fromError(error); }
}
