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
  const matches = value.match(/(^|\s)#([a-zA-Z0-9_-]+)/g) ?? [];
  const tags = matches
    .map((m) => {
      const tag = m.trim().slice(1);
      return tag.toLowerCase();
    })
    .filter(Boolean);
  return Array.from(new Set(tags));
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
