"use client";

import * as motion from "motion/react-client";
import type { ClipboardEvent, DragEvent, FormEvent, KeyboardEvent } from "react";
import { useMemo, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/animate-ui/components/radix/popover";
import { MAX_ATTACHMENTS } from "@/lib/constants";
import { extractTagsFromText, extractUrlsFromText, isLikelyUrl } from "@/lib/parse";
import type { CreateAttachmentInput } from "@/lib/types";

type DraftAttachment = CreateAttachmentInput & {
  localId: string;
  localFile?: File;
};

type Props = {
  onCreate: (payload: { note: string; remindAt: string | null; attachments: CreateAttachmentInput[] }) => Promise<void>;
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

export function ReminderComposer({ onCreate }: Props) {
  const [note, setNote] = useState("");
  const [remindAt, setRemindAt] = useState("");
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasContent = note.trim().length > 0 || attachments.length > 0;
  const capacityRemaining = MAX_ATTACHMENTS - attachments.length;
  const scheduleParts = useMemo(() => splitLocalDatetime(remindAt), [remindAt]);
  const tags = useMemo(() => extractTagsFromText(note), [note]);
  const scheduleLabel = useMemo(() => formatSchedulePill(remindAt), [remindAt]);

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
      if (!note.trim()) {
        if (stripped) setNote(stripped);
      } else if (stripped) {
        urlAttachments.push({
          localId: makeLocalId(),
          kind: "text_snippet",
          textContent: stripped,
          metadataStatus: "ready"
        });
      }

      setAttachments((prev) => [...prev, ...urlAttachments].slice(0, MAX_ATTACHMENTS));
      return;
    }

    if (!note.trim()) {
      setNote(trimmed);
    } else {
      setAttachments((prev) =>
        prev
          .concat({
            localId: makeLocalId(),
            kind: "text_snippet",
            textContent: trimmed,
            metadataStatus: "ready"
          })
          .slice(0, MAX_ATTACHMENTS)
      );
    }
  }

  async function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setError(null);
    if (event.dataTransfer.files?.length) await addFiles(event.dataTransfer.files);
    const text = event.dataTransfer.getData("text/plain");
    if (text) addTextPayload(text);
  }

  async function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = event.clipboardData.files;
    if (files?.length) {
      event.preventDefault();
      await addFiles(files);
      return;
    }
    const text = event.clipboardData.getData("text/plain");
    if (isLikelyUrl(text) && !event.currentTarget.value.trim()) {
      event.preventDefault();
      addTextPayload(text);
    }
  }

  function onTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter") return;
    if (event.shiftKey) return;
    if (event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!hasContent) {
      setError("Add a note or drop something first.");
      return;
    }

    setSubmitting(true);
    try {
      const preparedAttachments = await prepareAttachments();
      await onCreate({
        note,
        remindAt: remindAt ? new Date(remindAt).toISOString() : null,
        attachments: preparedAttachments
      });
      setNote("");
      setAttachments([]);
      setRemindAt("");
      setScheduleOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create reminder");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="composer-shell" onSubmit={handleSubmit}>
      <div
        className="composer-dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        aria-label="Drop links, text, images, or files here"
      >
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onPaste={onPaste}
          onKeyDown={onTextareaKeyDown}
          placeholder="Drop a link, image, file, or type a reminder note..."
          rows={2}
        />

        {tags.length > 0 ? (
          <div className="tag-chip-list" aria-label="Tags from note">
            {tags.map((tag) => (
              <span key={tag} className="tag-chip">
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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M9.5 12.5 15.7 6.3a3.5 3.5 0 1 1 5 5l-9.2 9.2a5.5 5.5 0 1 1-7.8-7.8l9.2-9.2"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
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
                  ×
                </button>
              </span>
            ) : null}

            <motion.button
              type="submit"
              className="btn primary composer-save-btn"
              disabled={submitting}
              whileHover={submitting ? undefined : { scale: 1.04 }}
              whileTap={submitting ? undefined : { scale: 0.96 }}
            >
              {submitting ? "Saving..." : "Save reminder"}
            </motion.button>
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

        {attachments.length > 0 ? (
          <ul className="composer-attachments">
            {attachments.map((attachment) => (
              <li key={attachment.localId} className="attachment-chip">
                {attachment.kind === "link" ? (
                  <>
                    <span aria-hidden="true">🔗</span>
                    <span>{attachment.url}</span>
                  </>
                ) : attachment.kind === "image" ? (
                  <>
                    {attachment.previewImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={attachment.previewImageUrl} alt="" width={28} height={28} className="thumb" />
                    ) : (
                      <span aria-hidden="true">🖼️</span>
                    )}
                    <span>{attachment.fileName}</span>
                  </>
                ) : attachment.kind === "file" ? (
                  <>
                    <span aria-hidden="true">📎</span>
                    <span>{attachment.fileName}</span>
                  </>
                ) : (
                  <>
                    <span aria-hidden="true">📝</span>
                    <span>{attachment.textContent?.slice(0, 80)}</span>
                  </>
                )}
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setAttachments((prev) => prev.filter((a) => a.localId !== attachment.localId))}
                  aria-label="Remove attachment"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
