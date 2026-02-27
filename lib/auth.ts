import { headers } from "next/headers";
import { DEMO_USER_ID } from "@/lib/constants";
import { hasSupabasePublicEnv } from "@/lib/env";
import { getSupabaseServerAuthClient } from "@/lib/supabase/server";

export async function getCurrentUserId(): Promise<string> {
  const supabase = await getSupabaseServerAuthClient();
  if (supabase) {
    const { data } = await supabase.auth.getUser();
    if (data.user?.id) return data.user.id;
    throw new Error("Unauthorized");
  }

  // Local/demo fallback only when Supabase public env is not configured.
  if (hasSupabasePublicEnv()) {
    throw new Error("Unauthorized");
  }

  const h = await headers();
  return h.get("x-demo-user-id") || DEMO_USER_ID;
}
