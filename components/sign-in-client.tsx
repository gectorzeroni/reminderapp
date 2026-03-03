"use client";

import * as motion from "motion/react-client";
import { useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function SignInClient() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [canUseLocalDemo, setCanUseLocalDemo] = useState(false);
  const params = useSearchParams();

  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      setCanUseLocalDemo(false);
      return;
    }
    const host = window.location.hostname;
    setCanUseLocalDemo(host === "localhost" || host === "127.0.0.1");
  }, []);

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
    <div className="sign-in-form-wrap">
      {params.get("error") ? (
        <p className="sign-in-message sign-in-message--error">
          Auth error: {params.get("error")}
        </p>
      ) : null}
      <form onSubmit={handleSubmit} className="sign-in-form">
        <label className="sign-in-field">
          <span className="sr-only">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="youremail@example.com"
            required
            className="sign-in-input"
          />
        </label>
        <motion.button
          type="submit"
          disabled={submitting}
          whileHover={submitting ? undefined : { scale: 1.04 }}
          whileTap={submitting ? undefined : { scale: 0.96 }}
          className="btn primary sign-in-submit-btn"
        >
          {submitting ? "Sending..." : "Send me the link"}
        </motion.button>
      </form>

      {canUseLocalDemo ? (
        <motion.button
          type="button"
          disabled={demoLoading}
          whileHover={demoLoading ? undefined : { scale: 1.04 }}
          whileTap={demoLoading ? undefined : { scale: 0.96 }}
          onClick={() => void handleDemoLogin()}
          className="btn sign-in-demo-btn"
        >
          {demoLoading ? "Opening demo..." : "Continue as demo (localhost only)"}
        </motion.button>
      ) : null}

      {status ? <p className="sign-in-message sign-in-message--success">{status}</p> : null}
      {error ? <p className="sign-in-message sign-in-message--error">{error}</p> : null}
    </div>
  );
}
