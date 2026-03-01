"use client";

import * as motion from "motion/react-client";
import { useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function SignInClient() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const params = useSearchParams();
  const canUseLocalDemo =
    process.env.NODE_ENV !== "production" &&
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

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

  async function handleDemoLogin() {
    setError(null);
    setStatus(null);
    setDemoLoading(true);
    try {
      const res = await fetch("/api/dev/demo-login", { method: "POST" });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error || "Failed to enable demo session");
      window.location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to enable demo session");
      setDemoLoading(false);
    }
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
        <motion.button
          type="submit"
          disabled={submitting}
          whileHover={submitting ? undefined : { scale: 1.04 }}
          whileTap={submitting ? undefined : { scale: 0.96 }}
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
        </motion.button>
      </form>

      {canUseLocalDemo ? (
        <motion.button
          type="button"
          disabled={demoLoading}
          whileHover={demoLoading ? undefined : { scale: 1.04 }}
          whileTap={demoLoading ? undefined : { scale: 0.96 }}
          onClick={() => void handleDemoLogin()}
          style={{
            minHeight: 40,
            borderRadius: 999,
            border: "1px solid rgba(0,0,0,0.16)",
            background: "#fff",
            color: "#201f1a",
            cursor: "pointer"
          }}
        >
          {demoLoading ? "Opening demo..." : "Continue as demo (localhost only)"}
        </motion.button>
      ) : null}

      {status ? <p style={{ color: "#11773a", margin: 0 }}>{status}</p> : null}
      {error ? <p style={{ color: "#b73333", margin: 0 }}>{error}</p> : null}
    </div>
  );
}
