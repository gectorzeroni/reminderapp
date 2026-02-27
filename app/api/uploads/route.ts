import { randomUUID } from "node:crypto";
import { getCurrentUserId } from "@/lib/auth";
import { fromError, ok } from "@/lib/http";
import { env } from "@/lib/env";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { uploadRequestSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const parsed = uploadRequestSchema.parse(await request.json());
    const safeName = parsed.fileName.replace(/[^\w.\- ]+/g, "_");
    const storagePath = `${userId}/${randomUUID()}-${safeName}`;
    const supabase = getSupabaseServiceClient();

    if (supabase) {
      const { data, error } = await supabase.storage
        .from(env.supabaseStorageBucket)
        .createSignedUploadUrl(storagePath);

      if (error) {
        throw new Error(`Failed to create signed upload URL: ${error.message}`);
      }

      return ok({
        storagePath,
        signedUploadUrl: (data as { signedUrl?: string }).signedUrl ?? null,
        token: (data as { token?: string }).token ?? null,
        publicUrl: null
      });
    }

    return ok({
      storagePath,
      signedUploadUrl: null,
      publicUrl: null,
      note: "Local dev mode returns metadata only. Configure Supabase Storage signed uploads for production."
    });
  } catch (error) {
    return fromError(error);
  }
}
