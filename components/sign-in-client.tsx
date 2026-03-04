"use client";

import * as motion from "motion/react-client";
import { useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type AuthMethod = "magic" | "password";
type PasswordMode = "signin" | "signup";

export function SignInClient() {
  const [authMethod, setAuthMethod] = useState<AuthMethod>("magic");
  const [passwordMode, setPasswordMode] = useState<PasswordMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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

      if (authMethod === "magic") {
        const { error: signInError } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirectTo }
        });
        if (signInError) throw signInError;
        setStatus("Magic link sent. Open your email and follow the sign-in link.");
      } else {
        if (password.length < 6) {
          throw new Error("Password must be at least 6 characters.");
        }
        if (passwordMode === "signup") {
          if (password !== confirmPassword) {
            throw new Error("Passwords do not match.");
          }
          const { data, error: signUpError } = await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: redirectTo }
          });
          if (signUpError) throw signUpError;
          if (data.session) {
            window.location.href = "/";
            return;
          }
          setStatus("Account created. Check your email to confirm and continue.");
        } else {
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password
          });
          if (signInError) throw signInError;
          window.location.href = "/";
          return;
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Authentication failed");
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

  async function handleForgotPassword() {
    setError(null);
    setStatus(null);
    if (!email.trim()) {
      setError("Enter your email first, then click Forgot password.");
      return;
    }
    setSubmitting(true);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        throw new Error("Supabase public env vars are missing. Check .env.local and restart the dev server.");
      }
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/reset-password`
          : undefined;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo
      });
      if (resetError) throw resetError;
      setStatus("Password reset link sent. Check your email.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send reset link");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="sign-in-form-wrap">
      <div className="sign-in-method-switch" role="tablist" aria-label="Authentication method">
        <button
          type="button"
          className={`sign-in-method-btn ${authMethod === "magic" ? "is-active" : ""}`}
          onClick={() => {
            setAuthMethod("magic");
            setError(null);
            setStatus(null);
          }}
        >
          Magic link
        </button>
        <button
          type="button"
          className={`sign-in-method-btn ${authMethod === "password" ? "is-active" : ""}`}
          onClick={() => {
            setAuthMethod("password");
            setError(null);
            setStatus(null);
          }}
        >
          Email + password
        </button>
      </div>

      {authMethod === "password" ? (
        <div className="sign-in-password-mode">
          <button
            type="button"
            className={`sign-in-password-mode-btn ${passwordMode === "signin" ? "is-active" : ""}`}
            onClick={() => setPasswordMode("signin")}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`sign-in-password-mode-btn ${passwordMode === "signup" ? "is-active" : ""}`}
            onClick={() => setPasswordMode("signup")}
          >
            Sign up
          </button>
        </div>
      ) : null}

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
        {authMethod === "password" ? (
          <>
            <label className="sign-in-field">
              <span className="sr-only">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="password"
                required
                minLength={6}
                className="sign-in-input"
              />
            </label>
            {passwordMode === "signup" ? (
              <label className="sign-in-field">
                <span className="sr-only">Confirm password</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="confirm password"
                  required
                  minLength={6}
                  className="sign-in-input"
                />
              </label>
            ) : null}
          </>
        ) : null}
        <motion.button
          type="submit"
          disabled={submitting}
          whileHover={submitting ? undefined : { scale: 1.04 }}
          whileTap={submitting ? undefined : { scale: 0.96 }}
          className="btn primary sign-in-submit-btn"
        >
          {submitting
            ? "Working..."
            : authMethod === "magic"
              ? "Send me the link"
              : passwordMode === "signup"
                ? "Create account"
                : "Sign in"}
        </motion.button>
        {authMethod === "password" && passwordMode === "signin" ? (
          <button
            type="button"
            className="sign-in-forgot-btn"
            onClick={() => void handleForgotPassword()}
            disabled={submitting}
          >
            Forgot password?
          </button>
        ) : null}
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
