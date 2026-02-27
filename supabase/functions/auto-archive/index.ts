// Supabase Edge Function sketch for scheduled auto-archive.
// Configure a schedule (e.g., every 15m) and set SUPABASE_URL / SERVICE_ROLE_KEY.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = { "content-type": "application/json" };

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Missing env vars" }), { status: 500, headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const now = new Date().toISOString();

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id,auto_archive_policy")
    .neq("auto_archive_policy", "never");

  if (profileError) {
    return new Response(JSON.stringify({ error: profileError.message }), { status: 500, headers: corsHeaders });
  }

  let archived = 0;
  for (const profile of profiles ?? []) {
    const intervalSql = profile.auto_archive_policy === "24h" ? "24 hours" : "7 days";
    const { error } = await supabase
      .from("reminders")
      .update({ status: "archived", archive_reason: "auto", archived_at: now })
      .eq("user_id", profile.id)
      .eq("status", "upcoming")
      .lte("remind_at", new Date(Date.now() - (profile.auto_archive_policy === "24h" ? 86_400_000 : 604_800_000)).toISOString());
    if (!error) archived += 1;
    void intervalSql; // documents policy mapping above
  }

  return new Response(JSON.stringify({ archivedProfilesProcessed: profiles?.length ?? 0, archived }), {
    headers: corsHeaders
  });
});
