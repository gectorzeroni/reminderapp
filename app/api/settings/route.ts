import { getCurrentUserId } from "@/lib/auth";
import { fromError, ok } from "@/lib/http";
import { getProfile, updateSettings } from "@/lib/repositories/reminders";
import { getSupabaseServerAuthClient } from "@/lib/supabase/server";
import { updateSettingsSchema } from "@/lib/validation";

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const profile = await getProfile(userId);
    const supabase = await getSupabaseServerAuthClient();
    const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
    const user = data.user
      ? {
          id: data.user.id,
          email: data.user.email ?? null,
          name:
            (typeof data.user.user_metadata?.full_name === "string" && data.user.user_metadata.full_name) ||
            (typeof data.user.user_metadata?.name === "string" && data.user.user_metadata.name) ||
            null
        }
      : null;
    return ok({ profile, user });
  } catch (error) {
    return fromError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const parsed = updateSettingsSchema.parse(await request.json());
    const profile = await updateSettings(userId, parsed);
    return ok({ profile });
  } catch (error) {
    return fromError(error);
  }
}
