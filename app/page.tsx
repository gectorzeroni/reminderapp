import { redirect } from "next/navigation";
import { RemindersApp } from "@/components/reminders-app";
import { hasSupabasePublicEnv } from "@/lib/env";
import { getSupabaseServerAuthClient } from "@/lib/supabase/server";

export default async function HomePage() {
  if (hasSupabasePublicEnv()) {
    const supabase = await getSupabaseServerAuthClient();
    const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
    if (!data.user) {
      redirect("/auth/sign-in");
    }
  }

  return <RemindersApp />;
}
