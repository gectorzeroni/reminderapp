"use client";

import { useEffect, useState } from "react";
import { getDomainFaviconUrl } from "@/lib/parse";

type Preview = { previewTitle: string | null; previewIconUrl: string | null };
const previews = new Map<string, Promise<Preview>>();

export function loadPreview(url: string) {
  let pending = previews.get(url);
  if (!pending) {
    pending = fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Preview unavailable");
        return response.json() as Promise<Preview>;
      })
      .catch(() => ({ previewTitle: null, previewIconUrl: getDomainFaviconUrl(url) }));
    previews.set(url, pending);
  }
  return pending;
}

function PageLink({ url }: { url: string }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [iconFailed, setIconFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void loadPreview(url).then((result) => { if (active) setPreview(result); });
    return () => { active = false; };
  }, [url]);
  const icon = preview?.previewIconUrl || getDomainFaviconUrl(url);
  return (
    <a className="note-page-link" href={url} target="_blank" rel="noopener noreferrer" title={url} onClick={(event) => event.stopPropagation()}>
      {icon && !iconFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={icon} alt="" width={20} height={20} onError={() => setIconFailed(true)} />
      ) : <span aria-hidden="true">↗</span>}
      <span>{preview?.previewTitle || url}</span>
    </a>
  );
}

export function NoteLinkText({ text, onEdit, disabled }: { text: string; onEdit: () => void; disabled: boolean }) {
  return text.split(/(https?:\/\/[^\s<>"']+)/gi).map((part, index) => {
    if (!part) return null;
    if (/^https?:\/\//i.test(part)) {
      const url = part.replace(/[.,;!?]+$/, "");
      return <span key={`${index}-${part}`}><PageLink url={url} />{part.slice(url.length)}</span>;
    }
    return <span key={index}>{part.split("\n").map((line, lineIndex) => (
      <span key={lineIndex}>
        {lineIndex > 0 ? <br /> : null}
        {line ? <button type="button" className="note-text-fragment" disabled={disabled} onClick={onEdit} aria-label={`Edit note: ${text}`}>{line}</button> : null}
      </span>
    ))}</span>;
  });
}
