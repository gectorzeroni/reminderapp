const NOTE_PREFIX = "__later_note_v1__:";

export type ParsedNote = {
  title: string;
  bodyHtml: string;
  tags: string[];
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
  function normalizeCssColor(value: string): string | null {
    const v = value.trim();
    if (!v) return null;
    if (/^#[0-9a-f]{3,8}$/i.test(v)) return v;
    if (/^(rgb|rgba|hsl|hsla)\([^)]*\)$/i.test(v)) return v;
    if (/^[a-z]+$/i.test(v)) return v.toLowerCase();
    return null;
  }

  function sanitizeStyleAttribute(styleValue: string): string {
    const entries = styleValue
      .split(";")
      .map((entry) => entry.trim())
      .filter(Boolean);

    const safe: string[] = [];
    for (const entry of entries) {
      const idx = entry.indexOf(":");
      if (idx <= 0) continue;
      const prop = entry.slice(0, idx).trim().toLowerCase();
      const rawValue = entry.slice(idx + 1).trim();
      if (!rawValue) continue;

      if (prop === "color") {
        const color = normalizeCssColor(rawValue);
        if (color) safe.push(`color:${color}`);
        continue;
      }

      if (prop === "background-image") {
        if (/^linear-gradient\([^)]*\)$/i.test(rawValue)) {
          safe.push(`background-image:${rawValue}`);
        }
        continue;
      }

      if (prop === "background-clip" || prop === "-webkit-background-clip") {
        if (rawValue.toLowerCase() === "text") safe.push(`${prop}:text`);
        continue;
      }

      if (prop === "-webkit-text-fill-color") {
        const textFill = rawValue.toLowerCase() === "transparent" ? "transparent" : normalizeCssColor(rawValue);
        if (textFill) safe.push(`-webkit-text-fill-color:${textFill}`);
      }
    }

    return safe.join(";");
  }

  let html = input || "";
  html = html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "");
  html = html.replace(/<!--[\s\S]*?-->/g, "");

  // Convert legacy <font color="..."> to span style so color formatting survives saves.
  html = html.replace(/<font\b([^>]*)>/gi, (_m, attrs: string) => {
    const colorMatch = attrs.match(/\bcolor\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
    const colorRaw = colorMatch?.[1] ?? colorMatch?.[2] ?? colorMatch?.[3] ?? "";
    const color = normalizeCssColor(colorRaw);
    return color ? `<span style="color:${color}">` : "<span>";
  });
  html = html.replace(/<\/font>/gi, "</span>");

  html = html.replace(/<(?!\/?(b|strong|i|em|u|s|br|p|ul|ol|li|span)\b)[^>]*>/gi, "");
  html = html.replace(/<(\/?)(b|strong|i|em|u|s|br|p|ul|ol|li)(?:\s[^>]*)?>/gi, "<$1$2>");
  html = html.replace(/<span(?:\s[^>]*)?>/gi, (tag) => {
    const styleMatch = tag.match(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const rawStyle = styleMatch?.[1] ?? styleMatch?.[2] ?? "";
    const safeStyle = sanitizeStyleAttribute(rawStyle);
    return safeStyle ? `<span style="${safeStyle}">` : "<span>";
  });
  html = html.replace(/<\/span(?:\s[^>]*)?>/gi, "</span>");
  return html.trim();
}

export function serializeNote(title: string, bodyHtml: string, tags: string[] = []): string {
  const safeTitle = title.trim();
  const safeBody = sanitizeNoteHtml(bodyHtml);
  const safeTags = Array.from(new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)));
  return `${NOTE_PREFIX}${JSON.stringify({ title: safeTitle, bodyHtml: safeBody, tags: safeTags })}`;
}

export function parseStoredNote(note: string | null | undefined): ParsedNote {
  const raw = note?.trim() ?? "";
  if (!raw) return { title: "", bodyHtml: "", tags: [], plainText: "" };

  if (raw.startsWith(NOTE_PREFIX)) {
    try {
      const payload = JSON.parse(raw.slice(NOTE_PREFIX.length)) as { title?: string; bodyHtml?: string; tags?: string[] };
      const title = (payload.title ?? "").trim();
      const bodyHtml = sanitizeNoteHtml(payload.bodyHtml ?? "");
      const tags = Array.from(new Set((payload.tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean)));
      const plainText = [title, stripHtml(bodyHtml), tags.map((tag) => `#${tag}`).join(" ")]
        .filter(Boolean)
        .join("\n")
        .trim();
      return { title, bodyHtml, tags, plainText };
    } catch {
      // fall through to legacy parsing
    }
  }

  const lines = raw.split("\n");
  const legacyTitle = (lines[0] ?? "").trim();
  const legacyBody = lines.slice(1).join("\n").trim();
  const bodyHtml = textToHtml(legacyBody);
  const plainText = [legacyTitle, legacyBody].filter(Boolean).join("\n").trim();
  return { title: legacyTitle, bodyHtml, tags: [], plainText };
}
