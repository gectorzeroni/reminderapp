import { z } from "zod";
import {
  AUTO_ARCHIVE_POLICIES,
  MAX_ATTACHMENTS,
  MAX_FILE_BYTES,
  MAX_IMAGE_BYTES
} from "@/lib/constants";

const attachmentKindSchema = z.enum(["link", "image", "file", "text_snippet"]);

export const createReminderSchema = z
  .object({
    note: z.string().trim().max(5000).optional().nullable(),
    remindAt: z.string().datetime().optional().nullable(),
    attachments: z
      .array(
        z.object({
          kind: attachmentKindSchema,
          storagePath: z.string().optional().nullable(),
          mimeType: z.string().optional().nullable(),
          fileName: z.string().max(255).optional().nullable(),
          fileSizeBytes: z.number().int().nonnegative().optional().nullable(),
          url: z.string().url().optional().nullable(),
          textContent: z.string().max(10000).optional().nullable(),
          previewTitle: z.string().max(500).optional().nullable(),
          previewIconUrl: z.string().url().optional().nullable(),
          previewImageUrl: z.string().url().optional().nullable(),
          metadataStatus: z.enum(["pending", "ready", "failed"]).optional()
        })
      )
      .max(MAX_ATTACHMENTS)
      .default([])
  })
  .superRefine((value, ctx) => {
    const hasNote = Boolean(value.note?.trim());
    const hasAttachments = value.attachments.length > 0;
    if (!hasNote && !hasAttachments) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Reminder requires a note or at least one attachment",
        path: ["note"]
      });
    }

    if (value.remindAt) {
      const remindAt = new Date(value.remindAt);
      if (Number.isNaN(remindAt.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid remindAt",
          path: ["remindAt"]
        });
      } else {
        const skew = Date.now() - remindAt.getTime();
        if (skew > 60_000) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "remindAt must be in the future",
            path: ["remindAt"]
          });
        }
      }
    }

    for (const [index, attachment] of value.attachments.entries()) {
      if (attachment.kind === "image" && (attachment.fileSizeBytes ?? 0) > MAX_IMAGE_BYTES) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Image is too large",
          path: ["attachments", index, "fileSizeBytes"]
        });
      }
      if (attachment.kind === "file" && (attachment.fileSizeBytes ?? 0) > MAX_FILE_BYTES) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "File is too large",
          path: ["attachments", index, "fileSizeBytes"]
        });
      }
    }
  });

export const updateReminderSchema = z.object({
  remindAt: z.string().datetime().nullable().optional(),
  note: z.string().trim().max(20000).nullable().optional()
});

export const snoozeSchema = z
  .object({
    preset: z.enum(["10m", "1h", "tomorrow"]).optional(),
    minutes: z.number().int().positive().max(60 * 24 * 30).optional()
  })
  .refine((v) => Boolean(v.preset || v.minutes), { message: "preset or minutes is required" });

export const archiveSchema = z.object({
  reason: z.enum(["completed", "manual", "auto"])
});

export const archiveQuerySchema = z.object({
  filter: z.enum(["all", "completed", "auto"]).optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional()
});

export const updateSettingsSchema = z.object({
  timezone: z.string().min(1).max(100).optional(),
  autoArchivePolicy: z.enum(AUTO_ARCHIVE_POLICIES).optional()
});

export const uploadRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(200),
  size: z.number().int().positive()
});
