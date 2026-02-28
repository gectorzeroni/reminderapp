"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogPanel } from "@/components/animate-ui/components/headless/dialog";
import { Checkbox } from "@/components/animate-ui/components/radix/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/animate-ui/components/radix/popover";
import { parseStoredNote, sanitizeNoteHtml, serializeNote, textToHtml } from "@/lib/note";
import { extractTagsFromText, summarizeFileSize } from "@/lib/parse";
import type { ReminderWithComputed } from "@/lib/types";

type Props = {
  reminder: ReminderWithComputed;
  onSnooze: (id: string, preset: "10m" | "1h" | "tomorrow") => void;
  onArchive: (id: string, reason: "completed" | "manual") => Promise<void> | void;
  onReschedule: (id: string, remindAt: string) => void;
  onUpdateNote?: (id: string, note: string) => Promise<void> | void;
  compact?: boolean;
  onRestore?: (id: string) => void;
};

function fallbackTitle(reminder: ReminderWithComputed) {
  const first = reminder.attachments[0];
  if (!first) return "Reminder";
  if (first.kind === "link") return "Link reminder";
  if (first.kind === "image") return "Image reminder";
  if (first.kind === "file") return "File reminder";
  return "Text reminder";
}

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
  const title = parsedNote.title || fallbackTitle(reminder);
  const noteBodyHtml = parsedNote.bodyHtml;
  const tags = extractTagsFromText(parsedNote.plainText);
  const summaries = attachmentSummary(reminder);

  const [menuOpen, setMenuOpen] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTitle, setEditorTitle] = useState(parsedNote.title || title);
  const [editorHtml, setEditorHtml] = useState(noteBodyHtml);
  const [saving, setSaving] = useState(false);
  const [formatMenu, setFormatMenu] = useState<{ open: boolean; x: number; y: number }>({
    open: false,
    x: 0,
    y: 0
  });
  const editorRef = useRef<HTMLDivElement>(null);
  const editorTags = useMemo(
    () => extractTagsFromText([editorTitle, htmlToPlainText(editorHtml)].filter(Boolean).join("\n")),
    [editorTitle, editorHtml]
  );

  const hasLeadingCheckbox = !compact && reminder.status !== "archived";
  const imageAttachments = reminder.attachments.filter((a) => a.kind === "image");
  const nonImageAttachments = reminder.attachments.filter((a) => a.kind !== "image");

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
    setEditorTitle(parsedNote.title || title);
    setEditorHtml(noteBodyHtml);
    setEditorOpen(true);
  }

  function applyFormatting(command: "bold" | "italic" | "underline") {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand(command);
    setEditorHtml(editor.innerHTML);
    setFormatMenu((prev) => ({ ...prev, open: false }));
  }

  function openFormatMenuFromSelection(clientX: number, clientY: number) {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0 || selection.isCollapsed) return;
    if (!selection.toString().trim()) return;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    setFormatMenu({ open: true, x: clientX, y: clientY });
  }

  async function saveEditor() {
    if (!onUpdateNote || saving) return;
    const plainBody = htmlToPlainText(editorHtml);
    if (!editorTitle.trim() || !plainBody.trim()) return;
    setSaving(true);
    try {
      await Promise.resolve(onUpdateNote(reminder.id, serializeNote(editorTitle, sanitizeNoteHtml(editorHtml))));
      setEditorOpen(false);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    function closeFormatMenu() {
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
      <article
        className={`reminder-card ${compact ? "compact" : ""} ${isCompleting ? "is-completing" : ""} ${menuOpen ? "menu-open" : ""} ${hasLeadingCheckbox ? "has-leading-check" : ""}`}
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
              <h3>{title}</h3>
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

        {noteBodyHtml ? (
          <div className="reminder-card__note rich-text" dangerouslySetInnerHTML={{ __html: noteBodyHtml }} />
        ) : null}

        {tags.length > 0 ? (
          <div className="tag-chip-list" aria-label="Reminder tags">
            {tags.map((tag) => (
              <span key={`${reminder.id}-${tag}`} className="tag-chip">
                #{tag}
              </span>
            ))}
          </div>
        ) : null}

        {nonImageAttachments.length > 0 ? (
          <ul className="attachment-list">
            {nonImageAttachments.map((attachment) => (
              <li
                key={attachment.id}
                className={`attachment-chip reminder-attachment ${getAttachmentHref(attachment) ? "is-clickable" : ""}`}
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
                    <div className="reminder-attachment__icon">
                      {attachment.previewIconUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={attachment.previewIconUrl} alt="" width={22} height={22} />
                      ) : (
                        <span aria-hidden="true">🔗</span>
                      )}
                    </div>
                    <div className="reminder-attachment__body">
                      <span>{attachment.previewTitle || attachment.url || "Link"}</span>
                      {attachment.url ? <small>{attachment.url}</small> : null}
                    </div>
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

        {imageAttachments.length > 0 ? (
          <ul className={`image-attachment-row ${hasLeadingCheckbox ? "with-leading-check" : ""}`}>
            {imageAttachments.map((attachment) => {
              const href = getAttachmentHref(attachment);
              return (
                <li
                  key={attachment.id}
                  className={`image-attachment-tile ${href ? "is-clickable" : ""}`}
                  onClick={() => {
                    if (href) openAttachment(href);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    if (!href) return;
                    event.preventDefault();
                    openAttachment(href);
                  }}
                  role={href ? "link" : undefined}
                  tabIndex={href ? 0 : undefined}
                >
                  {attachment.previewImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={attachment.previewImageUrl} alt="" className="image-attachment-tile__img" />
                  ) : (
                    <span aria-hidden="true">🖼️</span>
                  )}
                </li>
              );
            })}
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
      </article>

      <Dialog open={editorOpen} onClose={setEditorOpen} className="note-editor-dialog">
        <DialogPanel className="note-editor-panel p-0" showCloseButton={false}>
          <div className="note-editor__header">
            <strong>Edit note</strong>
            <button type="button" className="icon-btn" onClick={() => setEditorOpen(false)} aria-label="Close edit note">
              ×
            </button>
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
              dangerouslySetInnerHTML={{ __html: editorHtml || textToHtml("") }}
            />
            {formatMenu.open ? (
              <div className="text-format-popover" style={{ left: formatMenu.x, top: formatMenu.y }} role="menu">
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
              </div>
            ) : null}

            {editorTags.length > 0 ? (
              <div className="tag-chip-list" aria-label="Note tags">
                {editorTags.map((tag) => (
                  <span key={`${reminder.id}-edit-${tag}`} className="tag-chip">
                    #{tag}
                  </span>
                ))}
              </div>
            ) : null}

            {reminder.attachments.length > 0 ? (
              <ul className="note-editor__attachments">
                {reminder.attachments.map((attachment) => (
                  <li key={`${reminder.id}-edit-attachment-${attachment.id}`} className="attachment-chip">
                    {attachment.kind === "link" ? (
                      <>
                        <span aria-hidden="true">🔗</span>
                        <span>{attachment.previewTitle || attachment.url || "Link"}</span>
                      </>
                    ) : attachment.kind === "image" ? (
                      <>
                        {attachment.previewImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={attachment.previewImageUrl} alt="" width={28} height={28} className="thumb" />
                        ) : (
                          <span aria-hidden="true">🖼️</span>
                        )}
                        <span>{attachment.fileName || "Image"}</span>
                      </>
                    ) : attachment.kind === "file" ? (
                      <>
                        <span aria-hidden="true">📎</span>
                        <span>{attachment.fileName || "File"}</span>
                      </>
                    ) : (
                      <>
                        <span aria-hidden="true">📝</span>
                        <span>{attachment.textContent?.slice(0, 120) || "Text snippet"}</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="note-editor__footer">
            <button type="button" className="btn" onClick={() => setEditorOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn primary" onClick={() => void saveEditor()} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </DialogPanel>
      </Dialog>
    </>
  );
}
