"use client";

import * as motion from "motion/react-client";
import { AnimatePresence } from "motion/react";
import type { ClipboardEvent, DragEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Checkbox } from "@/components/animate-ui/components/radix/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/animate-ui/components/radix/popover";
import { MAX_ATTACHMENTS } from "@/lib/constants";
import { parseStoredNote, sanitizeNoteHtml, serializeNote } from "@/lib/note";
import { getTagChipStyle } from "@/lib/tag-colors";
import {
  extractTagsFromText,
  extractUrlsFromText,
  isLikelyUrl,
  stripSpecificTagFromHtml,
  stripSpecificTagFromText,
  stripTagsFromHtml,
  stripTagsFromText,
  summarizeFileSize
} from "@/lib/parse";
import type { CreateAttachmentInput, ReminderWithComputed } from "@/lib/types";

type Props = {
  reminder: ReminderWithComputed;
  onSnooze: (id: string, preset: "10m" | "1h" | "tomorrow") => void;
  onArchive: (id: string, reason: "completed" | "manual") => Promise<void> | void;
  onReschedule: (id: string, remindAt: string) => void;
  onUpdateNote?: (
    id: string,
    note: string,
    options?: { removeAttachmentIds?: string[]; attachments?: CreateAttachmentInput[]; remindAt?: string | null }
  ) => Promise<void> | void;
  compact?: boolean;
  onRestore?: (id: string) => void;
};

type EditorDraft = {
  title: string;
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
  const [isCompleting, setIsCompleting] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorClosing, setEditorClosing] = useState(false);
  const [editorTitle, setEditorTitle] = useState(parsedNote.title);
  const [editorHtml, setEditorHtml] = useState(noteBodyHtml);
  const [editorTagState, setEditorTagState] = useState(tags);
  const [editorAttachments, setEditorAttachments] = useState<EditorAttachment[]>(reminder.attachments);
  const [editorRemindAt, setEditorRemindAt] = useState(reminder.remindAt ? toLocalDatetimeValue(new Date(reminder.remindAt)) : "");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formatMenu, setFormatMenu] = useState<{ open: boolean; x: number; y: number }>({
    open: false,
    x: 0,
    y: 0
  });
  const editorRef = useRef<HTMLDivElement>(null);
  const editorPanelRef = useRef<HTMLDivElement>(null);
  const editorFileInputRef = useRef<HTMLInputElement>(null);
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
  const scheduleParts = useMemo(() => splitLocalDatetime(editorRemindAt), [editorRemindAt]);
  const capacityRemaining = MAX_ATTACHMENTS - editorAttachments.length;

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
    (span.style as CSSStyleDeclaration & { webkitTextFillColor?: string }).webkitTextFillColor = color;
    span.style.backgroundImage = "none";
    span.style.backgroundClip = "border-box";
    (span.style as CSSStyleDeclaration & { webkitBackgroundClip?: string }).webkitBackgroundClip = "border-box";
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
      const extractedTags = extractTagsFromText([draft.title, htmlToPlainText(draft.html)].filter(Boolean).join("\n"));
      const mergedTags = Array.from(new Set([...(draft.tags ?? []), ...extractedTags]));
      const cleanedTitle = stripTagsFromText(draft.title);
      const cleanedHtml = sanitizeNoteHtml(stripTagsFromHtml(draft.html));
      const createdAttachments = await prepareNewEditorAttachments(draft);
      const remindAtIso = draft.remindAt ? new Date(draft.remindAt).toISOString() : null;
      await Promise.resolve(
        onUpdateNote(reminder.id, serializeNote(cleanedTitle, cleanedHtml, mergedTags), {
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
      title: editorTitle,
      html: editorHtml,
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
  }, [editorOpen, editorTitle, editorHtml, editorAttachments, editorTagState, editorRemindAt, onUpdateNote]);

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
            <div className="note-editor__header-actions">
              <motion.button
                type="button"
                className="icon-btn"
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => editorFileInputRef.current?.click()}
                aria-label="Add attachment"
                title="Add attachment"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M16.5 6.5 9 14a3.5 3.5 0 1 0 5 5l7-7a5.5 5.5 0 1 0-7.8-7.8l-7.2 7.2"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
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
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M7 3v3M17 3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v11a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a2 2 0 0 1 2-2Z"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
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
                onClick={closeEditorWithAutosave}
                aria-label="Close edit note"
              >
                ×
              </motion.button>
            </div>
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
              onDrop={(event) => void onEditorDrop(event)}
              onDragOver={(event) => event.preventDefault()}
              onPaste={(event) => void onEditorPaste(event)}
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
