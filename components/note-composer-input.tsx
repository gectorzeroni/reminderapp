"use client";

import { useLayoutEffect, useRef, type KeyboardEvent, type RefObject } from "react";
import { loadPreview } from "@/components/note-link-text";
import { getDomainFaviconUrl } from "@/lib/parse";

// Preview labels are presentation only: saving/copying always uses the original URL.
export function readComposerText(root: Node): string {
  if (root instanceof HTMLElement && root.dataset.url) return root.dataset.url;
  if (root.nodeType === Node.TEXT_NODE) return root.textContent ?? "";
  if (root.nodeName === "BR") return "\n";
  return Array.from(root.childNodes).map((node, index) => {
    const text = readComposerText(node);
    return index > 0 && /^(DIV|P)$/.test(node.nodeName) ? `\n${text}` : text;
  }).join("");
}

export function NoteComposerInput({ value, onChange, onKeyDown, inputRef }: {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  inputRef: RefObject<HTMLDivElement | null>;
}) {
  const lastValue = useRef<string | null>(null);

  function enrich() {
    const root = inputRef.current;
    root?.querySelectorAll<HTMLElement>("[data-url]").forEach((token) => {
      const url = token.dataset.url!;
      void loadPreview(url).then((preview) => {
        if (!root.contains(token)) return;
        token.replaceChildren();
        const iconUrl = preview.previewIconUrl || getDomainFaviconUrl(url);
        if (iconUrl) {
          const image = document.createElement("img");
          image.src = iconUrl;
          image.alt = "";
          image.width = image.height = 20;
          image.onerror = () => image.remove();
          token.append(image);
        }
        token.append(document.createTextNode(preview.previewTitle || url));
      });
    });
  }

  function markup(text: string) {
    const container = document.createElement("div");
    for (const part of text.split(/(https?:\/\/[^\s<>"']+)/gi)) {
      if (/^https?:\/\//i.test(part)) {
        const url = part.replace(/[.,;!?]+$/, "");
        const token = document.createElement("span");
        token.contentEditable = "false";
        token.className = "composer-link-preview";
        token.dataset.url = url;
        token.title = url;
        token.textContent = url;
        container.append(token, document.createTextNode(part.slice(url.length)));
      } else {
        part.split("\n").forEach((line, index) => {
          if (index) container.append(document.createElement("br"));
          container.append(document.createTextNode(line));
        });
      }
    }
    return container.innerHTML;
  }

  function emit() {
    const root = inputRef.current;
    if (!root) return;
    const text = readComposerText(root);
    lastValue.current = text;
    onChange(text);
    if (!text) root.replaceChildren();
  }

  useLayoutEffect(() => {
    if (lastValue.current === value || !inputRef.current) return;
    inputRef.current.innerHTML = markup(value);
    lastValue.current = value;
    enrich();
  }, [value]); // DOM owns the caret; React only resets external value changes.

  return <div
    ref={inputRef}
    className="notes-composer-input"
    contentEditable
    suppressContentEditableWarning
    role="textbox"
    aria-label="Write a note"
    aria-multiline="true"
    data-placeholder="Write a note…"
    onInput={emit}
    onKeyDown={onKeyDown}
    onPaste={(event) => {
      event.preventDefault();
      const text = event.clipboardData.getData("text/plain");
      // Native insertion keeps selection replacement and undo/redo in the browser's editing history.
      const markerId = `paste-caret-${crypto.randomUUID()}`;
      document.execCommand("insertHTML", false, `${markup(text)}<span id="${markerId}">\u200b</span>`);
      const marker = document.getElementById(markerId);
      const selection = window.getSelection();
      if (marker && selection) {
        const caret = document.createRange();
        caret.setStartBefore(marker);
        caret.collapse(true);
        marker.remove();
        selection.removeAllRanges();
        selection.addRange(caret);
      }
      emit();
      enrich();
    }}
    onCopy={(event) => {
      const selection = window.getSelection();
      if (!selection?.rangeCount) return;
      event.preventDefault();
      event.clipboardData.setData("text/plain", readComposerText(selection.getRangeAt(0).cloneContents()));
    }}
    onCut={(event) => {
      const selection = window.getSelection();
      if (!selection?.rangeCount) return;
      event.preventDefault();
      event.clipboardData.setData("text/plain", readComposerText(selection.getRangeAt(0).cloneContents()));
      document.execCommand("delete");
      emit();
    }}
    onDrop={(event) => event.preventDefault()}
  />;
}
