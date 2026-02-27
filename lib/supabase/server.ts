import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { env, hasSupabasePublicEnv, hasSupabaseServiceEnv } from "@/lib/env";

export function getSupabaseServiceClient() {
  if (!hasSupabaseServiceEnv()) return null;
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false }
  });
}

export async function getSupabaseServerAuthClient() {
  if (!hasSupabasePublicEnv()) return null;
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        cookieList: Array<{ name: string; value: string; options?: Parameters<typeof cookieStore.set>[2] }>
      ) {
        for (const cookie of cookieList) {
          try {
            cookieStore.set(cookie.name, cookie.value, cookie.options);
          } catch {
            // Route handlers/server components may be read-only in some contexts.
          }
        }
      }
    }
  });
}
