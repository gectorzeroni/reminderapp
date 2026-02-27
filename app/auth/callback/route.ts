import { NextResponse } from "next/server";
import { getSupabaseServerAuthClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/";

  if (!code) {
    return NextResponse.redirect(new URL(`/auth/sign-in?error=missing_code`, url.origin));
  }

  const supabase = await getSupabaseServerAuthClient();
  if (!supabase) {
    return NextResponse.redirect(new URL(`/auth/sign-in?error=supabase_not_configured`, url.origin));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL(`/auth/sign-in?error=${encodeURIComponent(error.message)}`, url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
