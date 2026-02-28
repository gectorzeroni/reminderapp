const NOTE_PREFIX = "__later_note_v1__:";

export type ParsedNote = {
  title: string;
  bodyHtml: string;
  plainText: string;
};

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function textToHtml(text: string): string {
  if (!text.trim()) return "";
  return escapeHtml(text).replace(/\n/g, "<br>");
}

export function sanitizeNoteHtml(input: string): string {
  let html = input || "";
  html = html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "");
  html = html.replace(/<!--[\s\S]*?-->/g, "");
  html = html.replace(/<(?!\/?(b|strong|i|em|u|s|br|p|ul|ol|li)\b)[^>]*>/gi, "");
  html = html.replace(/<(\/?)(b|strong|i|em|u|s|br|p|ul|ol|li)(?:\s[^>]*)?>/gi, "<$1$2>");
  return html.trim();
}

export function serializeNote(title: string, bodyHtml: string): string {
  const safeTitle = title.trim();
  const safeBody = sanitizeNoteHtml(bodyHtml);
  return `${NOTE_PREFIX}${JSON.stringify({ title: safeTitle, bodyHtml: safeBody })}`;
}

export function parseStoredNote(note: string | null | undefined): ParsedNote {
  const raw = note?.trim() ?? "";
  if (!raw) return { title: "", bodyHtml: "", plainText: "" };

  if (raw.startsWith(NOTE_PREFIX)) {
    try {
      const payload = JSON.parse(raw.slice(NOTE_PREFIX.length)) as { title?: string; bodyHtml?: string };
      const title = (payload.title ?? "").trim();
      const bodyHtml = sanitizeNoteHtml(payload.bodyHtml ?? "");
      const plainText = [title, stripHtml(bodyHtml)].filter(Boolean).join("\n").trim();
      return { title, bodyHtml, plainText };
    } catch {
      // fall through to legacy parsing
    }
  }

  const lines = raw.split("\n");
  const legacyTitle = (lines[0] ?? "").trim();
  const legacyBody = lines.slice(1).join("\n").trim();
  const bodyHtml = textToHtml(legacyBody);
  const plainText = [legacyTitle, legacyBody].filter(Boolean).join("\n").trim();
  return { title: legacyTitle, bodyHtml, plainText };
}

