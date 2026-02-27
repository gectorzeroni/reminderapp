"use client";

import { createBrowserClient } from "@supabase/ssr";
import { env, hasSupabasePublicEnv } from "@/lib/env";

export function getSupabaseBrowserClient() {
  if (!hasSupabasePublicEnv()) return null;
  return createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
}
