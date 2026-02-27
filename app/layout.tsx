import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter, Rubik_Burned } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter"
});

const rubikBurned = Rubik_Burned({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display"
});

export const metadata: Metadata = {
  title: "Later™",
  description: "Drop anything and get reminded at the right time."
};

export default function RootLayout({
  children
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${rubikBurned.variable}`}>{children}</body>
    </html>
  );
}
