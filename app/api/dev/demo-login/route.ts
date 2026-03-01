import { NextResponse } from "next/server";
import { DEMO_USER_ID } from "@/lib/constants";

const DEMO_COOKIE_NAME = "later-demo-user-id";

function isLocalHostHeader(host: string | null): boolean {
  if (!host) return false;
  const clean = host.split(":")[0]?.toLowerCase() ?? "";
  return clean === "localhost" || clean === "127.0.0.1";
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const host = request.headers.get("host");
  if (!isLocalHostHeader(host)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(DEMO_COOKIE_NAME, DEMO_USER_ID, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
  return response;
}

