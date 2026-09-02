import { marked } from "marked";
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
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/blockquote>/gi, "\n")
    .replace(/<\/h[1-4]>/gi, "\n")
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

export function markdownToHtml(markdown: string): string {
  if (!markdown.trim()) return "";
  const html = marked.parse(markdown, { gfm: true, breaks: true }) as string;
  return sanitizeNoteHtml(html);
}

export function sanitizeNoteHtml(input: string): string {
  function isTransparentCssColor(value: string): boolean {
    const v = value.trim().toLowerCase();
    if (!v) return false;
    if (v === "transparent") return true;

    const rgba = v.match(/^rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)$/i);
    if (rgba) {
      const alpha = Number(rgba[1]);
      return Number.isFinite(alpha) && alpha <= 0;
    }

    const hsla = v.match(/^hsla\(\s*[\d.]+\s*,\s*[\d.]+%\s*,\s*[\d.]+%\s*,\s*([\d.]+)\s*\)$/i);
    if (hsla) {
      const alpha = Number(hsla[1]);
      return Number.isFinite(alpha) && alpha <= 0;
    }

    return false;
  }

  function normalizeCssColor(value: string): string | null {
    const v = value.trim();
    if (!v) return null;
    if (/[<>]/.test(v)) return null;
    if (/url\s*\(/i.test(v)) return null;
    if (/expression\s*\(/i.test(v)) return null;
    if (/^#[0-9a-f]{3,8}$/i.test(v)) return v;
    if (/^(rgb|rgba|hsl|hsla|lab|lch|oklab|oklch|color)\([^)]*\)$/i.test(v)) return v;
    if (/^[a-z-]+$/i.test(v)) return v.toLowerCase();
    // Allow safe functional/custom color tokens emitted by browsers.
    return v;
  }

  function sanitizeStyleAttribute(styleValue: string): string {
    const entries = styleValue
      .split(";")
      .map((entry) => entry.trim())
      .filter(Boolean);

    let colorValue: string | null = null;
    let backgroundImageValue: string | null = null;
    let backgroundClipText = false;
    let webkitBackgroundClipText = false;
    let webkitTextFillValue: string | null = null;

    for (const entry of entries) {
      const idx = entry.indexOf(":");
      if (idx <= 0) continue;
      const prop = entry.slice(0, idx).trim().toLowerCase();
      const rawValue = entry.slice(idx + 1).trim();
      if (!rawValue) continue;

      if (prop === "color") {
        colorValue = normalizeCssColor(rawValue);
        continue;
      }

      if (prop === "background-image") {
        if (/^linear-gradient\([^)]*\)$/i.test(rawValue)) {
          backgroundImageValue = rawValue;
        }
        continue;
      }

      if (prop === "background-clip" || prop === "-webkit-background-clip") {
        if (rawValue.toLowerCase() === "text") {
          if (prop === "background-clip") backgroundClipText = true;
          if (prop === "-webkit-background-clip") webkitBackgroundClipText = true;
        }
        continue;
      }

      if (prop === "-webkit-text-fill-color") {
        webkitTextFillValue = rawValue.toLowerCase() === "transparent" ? "transparent" : normalizeCssColor(rawValue);
      }
    }

    const safe: string[] = [];
    const isGradientText = Boolean(backgroundImageValue && (backgroundClipText || webkitBackgroundClipText));
    const allowTransparentTextColor = isGradientText;

    const colorIsTransparent = colorValue ? isTransparentCssColor(colorValue) : false;
    if (colorValue && (!colorIsTransparent || allowTransparentTextColor)) {
      safe.push(`color:${colorValue}`);
    }
    if (backgroundImageValue) safe.push(`background-image:${backgroundImageValue}`);
    if (backgroundClipText) safe.push("background-clip:text");
    if (webkitBackgroundClipText) safe.push("-webkit-background-clip:text");
    const textFillIsTransparent = webkitTextFillValue ? isTransparentCssColor(webkitTextFillValue) : false;
    if (webkitTextFillValue && isGradientText && (!textFillIsTransparent || isGradientText)) {
      safe.push(`-webkit-text-fill-color:${webkitTextFillValue}`);
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

  html = html.replace(/<(?!\/?(a|b|strong|i|em|u|s|br|p|div|h1|h2|h3|h4|blockquote|ul|ol|li|span)\b)[^>]*>/gi, "");
  html = html.replace(/<(\/?)(b|strong|i|em|u|s|br|p|div|h1|h2|h3|h4|blockquote)(?:\s[^>]*)?>/gi, "<$1$2>");
  html = html.replace(/<a(?:\s[^>]*)?>/gi, (tag) => {
    const hrefMatch = tag.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const hrefRaw = (hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3] ?? "").trim();
    const safeHref = /^https?:\/\//i.test(hrefRaw) ? hrefRaw : "";
    return safeHref ? `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">` : "<a>";
  });
  html = html.replace(/<\/a(?:\s[^>]*)?>/gi, "</a>");
  html = html.replace(/<ul(?:\s[^>]*)?>/gi, (tag) => {
    const dataListMatch = tag.match(/\bdata-list\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const dataListRaw = (dataListMatch?.[1] ?? dataListMatch?.[2] ?? dataListMatch?.[3] ?? "").trim().toLowerCase();
    const dataList = dataListRaw === "todo" ? "todo" : null;
    return dataList ? `<ul data-list="${dataList}">` : "<ul>";
  });
  html = html.replace(/<\/ul(?:\s[^>]*)?>/gi, "</ul>");
  html = html.replace(/<ol(?:\s[^>]*)?>/gi, "<ol>");
  html = html.replace(/<\/ol(?:\s[^>]*)?>/gi, "</ol>");
  html = html.replace(/<li(?:\s[^>]*)?>/gi, (tag) => {
    const checkedMatch = tag.match(/\bdata-checked\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const checkedRaw = (checkedMatch?.[1] ?? checkedMatch?.[2] ?? checkedMatch?.[3] ?? "").trim().toLowerCase();
    const isChecked = checkedRaw === "true";
    return isChecked ? '<li data-checked="true">' : "<li>";
  });
  html = html.replace(/<\/li(?:\s[^>]*)?>/gi, "</li>");
  html = html.replace(/<span(?:\s[^>]*)?>/gi, (tag) => {
    const styleMatch = tag.match(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const rawStyle = styleMatch?.[1] ?? styleMatch?.[2] ?? "";
    const safeStyle = sanitizeStyleAttribute(rawStyle);
    const todoTextMatch = tag.match(/\bdata-todo-text\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const todoTextRaw = (todoTextMatch?.[1] ?? todoTextMatch?.[2] ?? todoTextMatch?.[3] ?? "").trim().toLowerCase();
    const todoTextAttr = todoTextRaw === "true" ? ' data-todo-text="true"' : "";
    return `<span${safeStyle ? ` style="${safeStyle}"` : ""}${todoTextAttr}>`;
  });
  html = html.replace(/<\/span(?:\s[^>]*)?>/gi, "</span>");
  return html.trim();
}

export function serializeNote(title: string, bodyHtml: string, tags: string[] = []): string {
  const safeTitle = "";
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
      const legacyTitle = (payload.title ?? "").trim();
      const bodyHtml = sanitizeNoteHtml(payload.bodyHtml ?? "");
      const mergedBodyHtml = sanitizeNoteHtml([legacyTitle ? textToHtml(legacyTitle) : "", bodyHtml].filter(Boolean).join("<br>"));
      const tags = Array.from(new Set((payload.tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean)));
      const plainText = [stripHtml(mergedBodyHtml), tags.map((tag) => `#${tag}`).join(" ")]
        .filter(Boolean)
        .join("\n")
        .trim();
      return { title: "", bodyHtml: mergedBodyHtml, tags, plainText };
    } catch {
      // fall through to legacy parsing
    }
  }

  const bodyHtml = textToHtml(raw);
  const plainText = raw.trim();
  return { title: "", bodyHtml, tags: [], plainText };
}
