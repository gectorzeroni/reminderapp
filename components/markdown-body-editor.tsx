"use client";

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import { Link } from "griddy-icons";
import { sanitizeNoteHtml } from "@/lib/note";
import { isLikelyUrl } from "@/lib/parse";

type Props = {
  valueHtml: string;
  onChange: (html: string) => void;
  className?: string;
  placeholder?: string;
  onAttachLinkPreview?: (url: string) => void;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function MarkdownBodyEditor({ valueHtml, onChange, className, placeholder, onAttachLinkPreview }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const [toolbarPosition, setToolbarPosition] = useState({ x: 0, y: 0 });
  const [selectionActive, setSelectionActive] = useState(false);
  const lastExternalValueRef = useRef("");
  const enterPressCountRef = useRef(0);
  const enterResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!editorRef.current) return;
    const next = sanitizeNoteHtml(valueHtml || "");
    const isFocused = document.activeElement === editorRef.current;
    if (!isFocused && editorRef.current.innerHTML !== next) {
      editorRef.current.innerHTML = next;
    }
    lastExternalValueRef.current = next;
  }, [valueHtml]);

  useEffect(() => {
    function onDocumentPointerDown(event: MouseEvent) {
      if (!containerRef.current) return;
      if (containerRef.current.contains(event.target as Node)) return;
      setToolbarOpen(false);
    }

    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setToolbarOpen(false);
    }

    document.addEventListener("mousedown", onDocumentPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onDocumentPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (enterResetTimerRef.current) {
        clearTimeout(enterResetTimerRef.current);
        enterResetTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    function onSelectionChange() {
      if (!containerRef.current) return;
      const selection = window.getSelection();
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      const anchorNode = selection?.anchorNode ?? null;
      const isInside = Boolean(anchorNode && containerRef.current.contains(anchorNode));
      if (!isInside) {
        setSelectionActive(false);
        return;
      }
      setSelectionActive(Boolean(range && !range.collapsed && selection?.toString().trim()));
    }
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  function openToolbarAt(x: number, y: number) {
    const bounds = containerRef.current?.getBoundingClientRect();
    const localX = bounds ? x - bounds.left : x;
    const localY = bounds ? y - bounds.top : y;
    const nextPos = {
      x: Math.max(8, localX),
      y: Math.max(8, localY + 10)
    };
    setToolbarPosition(nextPos);
    document.documentElement.style.setProperty("--mdx-toolbar-x", `${nextPos.x}px`);
    document.documentElement.style.setProperty("--mdx-toolbar-y", `${nextPos.y}px`);
    setToolbarOpen(true);
  }

  function handleContextMenu(event: ReactMouseEvent<HTMLDivElement>) {
    const target = event.target as Node | null;
    if (!target || !containerRef.current?.contains(target)) {
      setToolbarOpen(false);
      return;
    }

    event.preventDefault();
    openToolbarAt(event.clientX, event.clientY);
  }

  function handleMouseUp(event: ReactMouseEvent<HTMLDivElement>) {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) return;
    const range = selection.rangeCount ? selection.getRangeAt(0) : null;
    if (!range) return;
    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    openToolbarAt(rect.left + rect.width / 2, rect.top);
    event.stopPropagation();
  }

  function openToolbarAtSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) return;
    const range = selection.rangeCount ? selection.getRangeAt(0) : null;
    if (!range) return;
    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    openToolbarAt(rect.left + rect.width / 2, rect.top);
  }

  function focusEditor() {
    editorRef.current?.focus();
  }

  function exec(command: string, value?: string) {
    focusEditor();
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(command, false, value);
    const html = sanitizeNoteHtml(editorRef.current?.innerHTML || "");
    onChange(html);
  }

  function setBlock(type: "p" | "h1" | "h2" | "h3" | "h4" | "blockquote") {
    exec("formatBlock", `<${type}>`);
  }

  function handleAddLink() {
    focusEditor();
    const selection = window.getSelection();
    const selected = selection?.toString().trim() ?? "";
    const defaultValue = isLikelyUrl(selected) ? selected : "https://";
    const raw = window.prompt("Enter link URL", defaultValue);
    if (!raw) return;
    const url = raw.trim();
    if (!url) return;
    if (!selection || selection.isCollapsed) {
      exec("insertHTML", `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`);
    } else {
      exec("createLink", url);
    }
    onAttachLinkPreview?.(url);
  }

  return (
    <div
      ref={containerRef}
      className={`${className ?? ""} mdx-editor-surface ${toolbarOpen ? "is-toolbar-open" : ""}`.trim()}
      onContextMenuCapture={handleContextMenu}
      onMouseUpCapture={handleMouseUp}
      onMouseDownCapture={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest(".mdxeditor-toolbar--contextual")) {
          event.preventDefault();
        }
      }}
      style={
        {
          "--mdx-toolbar-x": `${toolbarPosition.x}px`,
          "--mdx-toolbar-y": `${toolbarPosition.y}px`
        } as CSSProperties
      }
    >
      <div
        ref={editorRef}
        className="mdx-editor__content rich-text"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder || "Write details..."}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          openToolbarAt(event.clientX, event.clientY);
        }}
        onMouseUp={() => {
          openToolbarAtSelection();
        }}
        onKeyUp={() => {
          openToolbarAtSelection();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            enterPressCountRef.current += 1;
            if (enterResetTimerRef.current) clearTimeout(enterResetTimerRef.current);
            enterResetTimerRef.current = setTimeout(() => {
              enterPressCountRef.current = 0;
              enterResetTimerRef.current = null;
            }, 520);
            if (enterPressCountRef.current >= 2) {
              window.setTimeout(() => {
                focusEditor();
                document.execCommand("formatBlock", false, "<p>");
              }, 0);
              enterPressCountRef.current = 0;
            }
            return;
          }
          enterPressCountRef.current = 0;
          if (event.key === "/" && !toolbarOpen) {
            event.preventDefault();
            const rect = editorRef.current?.getBoundingClientRect();
            openToolbarAt((rect?.left ?? 16) + 24, (rect?.top ?? 16) + 24);
          }
        }}
        onInput={() => {
          const html = sanitizeNoteHtml(editorRef.current?.innerHTML || "");
          if (html !== lastExternalValueRef.current) {
            onChange(html);
          }
        }}
      />
      <div className={`mdxeditor-toolbar--contextual ${toolbarOpen ? "is-open" : ""}`} role="menu" aria-hidden={!toolbarOpen}>
        <button type="button" className="btn subtle" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("bold")}>
          B
        </button>
        <button type="button" className="btn subtle" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("italic")}>
          I
        </button>
        <button type="button" className="btn subtle" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("underline")}>
          U
        </button>
        <button type="button" className="btn subtle" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("insertUnorderedList")}>
          • List
        </button>
        <button type="button" className="btn subtle" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("insertOrderedList")}>
          1. List
        </button>
        <button type="button" className="btn subtle" onMouseDown={(e) => e.preventDefault()} onClick={() => setBlock("blockquote")}>
          Quote
        </button>
        <button type="button" className="btn subtle" onMouseDown={(e) => e.preventDefault()} onClick={() => setBlock("h1")}>
          H1
        </button>
        <button type="button" className="btn subtle" onMouseDown={(e) => e.preventDefault()} onClick={() => setBlock("h2")}>
          H2
        </button>
        <button type="button" className="btn subtle" onMouseDown={(e) => e.preventDefault()} onClick={() => setBlock("h3")}>
          H3
        </button>
        <button type="button" className="btn subtle" onMouseDown={(e) => e.preventDefault()} onClick={() => setBlock("h4")}>
          H4
        </button>
        <button type="button" className="btn subtle" onMouseDown={(e) => e.preventDefault()} onClick={() => setBlock("p")}>
          Body
        </button>
        <button type="button" className="btn subtle" onMouseDown={(e) => e.preventDefault()} onClick={handleAddLink}>
          <Link size={16} aria-hidden="true" />
        </button>
        <div className="mdx-color-row">
          {["#04051A", "#1D4ED8", "#7C3AED", "#B91C1C"].map((color) => (
            <button
              key={color}
              type="button"
              className="mdx-color-dot"
              style={{ ["--dot" as string]: color } as CSSProperties}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec("foreColor", color)}
              aria-label={`Apply ${color} text color`}
            />
          ))}
        </div>
        {selectionActive ? null : <span className="mdx-toolbar-hint">Style applies to next typing</span>}
      </div>
    </div>
  );
}
