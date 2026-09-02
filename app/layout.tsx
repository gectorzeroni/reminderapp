import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource/rubik-burned/index.css";
import { AgentationOverlay } from "@/components/agentation-overlay";
import "./globals.css";

export const metadata: Metadata = {
  title: "Later™",
  description: "A quiet timeline for your notes."
};

export default function RootLayout({
  children
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <AgentationOverlay />
      </body>
    </html>
  );
}
