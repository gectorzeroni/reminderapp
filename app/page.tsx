import { redirect } from "next/navigation";
import { NotesApp } from "@/components/notes-app";
import { getLocalDemoUserId } from "@/lib/auth";
import { hasSupabasePublicEnv } from "@/lib/env";
import { getSupabaseServerAuthClient } from "@/lib/supabase/server";

export default async function HomePage() {
  if (hasSupabasePublicEnv()) {
    const supabase = await getSupabaseServerAuthClient();
    const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
    const demoUserId = await getLocalDemoUserId();
    if (!data.user && !demoUserId) {
      redirect("/auth/sign-in");
    }
  }

  return <NotesApp />;
}
