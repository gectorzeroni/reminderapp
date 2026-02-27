"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function SignInClient() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const params = useSearchParams();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatus(null);
    setSubmitting(true);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        throw new Error("Supabase public env vars are missing. Check .env.local and restart the dev server.");
      }

      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/callback?next=/`
          : undefined;

      const { error: signInError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo }
      });
      if (signInError) throw signInError;

      setStatus("Magic link sent. Open your email and follow the sign-in link.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send magic link");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignOut() {
    setError(null);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message);
      return;
    }
    setStatus("Signed out.");
    router.refresh();
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {params.get("error") ? (
        <p style={{ color: "#b73333", margin: 0 }}>
          Auth error: {params.get("error")}
        </p>
      ) : null}
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 10 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            style={{
              minHeight: 40,
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.15)",
              padding: "8px 10px"
            }}
          />
        </label>
        <button
          type="submit"
          disabled={submitting}
          style={{
            minHeight: 42,
            borderRadius: 999,
            border: "1px solid rgba(9,72,207,.5)",
            background: "linear-gradient(180deg, #0f67ff, #0948cf)",
            color: "#fff",
            cursor: "pointer"
          }}
        >
          {submitting ? "Sending..." : "Send magic link"}
        </button>
      </form>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link href="/" style={{ color: "#0b5cff" }}>
          Open app
        </Link>
        <button
          type="button"
          onClick={handleSignOut}
          style={{
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 999,
            background: "#fff",
            padding: "6px 10px",
            cursor: "pointer"
          }}
        >
          Sign out
        </button>
      </div>

      {status ? <p style={{ color: "#11773a", margin: 0 }}>{status}</p> : null}
      {error ? <p style={{ color: "#b73333", margin: 0 }}>{error}</p> : null}
    </div>
  );
}
