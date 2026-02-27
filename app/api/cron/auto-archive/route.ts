import { autoArchiveAllUsers } from "@/lib/repositories/reminders";
import { fromError, ok } from "@/lib/http";

export async function POST() {
  try {
    const result = await autoArchiveAllUsers();
    return ok(result);
  } catch (error) {
    return fromError(error);
  }
}
