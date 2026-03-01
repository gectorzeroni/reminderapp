"use client";

import * as motion from "motion/react-client";
import { AnimatePresence } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Checkbox } from "@/components/animate-ui/components/radix/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/animate-ui/components/radix/popover";
import { parseStoredNote, sanitizeNoteHtml, serializeNote } from "@/lib/note";
import { getTagChipStyle } from "@/lib/tag-colors";
import {
  extractTagsFromText,
  stripSpecificTagFromHtml,
  stripSpecificTagFromText,
  stripTagsFromHtml,
  stripTagsFromText,
  summarizeFileSize
} from "@/lib/parse";
import type { ReminderWithComputed } from "@/lib/types";

type Props = {
  reminder: ReminderWithComputed;
  onSnooze: (id: string, preset: "10m" | "1h" | "tomorrow") => void;
  onArchive: (id: string, reason: "completed" | "manual") => Promise<void> | void;
  onReschedule: (id: string, remindAt: string) => void;
  onUpdateNote?: (id: string, note: string, removeAttachmentIds?: string[]) => Promise<void> | void;
  compact?: boolean;
  onRestore?: (id: string) => void;
};

type EditorDraft = {
  title: string;
  html: string;
  tags: string[];
  attachmentIds: string[];
};

const TEXT_COLOR_PRESETS = ["#111827", "#2563eb", "#c2410c", "#059669"] as const;
const TEXT_GRADIENT_PRESETS = [
  "linear-gradient(90deg, #2563eb 0%, #7c3aed 100%)",
  "linear-gradient(90deg, #f97316 0%, #ef4444 100%)"
] as const;

function attachmentSummary(reminder: ReminderWithComputed) {
  return reminder.attachments.map((a) => {
    if (a.kind === "link") return a.previewTitle || a.url || "Link";
    if (a.kind === "image") return a.fileName || "Image";
    if (a.kind === "file") return a.fileName || "File";
    return a.textContent?.slice(0, 120) || "Text";
  });
}

function formatWhen(remindAt: string | null) {
  if (!remindAt) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(remindAt));
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\u00a0/g, " ")
    .trim();
}

function getYouTubeVideoId(urlString: string | null | undefined): string | null {
  if (!urlString) return null;
  try {
    const url = new URL(urlString);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id || null;
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      if (url.pathname === "/watch") {
        return url.searchParams.get("v");
      }
      if (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/embed/")) {
        const id = url.pathname.split("/").filter(Boolean)[1];
        return id || null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function getYouTubePreviewUrl(urlString: string | null | undefined): string | null {
  const videoId = getYouTubeVideoId(urlString);
  if (!videoId) return null;
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function ReminderCard({
  reminder,
  onSnooze,
  onArchive,
  onReschedule,
  onUpdateNote,
  compact = false,
  onRestore
}: Props) {
  const parsedNote = parseStoredNote(reminder.note);
  const title = parsedNote.title;
  const noteBodyHtml = parsedNote.bodyHtml;
  const showInlineBody = !title && Boolean(noteBodyHtml);
  const tags = parsedNote.tags.length ? parsedNote.tags : extractTagsFromText(parsedNote.plainText);
  const summaries = attachmentSummary(reminder);

  const [menuOpen, setMenuOpen] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorClosing, setEditorClosing] = useState(false);
  const [editorTitle, setEditorTitle] = useState(parsedNote.title);
  const [editorHtml, setEditorHtml] = useState(noteBodyHtml);
  const [editorTagState, setEditorTagState] = useState(tags);
  const [editorAttachments, setEditorAttachments] = useState(reminder.attachments);
  const [saving, setSaving] = useState(false);
  const [formatMenu, setFormatMenu] = useState<{ open: boolean; x: number; y: number }>({
    open: false,
    x: 0,
    y: 0
  });
  const editorRef = useRef<HTMLDivElement>(null);
  const editorPanelRef = useRef<HTMLDivElement>(null);
  const selectionRangeRef = useRef<Range | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSnapshotRef = useRef("");
  const pendingDraftRef = useRef<EditorDraft | null>(null);
  const lastCloseAtRef = useRef(0);
  const editorTags = useMemo(() => {
    const fromText = extractTagsFromText([editorTitle, htmlToPlainText(editorHtml)].filter(Boolean).join("\n"));
    return Array.from(new Set([...editorTagState, ...fromText]));
  }, [editorTagState, editorTitle, editorHtml]);

  const hasLeadingCheckbox = !compact && reminder.status !== "archived";
  const allAttachments = reminder.attachments;

  function getAttachmentHref(attachment: ReminderWithComputed["attachments"][number]) {
    if (attachment.kind === "link" && attachment.url) return attachment.url;
    if (attachment.kind === "image" && attachment.previewImageUrl) return attachment.previewImageUrl;
    return null;
  }

  function openAttachment(href: string) {
    window.open(href, "_blank", "noopener,noreferrer");
  }

  function isInteractiveTarget(target: EventTarget | null) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest("button, a, input, select, textarea, [role='link'], [contenteditable='true']"));
  }

  function openEditor() {
    if (compact || reminder.status === "archived" || !onUpdateNote) return;
    if (editorClosing) return;
    if (Date.now() - lastCloseAtRef.current < 220) return;
    setEditorTitle(parsedNote.title);
    setEditorHtml(noteBodyHtml);
    setEditorTagState(tags);
    setEditorAttachments(reminder.attachments);
    setEditorClosing(false);
    setEditorOpen(true);
  }

  function applyFormatting(command: "bold" | "italic" | "underline" | "strikeThrough") {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = window.getSelection();
    editor.focus();
    if (selectionRangeRef.current && selection) {
      selection.removeAllRanges();
      selection.addRange(selectionRangeRef.current);
    }
    document.execCommand(command);
    if (selection?.rangeCount) {
      selectionRangeRef.current = selection.getRangeAt(0).cloneRange();
    }
    setEditorHtml(editor.innerHTML);
    setFormatMenu((prev) => ({ ...prev, open: false }));
  }

  function applyTextColor(color: string) {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = window.getSelection();
    editor.focus();
    if (selectionRangeRef.current && selection) {
      selection.removeAllRanges();
      selection.addRange(selectionRangeRef.current);
    }
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const span = document.createElement("span");
    span.style.color = color;
    const fragment = range.extractContents();
    span.appendChild(fragment);
    range.insertNode(span);
    const newRange = document.createRange();
    newRange.selectNodeContents(span);
    selection.removeAllRanges();
    selection.addRange(newRange);
    selectionRangeRef.current = newRange.cloneRange();
    if (selection?.rangeCount) {
      selectionRangeRef.current = selection.getRangeAt(0).cloneRange();
    }
    setEditorHtml(editor.innerHTML);
    setFormatMenu((prev) => ({ ...prev, open: false }));
  }

  function applyGradientText(gradient: string) {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = window.getSelection();
    editor.focus();
    if (selectionRangeRef.current && selection) {
      selection.removeAllRanges();
      selection.addRange(selectionRangeRef.current);
    }
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const span = document.createElement("span");
    span.style.backgroundImage = gradient;
    span.style.backgroundClip = "text";
    (span.style as CSSStyleDeclaration & { webkitBackgroundClip?: string }).webkitBackgroundClip = "text";
    span.style.color = "transparent";
    (span.style as CSSStyleDeclaration & { webkitTextFillColor?: string }).webkitTextFillColor = "transparent";
    const fragment = range.extractContents();
    span.appendChild(fragment);
    range.insertNode(span);
    const newRange = document.createRange();
    newRange.selectNodeContents(span);
    selection.removeAllRanges();
    selection.addRange(newRange);
    selectionRangeRef.current = newRange.cloneRange();
    setEditorHtml(editor.innerHTML);
    setFormatMenu((prev) => ({ ...prev, open: false }));
  }

  function openFormatMenuFromSelection(clientX?: number, clientY?: number) {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0 || selection.isCollapsed) return;
    if (!selection.toString().trim()) return;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    selectionRangeRef.current = range.cloneRange();
    if (typeof clientX === "number" && typeof clientY === "number") {
      setFormatMenu({ open: true, x: clientX, y: clientY });
      return;
    }
    const rect = range.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top;
    setFormatMenu({ open: true, x, y });
  }

  function snapshotDraft(draft: EditorDraft) {
    return JSON.stringify({
      title: draft.title.trim(),
      html: sanitizeNoteHtml(draft.html),
      tags: Array.from(new Set(draft.tags.map((tag) => tag.toLowerCase()))).sort(),
      attachmentIds: draft.attachmentIds
    });
  }

  async function persistDraft(draft: EditorDraft) {
    if (!onUpdateNote) return;
    const snapshot = snapshotDraft(draft);
    if (snapshot === lastSavedSnapshotRef.current) return;
    if (saving) {
      pendingDraftRef.current = draft;
      return;
    }

    setSaving(true);
    try {
      const removeAttachmentIds = reminder.attachments
        .filter((attachment) => !draft.attachmentIds.includes(attachment.id))
        .map((attachment) => attachment.id);
      const extractedTags = extractTagsFromText([draft.title, htmlToPlainText(draft.html)].filter(Boolean).join("\n"));
      const mergedTags = Array.from(new Set([...(draft.tags ?? []), ...extractedTags]));
      const cleanedTitle = stripTagsFromText(draft.title);
      const cleanedHtml = sanitizeNoteHtml(stripTagsFromHtml(draft.html));
      await Promise.resolve(
        onUpdateNote(reminder.id, serializeNote(cleanedTitle, cleanedHtml, mergedTags), removeAttachmentIds)
      );
      lastSavedSnapshotRef.current = snapshot;
    } finally {
      setSaving(false);
      if (pendingDraftRef.current) {
        const next = pendingDraftRef.current;
        pendingDraftRef.current = null;
        if (snapshotDraft(next) !== lastSavedSnapshotRef.current) {
          void persistDraft(next);
        }
      }
    }
  }

  function currentDraft() {
    return {
      title: editorTitle,
      html: editorHtml,
      tags: editorTagState,
      attachmentIds: editorAttachments.map((attachment) => attachment.id)
    };
  }

  function flushAutosave() {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    void persistDraft(currentDraft());
  }

  function closeEditorWithAutosave() {
    if (!editorOpen || editorClosing) return;
    lastCloseAtRef.current = Date.now();
    flushAutosave();
    setEditorClosing(true);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      setEditorOpen(false);
      setEditorClosing(false);
      closeTimerRef.current = null;
    }, 220);
  }

  useEffect(() => {
    if (!editorOpen) return;
    const editor = editorRef.current;
    if (!editor) return;
    const next = editorHtml || "";
    if (editor.innerHTML !== next) {
      editor.innerHTML = next;
    }
  }, [editorOpen]);

  useEffect(() => {
    if (!editorOpen) return;
    lastSavedSnapshotRef.current = snapshotDraft(currentDraft());
    pendingDraftRef.current = null;
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, [editorOpen, reminder.id]);

  useEffect(() => {
    if (!editorOpen || !onUpdateNote) return;
    const draft = currentDraft();
    if (snapshotDraft(draft) === lastSavedSnapshotRef.current) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      void persistDraft(draft);
    }, 500);
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [editorOpen, editorTitle, editorHtml, editorAttachments, editorTagState, onUpdateNote]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeEditorWithAutosave();
    }
    if (editorOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", onKeyDown);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [editorOpen]);

  useEffect(() => {
    function closeFormatMenu(event: Event) {
      if (event.target instanceof Element && event.target.closest(".text-format-popover")) return;
      setFormatMenu((prev) => (prev.open ? { ...prev, open: false } : prev));
    }
    window.addEventListener("mousedown", closeFormatMenu);
    window.addEventListener("scroll", closeFormatMenu, true);
    window.addEventListener("resize", closeFormatMenu);
    return () => {
      window.removeEventListener("mousedown", closeFormatMenu);
      window.removeEventListener("scroll", closeFormatMenu, true);
      window.removeEventListener("resize", closeFormatMenu);
    };
  }, []);

  async function handleComplete() {
    if (isCompleting) return;
    setIsCompleting(true);
    setMenuOpen(false);
    await new Promise((resolve) => setTimeout(resolve, 220));
    await Promise.resolve(onArchive(reminder.id, "completed"));
  }

  return (
    <>
      <motion.article
        className={`reminder-card ${compact ? "compact" : ""} ${isCompleting ? "is-completing" : ""} ${menuOpen ? "menu-open" : ""} ${hasLeadingCheckbox ? "has-leading-check" : ""} ${title ? "" : "no-title"}`}
        onClick={(event) => {
          if (isInteractiveTarget(event.target)) return;
          openEditor();
        }}
      >
        <div className="reminder-card__header">
          <div className="reminder-card__header-main">
            {!compact && reminder.status !== "archived" ? (
              <Checkbox
                checked={isCompleting}
                disabled={isCompleting}
                onCheckedChange={(checked) => {
                  if (checked === true) void handleComplete();
                }}
                aria-label="Mark reminder as done"
                className="todo-check-ui size-6 rounded-md border border-[rgba(32,31,26,0.22)] bg-white text-[rgba(17,119,58,0.95)] shadow-none transition-colors data-[state=checked]:border-[rgba(17,119,58,0.7)] data-[state=checked]:bg-[rgba(44,188,100,0.14)] hover:bg-[rgba(17,24,39,0.04)]"
              />
            ) : null}
            <div className="reminder-card__header-text">
              <p
                className={
                  reminder.status === "archived"
                    ? "state-pill archived"
                    : reminder.isOverdue
                      ? "state-pill overdue"
                      : reminder.isDue
                        ? "state-pill due"
                        : "state-pill upcoming"
                }
              >
                {reminder.status === "archived"
                  ? `Archived${reminder.archiveReason ? ` · ${reminder.archiveReason}` : ""}`
                  : reminder.remindAt
                    ? reminder.isOverdue
                      ? "Overdue"
                      : reminder.isDue
                        ? "Due now"
                        : "Upcoming"
                    : ""}
                {reminder.remindAt ? ` · ${formatWhen(reminder.remindAt)}` : ""}
              </p>
              {title ? <h3>{title}</h3> : null}
              {showInlineBody ? (
                <div className="reminder-card__note rich-text" dangerouslySetInnerHTML={{ __html: noteBodyHtml }} />
              ) : null}
            </div>
          </div>
          <div className="reminder-card__header-side">
            {!compact && reminder.status !== "archived" ? (
              <Popover open={menuOpen} onOpenChange={setMenuOpen}>
                <div className="card-menu">
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="icon-btn large"
                      aria-label="More reminder actions"
                      aria-expanded={menuOpen}
                    >
                      ⋯
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="bottom" align="end" sideOffset={6} className="card-menu__panel p-1.5">
                    <button
                      type="button"
                      className="card-menu__item"
                      onClick={() => {
                        onSnooze(reminder.id, "10m");
                        setMenuOpen(false);
                      }}
                    >
                      Snooze +10m
                    </button>
                    <button
                      type="button"
                      className="card-menu__item"
                      onClick={() => {
                        onSnooze(reminder.id, "1h");
                        setMenuOpen(false);
                      }}
                    >
                      Snooze +1h
                    </button>
                    <button
                      type="button"
                      className="card-menu__item"
                      onClick={() => {
                        onSnooze(reminder.id, "tomorrow");
                        setMenuOpen(false);
                      }}
                    >
                      Snooze tomorrow
                    </button>
                    <label className="card-menu__item card-menu__datetime">
                      Reschedule
                      <input
                        type="datetime-local"
                        onChange={(e) => {
                          if (!e.target.value) return;
                          onReschedule(reminder.id, new Date(e.target.value).toISOString());
                          e.target.value = "";
                          setMenuOpen(false);
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="card-menu__item"
                      onClick={() => {
                        openEditor();
                        setMenuOpen(false);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="card-menu__item danger"
                      onClick={() => {
                        onArchive(reminder.id, "manual");
                        setMenuOpen(false);
                      }}
                    >
                      Archive
                    </button>
                  </PopoverContent>
                </div>
              </Popover>
            ) : null}
          </div>
        </div>

        {noteBodyHtml && !showInlineBody ? (
          <div className="reminder-card__note rich-text" dangerouslySetInnerHTML={{ __html: noteBodyHtml }} />
        ) : null}

        {tags.length > 0 ? (
          <div className="tag-chip-list" aria-label="Reminder tags">
            {tags.map((tag) => (
              <span key={`${reminder.id}-${tag}`} className="tag-chip" style={getTagChipStyle(tag)}>
                #{tag}
              </span>
            ))}
          </div>
        ) : null}

        {allAttachments.length > 0 ? (
          <ul className={`attachment-list ${allAttachments.length > 1 ? "is-carousel" : ""}`}>
            {allAttachments.map((attachment) => (
              <li
                key={attachment.id}
                className={
                  attachment.kind === "image"
                    ? `image-attachment-tile ${getAttachmentHref(attachment) ? "is-clickable" : ""}`
                    : `attachment-chip reminder-attachment ${getAttachmentHref(attachment) ? "is-clickable" : ""}`
                }
                onClick={() => {
                  const href = getAttachmentHref(attachment);
                  if (href) openAttachment(href);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  const href = getAttachmentHref(attachment);
                  if (!href) return;
                  event.preventDefault();
                  openAttachment(href);
                }}
                role={getAttachmentHref(attachment) ? "link" : undefined}
                tabIndex={getAttachmentHref(attachment) ? 0 : undefined}
              >
                {attachment.kind === "link" ? (
                  <>
                    {getYouTubePreviewUrl(attachment.url) ? (
                      <div className="reminder-attachment__media">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={getYouTubePreviewUrl(attachment.url) ?? ""} alt="YouTube video preview" />
                      </div>
                    ) : (
                      <div className="reminder-attachment__icon">
                        {attachment.previewIconUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={attachment.previewIconUrl} alt="" width={22} height={22} />
                        ) : (
                          <span aria-hidden="true">🔗</span>
                        )}
                      </div>
                    )}
                    <div className="reminder-attachment__body">
                      <span>{attachment.previewTitle || attachment.url || "Link"}</span>
                      {attachment.url ? <small>{attachment.url}</small> : null}
                    </div>
                  </>
                ) : attachment.kind === "image" ? (
                  <>
                    {attachment.previewImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={attachment.previewImageUrl} alt="" className="image-attachment-tile__img" />
                    ) : (
                      <span aria-hidden="true">🖼️</span>
                    )}
                  </>
                ) : attachment.kind === "file" ? (
                  <>
                    <div className="reminder-attachment__icon">
                      <span aria-hidden="true">📎</span>
                    </div>
                    <div className="reminder-attachment__body">
                      <span>{attachment.fileName || "File"}</span>
                      <small>
                        {attachment.fileSizeBytes ? summarizeFileSize(attachment.fileSizeBytes) : "Attached file"}
                      </small>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="reminder-attachment__icon">
                      <span aria-hidden="true">📝</span>
                    </div>
                    <div className="reminder-attachment__body">
                      <span>{attachment.textContent?.slice(0, 120) || "Text snippet"}</span>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : null}

        {compact && reminder.status === "archived" && onRestore ? (
          <div className="reminder-actions">
            <button onClick={() => onRestore(reminder.id)} className="btn">
              Restore (reschedule)
            </button>
          </div>
        ) : null}

        {compact && summaries.length > 0 ? (
          <p className="archive-summary">{summaries.slice(0, 2).join(" · ")}</p>
        ) : null}
      </motion.article>

      <AnimatePresence initial={false} mode="wait">
        {editorOpen ? (
          <div className="note-editor-overlay" role="dialog" aria-modal="true" aria-label="Edit reminder">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: editorClosing ? 0 : 1 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="note-editor-backdrop"
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                closeEditorWithAutosave();
              }}
            />
            <motion.div
              ref={editorPanelRef}
              initial={{ opacity: 0, scale: 0.99, y: 12 }}
              animate={editorClosing ? { opacity: 0, y: 24, scale: 0.99 } : { opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="note-editor-panel p-0"
              onMouseDown={(event) => event.stopPropagation()}
            >
          <div className="note-editor__header">
            <motion.button
              type="button"
              className="icon-btn"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={closeEditorWithAutosave}
              aria-label="Close edit note"
            >
              ×
            </motion.button>
          </div>
          <div className="note-editor__body">
            <input
              className="note-editor__title"
              value={editorTitle}
              onChange={(e) => setEditorTitle(e.target.value)}
              placeholder="Title"
              maxLength={180}
            />
            <div
              ref={editorRef}
              className="note-editor__content rich-text"
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              data-placeholder="Write details..."
              onInput={(e) => setEditorHtml((e.target as HTMLDivElement).innerHTML)}
              onContextMenu={(event) => {
                openFormatMenuFromSelection(event.clientX, event.clientY);
                if (window.getSelection()?.toString().trim()) {
                  event.preventDefault();
                }
              }}
            />
            {formatMenu.open ? (
              <div className="text-format-popover" style={{ left: formatMenu.x, top: formatMenu.y }} role="menu">
                <div className="text-format-popover__row">
                  <button
                    type="button"
                    className="text-format-popover__item"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyFormatting("bold")}
                  >
                    <strong>B</strong>
                  </button>
                  <button
                    type="button"
                    className="text-format-popover__item"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyFormatting("italic")}
                  >
                    <em>I</em>
                  </button>
                  <button
                    type="button"
                    className="text-format-popover__item"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyFormatting("underline")}
                  >
                    <u>U</u>
                  </button>
                  <button
                    type="button"
                    className="text-format-popover__item"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyFormatting("strikeThrough")}
                  >
                    <s>S</s>
                  </button>
                </div>
                <div className="text-format-popover__divider" />
                <div className="text-format-popover__row text-format-popover__row--colors">
                  {TEXT_COLOR_PRESETS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className="text-format-popover__swatch"
                      style={{ background: color }}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => applyTextColor(color)}
                      aria-label={`Text color ${color}`}
                    />
                  ))}
                  {TEXT_GRADIENT_PRESETS.map((gradient) => (
                    <button
                      key={gradient}
                      type="button"
                      className="text-format-popover__swatch"
                      style={{ backgroundImage: gradient }}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => applyGradientText(gradient)}
                      aria-label="Gradient text"
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {editorTags.length > 0 ? (
              <div className="tag-chip-list" aria-label="Note tags">
                {editorTags.map((tag) => (
                  <span
                    key={`${reminder.id}-edit-${tag}`}
                    className="tag-chip tag-chip--editable"
                    style={getTagChipStyle(tag)}
                  >
                    <span>#{tag}</span>
                    <button
                      type="button"
                      className="tag-chip__remove"
                      aria-label={`Remove tag ${tag}`}
                      onClick={() => {
                        setEditorTagState((prev) => prev.filter((item) => item !== tag));
                        setEditorTitle((prev) => stripSpecificTagFromText(prev, tag));
                        setEditorHtml((prev) => {
                          const next = stripSpecificTagFromHtml(prev, tag);
                          if (editorRef.current) editorRef.current.innerHTML = next;
                          return next;
                        });
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : null}

            {editorAttachments.length > 0 ? (
              <div className="note-editor__attachments">
                <ul
                  className={`attachment-list ${editorAttachments.length > 1 ? "is-carousel" : ""}`}
                >
                  {editorAttachments.map((attachment) => (
                      <li
                        key={`${reminder.id}-edit-attachment-${attachment.id}`}
                        className={
                          attachment.kind === "image"
                            ? `image-attachment-tile ${getAttachmentHref(attachment) ? "is-clickable" : ""}`
                            : `attachment-chip reminder-attachment ${getAttachmentHref(attachment) ? "is-clickable" : ""}`
                        }
                        onClick={() => {
                          const href = getAttachmentHref(attachment);
                          if (href) openAttachment(href);
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") return;
                          const href = getAttachmentHref(attachment);
                          if (!href) return;
                          event.preventDefault();
                          openAttachment(href);
                        }}
                        role={getAttachmentHref(attachment) ? "link" : undefined}
                        tabIndex={getAttachmentHref(attachment) ? 0 : undefined}
                      >
                        {attachment.kind === "link" ? (
                          <>
                            {getYouTubePreviewUrl(attachment.url) ? (
                              <div className="reminder-attachment__media">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={getYouTubePreviewUrl(attachment.url) ?? ""} alt="YouTube video preview" />
                              </div>
                            ) : (
                              <div className="reminder-attachment__icon">
                                {attachment.previewIconUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={attachment.previewIconUrl} alt="" width={22} height={22} />
                                ) : (
                                  <span aria-hidden="true">🔗</span>
                                )}
                              </div>
                            )}
                            <div className="reminder-attachment__body">
                              <span>{attachment.previewTitle || attachment.url || "Link"}</span>
                              {attachment.url ? <small>{attachment.url}</small> : null}
                            </div>
                          </>
                        ) : attachment.kind === "image" ? (
                          <>
                            {attachment.previewImageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={attachment.previewImageUrl} alt="" className="image-attachment-tile__img" />
                            ) : (
                              <span aria-hidden="true">🖼️</span>
                            )}
                          </>
                        ) : attachment.kind === "file" ? (
                          <>
                            <div className="reminder-attachment__icon">
                              <span aria-hidden="true">📎</span>
                            </div>
                            <div className="reminder-attachment__body">
                              <span>{attachment.fileName || "File"}</span>
                              <small>
                                {attachment.fileSizeBytes ? summarizeFileSize(attachment.fileSizeBytes) : "Attached file"}
                              </small>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="reminder-attachment__icon">
                              <span aria-hidden="true">📝</span>
                            </div>
                            <div className="reminder-attachment__body">
                              <span>{attachment.textContent?.slice(0, 120) || "Text snippet"}</span>
                            </div>
                          </>
                        )}
                        <button
                          type="button"
                          className={`icon-btn ${attachment.kind === "image" ? "note-editor-image__remove" : "note-editor-attachment__remove"}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setEditorAttachments((prev) => prev.filter((item) => item.id !== attachment.id));
                          }}
                          aria-label={attachment.kind === "image" ? "Remove image attachment" : "Remove attachment"}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}
          </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
