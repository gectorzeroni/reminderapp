import { getCurrentUserId } from "@/lib/auth";
import { env } from "@/lib/env";
import { fromError, notFound, ok } from "@/lib/http";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { z } from "zod";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    const id = z.string().uuid().parse((await context.params).id);
    const supabase = getSupabaseServiceClient();
    if (!supabase) throw new Error("Storage is not configured");
    const { data, error } = await supabase.from("reminder_attachments")
      .select("storage_path,reminders!inner(user_id)")
      .eq("id", id).eq("reminders.user_id", userId).maybeSingle();
    if (error) throw error;
    if (!data?.storage_path) return notFound("Attachment not found");
    const result = await supabase.storage.from(env.supabaseStorageBucket).createSignedUrl(data.storage_path, 60);
    if (result.error) throw result.error;
    return ok({ url: result.data.signedUrl });
  } catch (error) { return fromError(error); }
}
