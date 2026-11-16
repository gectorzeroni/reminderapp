import { Suspense } from "react";
import Image from "next/image";
import { SignInHeroCard } from "@/components/sign-in-hero-card";
import { SignInClient } from "@/components/sign-in-client";

export default function SignInPage() {
  return (
    <main className="sign-in-layout">
      <SignInHeroCard />

      <section className="sign-in-auth">
        <Image className="sign-in-logo" src="/later-logo.svg" alt="Later" width={112} height={39} priority />
        <p className="sign-in-explainer">
          Enter your email and we&apos;ll send you a secure magic link. Open it on this device to sign in or create your
          account automatically.
        </p>
        <Suspense fallback={<p>Loading sign-in…</p>}>
          <SignInClient />
        </Suspense>
      </section>
      <p
        className="sign-in-support"
      >
        <a
          href="mailto:duhnov.vladislav@gmail.com"
          className="sign-in-support-link"
        >
          support:duhnov.vladislav@gmail.com
        </a>
      </p>
    </main>
  );
}
