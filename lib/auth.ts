import { cookies, headers } from "next/headers";
import { DEMO_USER_ID } from "@/lib/constants";
import { hasSupabasePublicEnv } from "@/lib/env";
import { getSupabaseServerAuthClient } from "@/lib/supabase/server";

const DEMO_COOKIE_NAME = "later-demo-user-id";

function isLocalHostHeader(host: string | null): boolean {
  if (!host) return false;
  const clean = host.split(":")[0]?.toLowerCase() ?? "";
  return clean === "localhost" || clean === "127.0.0.1";
}

export async function getLocalDemoUserId(): Promise<string | null> {
  if (process.env.NODE_ENV === "production") return null;
  const h = await headers();
  if (!isLocalHostHeader(h.get("host"))) return null;
  const cookieStore = await cookies();
  const cookieUserId = cookieStore.get(DEMO_COOKIE_NAME)?.value?.trim();
  return cookieUserId || null;
}

export async function getCurrentUserId(): Promise<string> {
  const supabase = await getSupabaseServerAuthClient();
  if (supabase) {
    const { data } = await supabase.auth.getUser();
    if (data.user?.id) return data.user.id;
    const demoUserId = await getLocalDemoUserId();
    if (demoUserId) return demoUserId;
    throw new Error("Unauthorized");
  }

  // Local/demo fallback only when Supabase public env is not configured.
  if (hasSupabasePublicEnv()) {
    const demoUserId = await getLocalDemoUserId();
    if (demoUserId) return demoUserId;
    throw new Error("Unauthorized");
  }

  const h = await headers();
  return h.get("x-demo-user-id") || DEMO_USER_ID;
}
