import { Suspense } from "react";
import { SignInClient } from "@/components/sign-in-client";

export default function SignInPage() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <section
        style={{
          width: "min(460px, 100%)",
          background: "rgba(255,255,255,0.92)",
          border: "1px solid rgba(0,0,0,0.1)",
          borderRadius: 18,
          padding: 20,
          boxShadow: "0 12px 36px rgba(0,0,0,0.08)"
        }}
      >
        <p style={{ margin: 0, color: "#666", textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 12 }}>
          Smart Reminders
        </p>
        <h1 style={{ marginTop: 6, marginBottom: 8 }}>Sign in</h1>
        <p style={{ color: "#666", marginTop: 0 }}>
          Email magic link (OTP). After sign-in, the app will use your Supabase user ID automatically.
        </p>
        <Suspense fallback={<p>Loading sign-in…</p>}>
          <SignInClient />
        </Suspense>
      </section>
    </main>
  );
}
