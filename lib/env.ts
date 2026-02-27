export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  supabaseStorageBucket: process.env.SUPABASE_STORAGE_BUCKET || "reminder-files"
};

export function hasSupabasePublicEnv() {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}

export function hasSupabaseServiceEnv() {
  return Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
}
