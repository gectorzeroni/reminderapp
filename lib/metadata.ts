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

function decodeHtml(value: string): string {
  const named: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”" };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (!entity.startsWith("#")) return named[entity.toLowerCase()] ?? match;
    const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  }).replace(/\s+/g, " ").trim();
}

export function parseLinkMetadata(html: string, pageUrl: string) {
  const tags = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  let socialTitle: string | null = null;
  let icon: string | null = null;
  for (const tag of tags.match(/<(?:meta|link)\b[^>]*>/gi) ?? []) {
    const attrs: Record<string, string> = {};
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      attrs[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4]);
    }
    const name = (attrs.property ?? attrs.name ?? "").toLowerCase();
    if (name === "og:title" && attrs.content) socialTitle = attrs.content;
    else if (name === "twitter:title" && attrs.content && !socialTitle) socialTitle = attrs.content;
    if (!icon && /^(?:icon|shortcut icon|apple-touch-icon)$/i.test(attrs.rel ?? "") && attrs.href) {
      try {
        const resolved = new URL(attrs.href, pageUrl);
        if (isSafeHttpUrl(resolved.href)) icon = resolved.href;
      } catch { /* Ignore malformed icon URLs. */ }
    }
  }
  return {
    previewTitle: socialTitle || decodeHtml(tags.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "") || null,
    previewIconUrl: icon || getDomainFaviconUrl(pageUrl)
  };
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
    const metadata = parseLinkMetadata(html, response.url || url);

    return {
      ...metadata,
      metadataStatus: "ready"
    };
  } catch {
    return fallback;
  }
}
