"use client";

import { FormEvent, useEffect, useState } from "react";
import { SignInHeroCard } from "@/components/sign-in-hero-card";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [canReset, setCanReset] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase public env vars are missing. Check .env.local and restart the dev server.");
      setChecking(false);
      return;
    }

    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setCanReset(Boolean(data.session));
      setChecking(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setCanReset(Boolean(session));
      }
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatus(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase public env vars are missing. Check .env.local and restart the dev server.");
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setStatus("Password updated. Redirecting...");
      window.setTimeout(() => {
        window.location.href = "/";
      }, 800);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="sign-in-layout">
      <SignInHeroCard />
      <section className="sign-in-auth">
        <p className="sign-in-logo">Later™</p>
        <p className="sign-in-explainer">
          Set a new password for your account.
        </p>
        {checking ? (
          <p className="sign-in-message">Checking recovery session…</p>
        ) : canReset ? (
          <form onSubmit={handleSubmit} className="sign-in-form">
            <label className="sign-in-field">
              <span className="sr-only">New password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="new password"
                minLength={6}
                required
                className="sign-in-input"
              />
            </label>
            <label className="sign-in-field">
              <span className="sr-only">Confirm password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="confirm password"
                minLength={6}
                required
                className="sign-in-input"
              />
            </label>
            <button type="submit" className="btn primary sign-in-submit-btn" disabled={loading}>
              {loading ? "Saving..." : "Update password"}
            </button>
          </form>
        ) : (
          <div className="sign-in-form-wrap">
            <p className="sign-in-message sign-in-message--error">
              Recovery session not found. Open the reset link from your email again.
            </p>
            <a className="sign-in-forgot-btn" href="/auth/sign-in">
              Back to sign in
            </a>
          </div>
        )}
        {status ? <p className="sign-in-message sign-in-message--success">{status}</p> : null}
        {error ? <p className="sign-in-message sign-in-message--error">{error}</p> : null}
      </section>
    </main>
  );
}
