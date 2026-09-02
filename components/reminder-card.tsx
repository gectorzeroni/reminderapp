"use client";

import * as motion from "motion/react-client";
import { AnimatePresence } from "motion/react";
import type { ClipboardEvent, DragEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnnotationText, Attachment, Calendar, Close, File, Image, Link, MoreHorizontal } from "griddy-icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/animate-ui/components/radix/popover";
import { MarkdownBodyEditor } from "@/components/markdown-body-editor";
import { MAX_ATTACHMENTS } from "@/lib/constants";
import { parseStoredNote, sanitizeNoteHtml, serializeNote } from "@/lib/note";
import { getTagChipStyle } from "@/lib/tag-colors";
import {
  extractTagsFromText,
  extractUrlsFromText,
  isLikelyUrl,
  stripSpecificTagFromHtml,
  stripTagsFromHtml,
  summarizeFileSize
} from "@/lib/parse";
import type { CreateAttachmentInput, ReminderWithComputed } from "@/lib/types";

const SIDE_PANEL_TRANSITION_MS = 380;

type Props = {
  reminder: ReminderWithComputed;
  onSnooze: (id: string, preset: "10m" | "1h" | "tomorrow") => void;
  onArchive: (id: string, reason: "completed" | "manual") => Promise<void> | void;
  onReschedule: (id: string, remindAt: string) => void;
  onTogglePin?: (id: string, pinned: boolean) => Promise<void> | void;
  onUpdateNote?: (
    id: string,
    note: string,
    options?: { removeAttachmentIds?: string[]; attachments?: CreateAttachmentInput[]; remindAt?: string | null }
  ) => Promise<void> | void;
  compact?: boolean;
  onRestore?: (id: string) => void;
};

type EditorDraft = {
  html: string;
  tags: string[];
  attachmentKeys: string[];
  newAttachments: CreateAttachmentInput[];
  localAttachmentIds: string[];
  remindAt: string | null;
};

type EditorAttachment = ReminderWithComputed["attachments"][number] & {
  localId?: string;
  localFile?: File;
};

type FrozenPreview = {
  bodyHtml: string;
  tags: string[];
  attachments: ReminderWithComputed["attachments"];
};

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

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function makeLocalId() {
  return Math.random().toString(36).slice(2);
}

function toLocalDatetimeValue(date: Date) {
  const copy = new Date(date);
  copy.setSeconds(0, 0);
  return new Date(copy.getTime() - copy.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function splitLocalDatetime(value: string): { date: string; time: string } {
  if (!value) return { date: "", time: "09:00" };
  const [date, time = "09:00"] = value.split("T");
  return { date, time: time.slice(0, 5) };
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
  onTogglePin,
  onUpdateNote,
  compact = false,
  onRestore
}: Props) {
  const parsedNote = parseStoredNote(reminder.note);
  const noteBodyHtml = parsedNote.bodyHtml;
  const tags = parsedNote.tags.length ? parsedNote.tags : extractTagsFromText(parsedNote.plainText);
  const summaries = attachmentSummary(reminder);
  const reminderStateLabel =
    reminder.status === "archived"
      ? `Archived${reminder.archiveReason ? ` · ${reminder.archiveReason}` : ""}`
      : reminder.remindAt
        ? reminder.isOverdue
          ? "Overdue"
          : reminder.isDue
            ? "Due now"
            : "Upcoming"
        : "";

  const [menuOpen, setMenuOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorClosing, setEditorClosing] = useState(false);
  const [editorPanelEntered, setEditorPanelEntered] = useState(false);
  const [editorHtml, setEditorHtml] = useState(noteBodyHtml);
  const [editorTagState, setEditorTagState] = useState(tags);
  const [editorAttachments, setEditorAttachments] = useState<EditorAttachment[]>(reminder.attachments);
  const [frozenPreview, setFrozenPreview] = useState<FrozenPreview | null>(null);
  const [editorRemindAt, setEditorRemindAt] = useState(reminder.remindAt ? toLocalDatetimeValue(new Date(reminder.remindAt)) : "");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const editorPanelRef = useRef<HTMLDivElement>(null);
  const editorFileInputRef = useRef<HTMLInputElement>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSnapshotRef = useRef("");
  const pendingDraftRef = useRef<EditorDraft | null>(null);
  const lastCloseAtRef = useRef(0);
  const editorTags = useMemo(() => {
    const fromText = extractTagsFromText(htmlToPlainText(editorHtml));
    return Array.from(new Set([...editorTagState, ...fromText]));
  }, [editorTagState, editorHtml]);

  const allAttachments = (editorOpen && frozenPreview ? frozenPreview.attachments : reminder.attachments) as ReminderWithComputed["attachments"];
  const displayBodyHtml = editorOpen && frozenPreview ? frozenPreview.bodyHtml : noteBodyHtml;
  const displayTags = editorOpen && frozenPreview ? frozenPreview.tags : tags;
  const scheduleParts = useMemo(() => splitLocalDatetime(editorRemindAt), [editorRemindAt]);
  const capacityRemaining = MAX_ATTACHMENTS - editorAttachments.length;

  function setEditorBodyHtml(next: string) {
    setEditorHtml(next);
  }

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
    setEditorBodyHtml(noteBodyHtml);
    setEditorTagState(tags);
    setEditorAttachments(reminder.attachments);
    setFrozenPreview({
      bodyHtml: noteBodyHtml,
      tags,
      attachments: reminder.attachments
    });
    setEditorRemindAt(reminder.remindAt ? toLocalDatetimeValue(new Date(reminder.remindAt)) : "");
    setScheduleOpen(false);
    setEditorClosing(false);
    setEditorOpen(true);
  }

  function setDatePart(dateValue: string) {
    if (!dateValue) {
      setEditorRemindAt("");
      return;
    }
    const time = scheduleParts.time || "09:00";
    setEditorRemindAt(`${dateValue}T${time}`);
  }

  function setTimePart(timeValue: string) {
    const date = scheduleParts.date;
    if (!date) return;
    setEditorRemindAt(`${date}T${timeValue || "09:00"}`);
  }

  function setQuickPreset(preset: "1h" | "tomorrow" | "1w") {
    const d = new Date();
    if (preset === "1h") {
      d.setHours(d.getHours() + 1);
    } else if (preset === "tomorrow") {
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
    } else {
      d.setDate(d.getDate() + 7);
      d.setHours(9, 0, 0, 0);
    }
    setEditorRemindAt(toLocalDatetimeValue(d));
    setScheduleOpen(false);
  }

  async function addFilesToEditor(files: FileList | File[]) {
    const list = Array.from(files).slice(0, Math.max(0, capacityRemaining));
    if (list.length === 0) return;
    const next = await Promise.all(
      list.map(async (file) => {
        const isImage = file.type.startsWith("image/");
        const previewImageUrl = isImage ? await fileToDataUrl(file) : null;
        return {
          id: `local-${makeLocalId()}`,
          reminderId: reminder.id,
          kind: isImage ? "image" : "file",
          storagePath: null,
          mimeType: file.type || null,
          fileName: file.name,
          fileSizeBytes: file.size,
          url: null,
          textContent: null,
          previewTitle: file.name,
          previewIconUrl: null,
          previewImageUrl,
          metadataStatus: "ready",
          createdAt: new Date().toISOString(),
          localId: makeLocalId(),
          localFile: file
        } satisfies EditorAttachment;
      })
    );
    setEditorAttachments((prev) => [...prev, ...next].slice(0, MAX_ATTACHMENTS));
  }

  function addTextAttachmentToEditor(text: string) {
    const trimmed = text.trim();
    if (!trimmed || capacityRemaining <= 0) return;
    const urls = extractUrlsFromText(trimmed);
    if (urls.length > 0) {
      const existingUrls = new Set(editorAttachments.filter((a) => a.kind === "link").map((a) => a.url));
      const linkAttachments = urls
        .filter((url) => !existingUrls.has(url))
        .map((url) => ({
          id: `local-${makeLocalId()}`,
          reminderId: reminder.id,
          kind: "link" as const,
          storagePath: null,
          mimeType: null,
          fileName: null,
          fileSizeBytes: null,
          url,
          textContent: null,
          previewTitle: url,
          previewIconUrl: null,
          previewImageUrl: getYouTubePreviewUrl(url),
          metadataStatus: "pending" as const,
          createdAt: new Date().toISOString(),
          localId: makeLocalId()
        }));
      setEditorAttachments((prev) => [...prev, ...linkAttachments].slice(0, MAX_ATTACHMENTS));
      return;
    }

    const snippet: EditorAttachment = {
      id: `local-${makeLocalId()}`,
      reminderId: reminder.id,
      kind: "text_snippet",
      storagePath: null,
      mimeType: "text/plain",
      fileName: null,
      fileSizeBytes: trimmed.length,
      url: null,
      textContent: trimmed,
      previewTitle: trimmed.slice(0, 120),
      previewIconUrl: null,
      previewImageUrl: null,
      metadataStatus: "ready",
      createdAt: new Date().toISOString(),
      localId: makeLocalId()
    };
    setEditorAttachments((prev) => [...prev, snippet].slice(0, MAX_ATTACHMENTS));
  }

  async function onEditorDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (event.dataTransfer.files?.length) await addFilesToEditor(event.dataTransfer.files);
    const text = event.dataTransfer.getData("text/plain");
    if (text) addTextAttachmentToEditor(text);
  }

  async function onEditorPaste(event: ClipboardEvent<HTMLDivElement>) {
    const files = event.clipboardData.files;
    if (files?.length) {
      event.preventDefault();
      await addFilesToEditor(files);
      return;
    }
    const text = event.clipboardData.getData("text/plain");
    if (isLikelyUrl(text)) {
      event.preventDefault();
      addTextAttachmentToEditor(text);
    }
  }


  function snapshotDraft(draft: EditorDraft) {
    return JSON.stringify({
      html: sanitizeNoteHtml(draft.html),
      tags: Array.from(new Set(draft.tags.map((tag) => tag.toLowerCase()))).sort(),
      attachmentKeys: draft.attachmentKeys,
      remindAt: draft.remindAt,
      newAttachments: draft.newAttachments,
      localAttachmentIds: draft.localAttachmentIds
    });
  }

  async function prepareNewEditorAttachments(draft: EditorDraft): Promise<CreateAttachmentInput[]> {
    const prepared: CreateAttachmentInput[] = [];
    for (const [index, item] of draft.newAttachments.entries()) {
      if ((item.kind === "image" || item.kind === "file") && item.storagePath == null && item.fileName) {
        const localId = draft.localAttachmentIds[index];
        const attachment = editorAttachments.find((a) => a.localId === localId && a.localFile);
        if (attachment?.localFile) {
          const uploadResp = await fetch("/api/uploads", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              fileName: attachment.localFile.name,
              mimeType: attachment.localFile.type || "application/octet-stream",
              size: attachment.localFile.size
            })
          });
          if (!uploadResp.ok) throw new Error("Upload preparation failed");
          const uploadInfo = (await uploadResp.json()) as { storagePath: string; signedUploadUrl?: string | null };
          if (uploadInfo.signedUploadUrl) {
            const putResp = await fetch(uploadInfo.signedUploadUrl, {
              method: "PUT",
              headers: {
                "content-type": attachment.localFile.type || "application/octet-stream",
                "x-upsert": "false"
              },
              body: attachment.localFile
            });
            if (!putResp.ok) throw new Error("File upload failed");
          }

          prepared.push({
            kind: item.kind,
            storagePath: uploadInfo.storagePath,
            mimeType: attachment.localFile.type || "application/octet-stream",
            fileName: attachment.localFile.name,
            fileSizeBytes: attachment.localFile.size,
            previewImageUrl: item.kind === "image" ? attachment.previewImageUrl ?? null : null,
            metadataStatus: "ready"
          });
          continue;
        }
      }
      prepared.push(item);
    }
    return prepared;
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
        .filter((attachment) => !draft.attachmentKeys.includes(attachment.id))
        .map((attachment) => attachment.id);
      const extractedTags = extractTagsFromText(htmlToPlainText(draft.html));
      const mergedTags = Array.from(new Set([...(draft.tags ?? []), ...extractedTags]));
      const cleanedHtml = sanitizeNoteHtml(stripTagsFromHtml(draft.html));
      const createdAttachments = await prepareNewEditorAttachments(draft);
      const remindAtIso = draft.remindAt ? new Date(draft.remindAt).toISOString() : null;
      await Promise.resolve(
        onUpdateNote(reminder.id, serializeNote("", cleanedHtml, mergedTags), {
          removeAttachmentIds,
          attachments: createdAttachments,
          remindAt: remindAtIso
        })
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
    const liveHtml = editorHtml;
    const newLocalAttachments = editorAttachments.filter((attachment) => attachment.id.startsWith("local-"));
    const newAttachments = newLocalAttachments.map<CreateAttachmentInput>((attachment) => ({
        kind: attachment.kind,
        storagePath: attachment.storagePath,
        mimeType: attachment.mimeType,
        fileName: attachment.fileName,
        fileSizeBytes: attachment.fileSizeBytes,
        url: attachment.url,
        textContent: attachment.textContent,
        previewTitle: attachment.previewTitle,
        previewIconUrl: attachment.previewIconUrl,
        previewImageUrl: attachment.previewImageUrl,
        metadataStatus: attachment.metadataStatus
      }));

    return {
      html: liveHtml,
      tags: editorTagState,
      attachmentKeys: editorAttachments.map((attachment) => attachment.id),
      newAttachments,
      localAttachmentIds: newLocalAttachments.map((attachment) => attachment.localId ?? ""),
      remindAt: editorRemindAt || null
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
      setFrozenPreview(null);
      closeTimerRef.current = null;
    }, SIDE_PANEL_TRANSITION_MS);
  }


  useEffect(() => {
    if (!editorOpen) return;
    setEditorPanelEntered(false);
    let enterRaf2 = 0;
    const enterRaf = window.requestAnimationFrame(() => {
      enterRaf2 = window.requestAnimationFrame(() => setEditorPanelEntered(true));
    });
    lastSavedSnapshotRef.current = snapshotDraft(currentDraft());
    pendingDraftRef.current = null;
    return () => {
      if (enterRaf2) window.cancelAnimationFrame(enterRaf2);
      window.cancelAnimationFrame(enterRaf);
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
  }, [editorOpen, editorHtml, editorAttachments, editorTagState, editorRemindAt, onUpdateNote]);

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

  return (
    <>
      <motion.article
        className={`reminder-card ${compact ? "compact" : ""} ${menuOpen ? "menu-open" : ""} no-title`}
        onClick={(event) => {
          if (isInteractiveTarget(event.target)) return;
          openEditor();
        }}
      >
        <div className="reminder-card__header">
          <div className="reminder-card__header-main">
            <div className="reminder-card__header-text">
              {reminderStateLabel ? (
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
                  {reminderStateLabel}
                  {reminder.remindAt ? ` · ${formatWhen(reminder.remindAt)}` : ""}
                </p>
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
                      <MoreHorizontal size={18} aria-hidden="true" />
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
                    {onTogglePin ? (
                      <button
                        type="button"
                        className="card-menu__item"
                        onClick={() => {
                          onTogglePin(reminder.id, !reminder.pinned);
                          setMenuOpen(false);
                        }}
                      >
                        {reminder.pinned ? "Unpin" : "Pin to top"}
                      </button>
                    ) : null}
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

        {displayBodyHtml ? (
          <div className="reminder-card__note rich-text" dangerouslySetInnerHTML={{ __html: displayBodyHtml }} />
        ) : null}

        {displayTags.length > 0 ? (
          <div className="tag-chip-list" aria-label="Reminder tags">
            {displayTags.map((tag) => (
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
                    : `reminder-attachment ${getAttachmentHref(attachment) ? "is-clickable" : ""}`
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
                          <Link size={18} aria-hidden="true" />
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
                      <Image size={18} aria-hidden="true" />
                    )}
                  </>
                ) : attachment.kind === "file" ? (
                  <>
                    <div className="reminder-attachment__icon">
                      <File size={18} aria-hidden="true" />
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
                      <AnnotationText size={18} aria-hidden="true" />
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
              Restore
            </button>
          </div>
        ) : null}

        {compact && summaries.length > 0 ? (
          <p className="archive-summary">{summaries.slice(0, 2).join(" · ")}</p>
        ) : null}
      </motion.article>

      <AnimatePresence initial={false} mode="wait">
        {editorOpen ? (
          <div className="note-editor-overlay note-editor-overlay--side" role="dialog" aria-modal="true" aria-label="Edit reminder">
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
            <div className="note-editor-shell note-editor-shell--side" onMouseDown={(event) => event.stopPropagation()}>
              <div
                ref={editorPanelRef}
                className={`note-editor-panel p-0 note-editor-panel--side-enter ${
                  editorClosing ? "is-closing" : editorPanelEntered ? "is-open" : ""
                }`}
              >
                <div className="note-editor-floating-actions" onMouseDown={(event) => event.stopPropagation()}>
                  <motion.button
                    type="button"
                    className="icon-btn"
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={closeEditorWithAutosave}
                    aria-label="Close edit note"
                  >
                    <Close size={18} aria-hidden="true" />
                  </motion.button>
                  <Popover open={scheduleOpen} onOpenChange={setScheduleOpen}>
                    <PopoverTrigger asChild>
                      <motion.button
                        type="button"
                        className="icon-btn"
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.96 }}
                        aria-label="Set reminder date and time"
                        title="Set reminder date and time"
                      >
                        <Calendar size={18} aria-hidden="true" />
                      </motion.button>
                    </PopoverTrigger>
                    <PopoverContent side="bottom" align="end" sideOffset={8} className="schedule-popover">
                      <div className="schedule-popover__header">
                        <strong>Reminder time</strong>
                        <button type="button" className="btn subtle" onClick={() => setEditorRemindAt("")}>
                          Clear
                        </button>
                      </div>
                      <div className="schedule-popover__grid">
                        <label className="schedule-field schedule-field--date">
                          <span>Date</span>
                          <input type="date" value={scheduleParts.date} onChange={(e) => setDatePart(e.target.value)} />
                        </label>
                        <div className="schedule-popover__side">
                          <label className="schedule-field">
                            <span>Time</span>
                            <input
                              type="time"
                              value={scheduleParts.time}
                              onChange={(e) => setTimePart(e.target.value)}
                              disabled={!scheduleParts.date}
                            />
                          </label>
                        </div>
                      </div>
                      <div className="quick-presets quick-presets--in-popover" aria-label="Quick reminder presets">
                        <button type="button" className="btn subtle" onClick={() => setQuickPreset("1h")}>
                          In 1 hour
                        </button>
                        <button type="button" className="btn subtle" onClick={() => setQuickPreset("tomorrow")}>
                          Tomorrow morning
                        </button>
                        <button type="button" className="btn subtle" onClick={() => setQuickPreset("1w")}>
                          In a week
                        </button>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <motion.button
                    type="button"
                    className="icon-btn"
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => editorFileInputRef.current?.click()}
                    aria-label="Add attachment"
                    title="Add attachment"
                  >
                    <Attachment size={18} aria-hidden="true" />
                  </motion.button>
                </div>
                <input
                  ref={editorFileInputRef}
                  type="file"
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    if (e.target.files) void addFilesToEditor(e.target.files);
                    e.target.value = "";
                  }}
                />
                <div className="note-editor__body">
                  {reminderStateLabel ? (
                    <p className="note-editor__meta">
                      {reminderStateLabel}
                      {editorRemindAt
                        ? (() => {
                            const parsedDate = new Date(editorRemindAt);
                            return Number.isNaN(parsedDate.getTime()) ? "" : ` · ${formatWhen(parsedDate.toISOString())}`;
                          })()
                        : ""}
                    </p>
                  ) : null}
            <div onDrop={(event) => void onEditorDrop(event)} onDragOver={(event) => event.preventDefault()} onPaste={(event) => void onEditorPaste(event)}>
              <MarkdownBodyEditor
                valueHtml={editorHtml}
                onChange={setEditorBodyHtml}
                onAttachLinkPreview={(url) => addTextAttachmentToEditor(url)}
                className="note-editor__content note-editor__content--markdown"
                placeholder="Write details..."
              />
            </div>

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
                        setEditorBodyHtml(stripSpecificTagFromHtml(editorHtml, tag));
                      }}
                    >
                      <Close size={14} aria-hidden="true" />
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
                            : `reminder-attachment ${getAttachmentHref(attachment) ? "is-clickable" : ""}`
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
                                  <Link size={18} aria-hidden="true" />
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
                              <Image size={18} aria-hidden="true" />
                            )}
                          </>
                        ) : attachment.kind === "file" ? (
                          <>
                            <div className="reminder-attachment__icon">
                              <File size={18} aria-hidden="true" />
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
                              <AnnotationText size={18} aria-hidden="true" />
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
                          <Close size={14} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}
                </div>
                <div className="note-editor__footnote">
                  <span>Please return to</span>
                  <span>Vlad</span>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
