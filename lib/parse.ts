export function isLikelyUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function extractUrlsFromText(value: string): string[] {
  const urls = value.match(/\bhttps?:\/\/[^\s<>"']+/gi) ?? [];
  return Array.from(new Set(urls));
}

export function extractTagsFromText(value: string): string[] {
  const matches = value.match(/#[a-zA-Z0-9_-]+/g) ?? [];
  const tags = matches.map((m) => m.slice(1).toLowerCase()).filter(Boolean);
  return Array.from(new Set(tags));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function stripTagsFromText(value: string): string {
  return value
    .replace(/(^|\s)#[a-zA-Z0-9_-]+\b/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function stripSpecificTagFromText(value: string, tag: string): string {
  const safe = escapeRegExp(tag.toLowerCase());
  const pattern = new RegExp(`(^|\\s)#${safe}\\b`, "gi");
  return value
    .replace(pattern, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function stripTagsFromHtml(html: string): string {
  const parts = html.split(/(<[^>]+>)/g);
  return parts
    .map((part) => {
      if (part.startsWith("<") && part.endsWith(">")) return part;
      return part
        .replace(/(^|\s)#[a-zA-Z0-9_-]+\b/g, "$1")
        .replace(/[ \t]{2,}/g, " ")
        .replace(/[ \t]+\n/g, "\n");
    })
    .join("");
}

export function stripSpecificTagFromHtml(html: string, tag: string): string {
  const safe = escapeRegExp(tag.toLowerCase());
  const pattern = new RegExp(`(^|\\s)#${safe}\\b`, "gi");
  const parts = html.split(/(<[^>]+>)/g);
  return parts
    .map((part) => {
      if (part.startsWith("<") && part.endsWith(">")) return part;
      return part
        .replace(pattern, "$1")
        .replace(/[ \t]{2,}/g, " ")
        .replace(/[ \t]+\n/g, "\n");
    })
    .join("");
}

export function getDomainFaviconUrl(urlString: string): string | null {
  try {
    const url = new URL(urlString);
    return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=64`;
  } catch {
    return null;
  }
}

export function summarizeFileSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
