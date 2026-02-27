import { getDomainFaviconUrl } from "@/lib/parse";

function isSafeHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (!(u.protocol === "http:" || u.protocol === "https:")) return false;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local")) return false;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      const [a, b] = host.split(".").map(Number);
      if (a === 10) return false;
      if (a === 127) return false;
      if (a === 192 && b === 168) return false;
      if (a === 172 && b >= 16 && b <= 31) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function fetchLinkPreview(url: string): Promise<{
  previewTitle: string | null;
  previewIconUrl: string | null;
  metadataStatus: "ready" | "failed";
}> {
  const fallback = {
    previewTitle: null,
    previewIconUrl: getDomainFaviconUrl(url),
    metadataStatus: "failed" as const
  };

  if (!isSafeHttpUrl(url)) return fallback;

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "user-agent": "SmartRemindersBot/0.1" },
      signal: AbortSignal.timeout(3_000)
    });

    if (!response.ok) return fallback;
    const html = await response.text();
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);

    return {
      previewTitle: titleMatch?.[1]?.trim() || null,
      previewIconUrl: getDomainFaviconUrl(url),
      metadataStatus: "ready"
    };
  } catch {
    return fallback;
  }
}
