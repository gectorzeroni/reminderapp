import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export function calendarConfig() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI;
  const key = process.env.GOOGLE_CALENDAR_ENCRYPTION_KEY;
  if (!clientId || !clientSecret || !redirectUri || !key || !/^[a-f\d]{64}$/i.test(key) || !getSupabaseServiceClient()) {
    throw new Error("Google Calendar is not configured. See the setup instructions in README.");
  }
  return { clientId, clientSecret, redirectUri, key: Buffer.from(key, "hex") };
}

export function encryptToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", calendarConfig().key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptToken(value: string) {
  const [iv, tag, encrypted] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", calendarConfig().key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export async function exchangeToken(params: Record<string, string>) {
  const { clientId, clientSecret } = calendarConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params }), cache: "no-store"
  });
  if (!response.ok) throw new Error("Google authorization failed. Please reconnect the account.");
  return response.json() as Promise<{ access_token: string; refresh_token?: string }>;
}

export function calendarDb() {
  calendarConfig();
  return getSupabaseServiceClient()!;
}

export async function googlePages<T>(url: URL, accessToken: string): Promise<T[]> {
  const items: T[] = [];
  do {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    if (!response.ok) throw new Error("Could not load Google Calendar events. Please reconnect the account.");
    const page = await response.json() as { items?: T[]; nextPageToken?: string };
    items.push(...(page.items ?? []));
    if (page.nextPageToken) url.searchParams.set("pageToken", page.nextPageToken);
    else url.searchParams.delete("pageToken");
  } while (url.searchParams.has("pageToken"));
  return items;
}
