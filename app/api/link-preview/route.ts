import { getCurrentUserId } from "@/lib/auth";
import { badRequest, fromError, ok } from "@/lib/http";
import { fetchLinkPreview } from "@/lib/metadata";
import { isLikelyUrl } from "@/lib/parse";

export async function GET(request: Request) {
  try {
    await getCurrentUserId();
    const url = new URL(request.url).searchParams.get("url") ?? "";
    if (url.length > 8192 || !isLikelyUrl(url)) return badRequest("Invalid webpage URL");
    return ok(await fetchLinkPreview(url));
  } catch (error) {
    return fromError(error);
  }
}
