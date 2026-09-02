"use client";

import * as motion from "motion/react-client";
import type { ClipboardEvent, DragEvent, FormEvent } from "react";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { AnnotationText, Attachment, Calendar, Close, File, Image, Link } from "griddy-icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/animate-ui/components/radix/popover";
import { MarkdownBodyEditor } from "@/components/markdown-body-editor";
import { MAX_ATTACHMENTS } from "@/lib/constants";
import { getTagChipStyle } from "@/lib/tag-colors";
import { extractTagsFromText, extractUrlsFromText, isLikelyUrl, stripTagsFromHtml } from "@/lib/parse";
import { sanitizeNoteHtml, serializeNote, textToHtml } from "@/lib/note";
import type { CreateAttachmentInput } from "@/lib/types";

type DraftAttachment = CreateAttachmentInput & {
  localId: string;
  localFile?: File;
};

type Props = {
  onCreate: (payload: { note: string; remindAt: string | null; attachments: CreateAttachmentInput[] }) => Promise<void>;
  hideSubmitButton?: boolean;
  onRemindAtChange?: (remindAt: string | null) => void;
};

export type ReminderComposerHandle = {
  submitIfDirty: () => Promise<boolean>;
  focusBody: () => void;
  openSchedule: () => void;
  openFilePicker: () => void;
};

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

function formatSchedulePill(value: string) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(d);
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

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\u00a0/g, " ")
    .trim();
}

async function fileToAttachment(file: File): Promise<DraftAttachment> {
  const isImage = file.type.startsWith("image/");
  const previewImageUrl = isImage ? await fileToDataUrl(file) : null;
  return {
    localId: makeLocalId(),
    kind: isImage ? "image" : "file",
    fileName: file.name,
    fileSizeBytes: file.size,
    mimeType: file.type || null,
    previewImageUrl,
    metadataStatus: "ready",
    localFile: file
  };
}

export const ReminderComposer = forwardRef<ReminderComposerHandle, Props>(function ReminderComposer(
  { onCreate, hideSubmitButton = false, onRemindAtChange }: Props,
  ref
) {
  const [bodyHtml, setBodyHtml] = useState("");
  const [remindAt, setRemindAt] = useState("");
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const submitLockRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const markdownEditorRef = useRef<HTMLDivElement>(null);

  const scheduleParts = useMemo(() => splitLocalDatetime(remindAt), [remindAt]);
  const scheduleLabel = useMemo(() => formatSchedulePill(remindAt), [remindAt]);
  const bodyText = useMemo(() => htmlToPlainText(bodyHtml), [bodyHtml]);
  const tags = useMemo(() => extractTagsFromText(bodyText), [bodyText]);
  const allAttachments = useMemo(() => attachments, [attachments]);
  const hasContent = bodyText.trim().length > 0 || attachments.length > 0;
  const capacityRemaining = MAX_ATTACHMENTS - attachments.length;

  useEffect(() => {
    onRemindAtChange?.(remindAt ? new Date(remindAt).toISOString() : null);
  }, [onRemindAtChange, remindAt]);

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files).slice(0, capacityRemaining);
    if (list.length === 0) return;
    const next = await Promise.all(list.map(fileToAttachment));
    setAttachments((prev) => [...prev, ...next].slice(0, MAX_ATTACHMENTS));
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
    setRemindAt(toLocalDatetimeValue(d));
    setScheduleOpen(false);
  }

  function setDatePart(dateValue: string) {
    if (!dateValue) {
      setRemindAt("");
      return;
    }
    const time = scheduleParts.time || "09:00";
    setRemindAt(`${dateValue}T${time}`);
  }

  function setTimePart(timeValue: string) {
    const date = scheduleParts.date;
    if (!date) return;
    setRemindAt(`${date}T${timeValue || "09:00"}`);
  }

  function setBodyEditorHtml(next: string) {
    setBodyHtml(next);
  }

  function addTextPayload(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const urls = extractUrlsFromText(trimmed);

    if (urls.length === 1 && trimmed === urls[0]) {
      setAttachments((prev) =>
        prev
          .concat({
            localId: makeLocalId(),
            kind: "link",
            url: urls[0],
            previewTitle: urls[0],
            metadataStatus: "pending"
          })
          .slice(0, MAX_ATTACHMENTS)
      );
      return;
    }

    if (urls.length > 0) {
      const existingUrls = new Set(attachments.filter((a) => a.kind === "link").map((a) => a.url));
      const urlAttachments: DraftAttachment[] = urls
        .filter((url) => !existingUrls.has(url))
        .map((url) => ({
          localId: makeLocalId(),
          kind: "link" as const,
          url,
          previewTitle: url,
          metadataStatus: "pending" as const
        }));

      const stripped = trimmed.replace(/\bhttps?:\/\/[^\s<>"']+/gi, "").trim();
      if (stripped) {
        setBodyEditorHtml(`${bodyHtml}${bodyHtml ? "<br>" : ""}${textToHtml(stripped)}`);
      }

      setAttachments((prev) => [...prev, ...urlAttachments].slice(0, MAX_ATTACHMENTS));
      return;
    }

    setBodyEditorHtml(`${bodyHtml}${bodyHtml ? "<br>" : ""}${textToHtml(trimmed)}`);
  }

  async function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setError(null);
    if (event.dataTransfer.files?.length) await addFiles(event.dataTransfer.files);
    const text = event.dataTransfer.getData("text/plain");
    if (text) addTextPayload(text);
  }

  async function onBodyPaste(event: ClipboardEvent<HTMLDivElement>) {
    const files = event.clipboardData.files;
    if (files?.length) {
      event.preventDefault();
      await addFiles(files);
      return;
    }
    const text = event.clipboardData.getData("text/plain");
    if (isLikelyUrl(text)) {
      event.preventDefault();
      addTextPayload(text);
    }
  }


  function getAttachmentHref(attachment: DraftAttachment): string | null {
    if (attachment.kind === "link" && attachment.url) return attachment.url;
    if (attachment.kind === "image" && attachment.previewImageUrl) return attachment.previewImageUrl;
    return null;
  }

  function openAttachment(href: string) {
    window.open(href, "_blank", "noopener,noreferrer");
  }


  async function prepareAttachments(): Promise<CreateAttachmentInput[]> {
    const prepared: CreateAttachmentInput[] = [];
    for (const item of attachments) {
      if ((item.kind === "image" || item.kind === "file") && item.localFile) {
        const uploadResp = await fetch("/api/uploads", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            fileName: item.localFile.name,
            mimeType: item.localFile.type || "application/octet-stream",
            size: item.localFile.size
          })
        });
        if (!uploadResp.ok) throw new Error("Upload preparation failed");

        const uploadInfo = (await uploadResp.json()) as {
          storagePath: string;
          signedUploadUrl?: string | null;
        };

        if (uploadInfo.signedUploadUrl) {
          const putResp = await fetch(uploadInfo.signedUploadUrl, {
            method: "PUT",
            headers: {
              "content-type": item.localFile.type || "application/octet-stream",
              "x-upsert": "false"
            },
            body: item.localFile
          });
          if (!putResp.ok) throw new Error("File upload failed");
        }

        prepared.push({
          kind: item.kind,
          storagePath: uploadInfo.storagePath,
          fileName: item.fileName ?? null,
          fileSizeBytes: item.fileSizeBytes ?? null,
          mimeType: item.mimeType ?? null,
          previewImageUrl: item.previewImageUrl ?? null,
          metadataStatus: "ready"
        });
        continue;
      }

      prepared.push({
        kind: item.kind,
        url: item.url ?? null,
        textContent: item.textContent ?? null,
        previewTitle: item.previewTitle ?? null,
        previewIconUrl: item.previewIconUrl ?? null,
        previewImageUrl: item.previewImageUrl ?? null,
        metadataStatus: item.metadataStatus ?? "ready"
      });
    }
    return prepared;
  }

  async function submitCurrent(showEmptyError: boolean): Promise<boolean> {
    if (submitLockRef.current) return false;
    setError(null);
    if (!hasContent) {
      if (showEmptyError) {
        setError("Add body text or attachment first.");
      }
      return false;
    }
    submitLockRef.current = true;
    setSubmitting(true);
    try {
      const preparedAttachments = await prepareAttachments();
      const extractedTags = extractTagsFromText(bodyText);
      const cleanedBodyHtml = sanitizeNoteHtml(stripTagsFromHtml(bodyHtml || textToHtml(bodyText)));

      await onCreate({
        note: serializeNote("", cleanedBodyHtml, extractedTags),
        remindAt: remindAt ? new Date(remindAt).toISOString() : null,
        attachments: preparedAttachments
      });
      setBodyHtml("");
      setAttachments([]);
      setRemindAt("");
      setScheduleOpen(false);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create reminder");
      return false;
    } finally {
      setSubmitting(false);
      submitLockRef.current = false;
    }
  }

  useImperativeHandle(
    ref,
    () => ({
      submitIfDirty: () => submitCurrent(false),
      focusBody: () => {
        if (markdownEditorRef.current) {
          const markdownInput = markdownEditorRef.current.querySelector<HTMLElement>(".mdx-editor__content");
          if (markdownInput) {
            markdownInput.focus();
            return;
          }
        }
      },
      openSchedule: () => setScheduleOpen(true),
      openFilePicker: () => {
        fileInputRef.current?.click();
      }
    }),
    [hasContent, bodyHtml, remindAt, attachments, submitting]
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await submitCurrent(true);
  }

  return (
    <form className="composer-shell" onSubmit={handleSubmit}>
      <div
        className="composer-dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        aria-label="Drop links, text, images, or files here"
      >
        <div
          ref={markdownEditorRef}
          onPaste={(event) => void onBodyPaste(event)}
          onDrop={(event) => void onDrop(event)}
          onDragOver={(e) => e.preventDefault()}
        >
          <MarkdownBodyEditor
            valueHtml={bodyHtml}
            onChange={setBodyEditorHtml}
            onAttachLinkPreview={(url) => addTextPayload(url)}
            className="composer-body-input composer-body-input--markdown"
            placeholder="Write details..."
          />
        </div>

        {attachments.length > 0 ? (
          <div className="composer-attachments">
            {allAttachments.length > 0 ? (
              <ul className={`attachment-list ${allAttachments.length > 1 ? "is-carousel" : ""}`}>
                {allAttachments.map((attachment) => {
                  const href = getAttachmentHref(attachment);
                  return (
                    <li
                      key={attachment.localId}
                      className={
                        attachment.kind === "image"
                          ? `image-attachment-tile ${href ? "is-clickable" : ""}`
                          : `reminder-attachment ${href ? "is-clickable" : ""}`
                      }
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
                            <small>Attached file</small>
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
                          setAttachments((prev) => prev.filter((item) => item.localId !== attachment.localId));
                        }}
                        aria-label={attachment.kind === "image" ? "Remove image attachment" : "Remove attachment"}
                      >
                        <Close size={16} aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        ) : null}

        {tags.length > 0 ? (
          <div className="tag-chip-list" aria-label="Tags from note">
            {tags.map((tag) => (
              <span key={tag} className="tag-chip" style={getTagChipStyle(tag)}>
                #{tag}
              </span>
            ))}
          </div>
        ) : null}

        <div className="composer-toolbar">
          <motion.button
            type="button"
            className="composer-attach-icon"
            whileHover={attachments.length >= MAX_ATTACHMENTS ? undefined : { scale: 1.04 }}
            whileTap={attachments.length >= MAX_ATTACHMENTS ? undefined : { scale: 0.96 }}
            onClick={() => fileInputRef.current?.click()}
            disabled={attachments.length >= MAX_ATTACHMENTS}
            aria-label="Add file"
            title="Add file"
          >
            <Attachment size={18} aria-hidden="true" />
          </motion.button>

          <div className="composer-toolbar__right">
            <Popover open={scheduleOpen} onOpenChange={setScheduleOpen}>
              <PopoverTrigger asChild>
                <motion.button
                  type="button"
                  className="btn composer-calendar-btn"
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  aria-label="Set reminder date and time"
                  title="Set date and time"
                >
                  <Calendar size={18} aria-hidden="true" />
                </motion.button>
              </PopoverTrigger>
              <PopoverContent side="top" align="end" sideOffset={10} className="schedule-popover">
                <div className="schedule-popover__header">
                  <strong>Reminder time</strong>
                  <button type="button" className="btn subtle" onClick={() => setRemindAt("")}>
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
                    {scheduleLabel ? <p className="schedule-summary">{scheduleLabel}</p> : null}
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

            {scheduleLabel ? (
              <span className="composer-schedule-chip" aria-label={`Reminder set for ${scheduleLabel}`}>
                <span>{scheduleLabel}</span>
                <button
                  type="button"
                  className="composer-schedule-chip__clear"
                  onClick={() => setRemindAt("")}
                  aria-label="Clear reminder date and time"
                  title="Clear reminder date and time"
                >
                  <Close size={14} aria-hidden="true" />
                </button>
              </span>
            ) : null}

            {hideSubmitButton ? null : (
              <motion.button
                type="submit"
                className="btn primary composer-save-btn"
                disabled={submitting}
                whileHover={submitting ? undefined : { scale: 1.04 }}
                whileTap={submitting ? undefined : { scale: 0.96 }}
              >
                {submitting ? "Saving..." : "Post!"}
              </motion.button>
            )}
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
});
