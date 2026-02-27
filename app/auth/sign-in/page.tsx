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
          padding: "30px 28px 32px",
          boxShadow: "0 12px 36px rgba(0,0,0,0.08)"
        }}
      >
        <p
          style={{
            margin: 0,
            fontFamily: "var(--font-display), var(--font-inter), Segoe UI, sans-serif",
            fontSize: 38,
            lineHeight: 1
          }}
        >
          Later™
        </p>
        <h1 style={{ marginTop: 14, marginBottom: 12 }}>Sign in</h1>
        <p style={{ color: "#666", marginTop: 0, marginBottom: 18 }}>
          Enter your email and we&apos;ll send you a secure magic link. Open it on this device to sign in or create your
          account automatically.
        </p>
        <Suspense fallback={<p>Loading sign-in…</p>}>
          <SignInClient />
        </Suspense>
      </section>
      <p
        style={{
          position: "fixed",
          left: "50%",
          bottom: 16,
          transform: "translateX(-50%)",
          margin: 0,
          fontSize: 12,
          color: "rgba(32,31,26,0.5)"
        }}
      >
        <a
          href="mailto:duhnov.vladislav@gmail.com"
          style={{ color: "inherit", textDecoration: "none" }}
        >
          support:duhnov.vladislav@gmail.com
        </a>
      </p>
    </main>
  );
}
