import { archiveQuerySchema } from "@/lib/validation";
import { getCurrentUserId } from "@/lib/auth";
import { fromError, ok } from "@/lib/http";
import { getArchivedReminders } from "@/lib/repositories/reminders";

export async function GET(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const url = new URL(request.url);
    const parsed = archiveQuerySchema.parse({
      filter: url.searchParams.get("filter") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      page: url.searchParams.get("page") ?? undefined,
      pageSize: url.searchParams.get("pageSize") ?? undefined
    });
    const result = await getArchivedReminders(userId, parsed);
    return ok(result);
  } catch (error) {
    return fromError(error);
  }
}
