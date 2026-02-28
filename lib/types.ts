export type AutoArchivePolicy = "never" | "24h" | "7d";
export type ReminderStatus = "upcoming" | "archived";
export type ArchiveReason = "completed" | "auto" | "manual" | null;
export type AttachmentKind = "link" | "image" | "file" | "text_snippet";
export type MetadataStatus = "pending" | "ready" | "failed";

export interface Profile {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  timezone: string;
  autoArchivePolicy: AutoArchivePolicy;
  createdAt: string;
  updatedAt: string;
}

export interface ReminderAttachment {
  id: string;
  reminderId: string;
  kind: AttachmentKind;
  storagePath: string | null;
  mimeType: string | null;
  fileName: string | null;
  fileSizeBytes: number | null;
  url: string | null;
  textContent: string | null;
  previewTitle: string | null;
  previewIconUrl: string | null;
  previewImageUrl: string | null;
  metadataStatus: MetadataStatus;
  createdAt: string;
}

export interface Reminder {
  id: string;
  userId: string;
  note: string | null;
  status: ReminderStatus;
  archiveReason: ArchiveReason;
  remindAt: string | null;
  archivedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  attachments: ReminderAttachment[];
}

export interface ReminderWithComputed extends Reminder {
  isDue: boolean;
  isOverdue: boolean;
}

export interface CreateAttachmentInput {
  kind: AttachmentKind;
  storagePath?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
  fileSizeBytes?: number | null;
  url?: string | null;
  textContent?: string | null;
  previewTitle?: string | null;
  previewIconUrl?: string | null;
  previewImageUrl?: string | null;
  metadataStatus?: MetadataStatus;
}

export interface CreateReminderInput {
  note?: string | null;
  remindAt?: string | null;
  attachments: CreateAttachmentInput[];
}

export interface UpdateReminderInput {
  remindAt?: string | null;
  note?: string | null;
  removeAttachmentIds?: string[];
}

export interface ArchiveReminderInput {
  reason: Exclude<ArchiveReason, null>;
}

export interface SnoozeReminderInput {
  minutes?: number;
  preset?: "10m" | "1h" | "tomorrow";
}

export interface ArchiveQuery {
  filter?: "all" | "completed" | "auto";
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface ArchiveQueryResult {
  items: Reminder[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UpdateSettingsInput {
  timezone?: string;
  autoArchivePolicy?: AutoArchivePolicy;
}

export interface UploadRequest {
  fileName: string;
  mimeType: string;
  size: number;
}

export interface UploadResponse {
  storagePath: string;
  publicUrl: string | null;
  signedUploadUrl: string | null;
}
