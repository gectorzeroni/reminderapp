import { randomUUID } from "node:crypto";
import { DEFAULT_PAGE_SIZE, DEMO_USER_ID } from "@/lib/constants";
import { env } from "@/lib/env";
import { fetchLinkPreview } from "@/lib/metadata";
import { getDomainFaviconUrl } from "@/lib/parse";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getAutoArchiveThresholdMs } from "@/lib/time";
import type {
  ArchiveQuery,
  ArchiveQueryResult,
  ArchiveReminderInput,
  CreateReminderInput,
  Profile,
  Reminder,
  ReminderAttachment,
  SnoozeReminderInput,
  UpdateReminderInput,
  UpdateSettingsInput
} from "@/lib/types";

type StoreState = {
  profiles: Map<string, Profile>;
  reminders: Map<string, Reminder>;
};

type DbReminderRow = {
  id: string;
  user_id: string;
  note: string | null;
  status: "upcoming" | "archived";
  archive_reason: "completed" | "auto" | "manual" | null;
  remind_at: string | null;
  archived_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  reminder_attachments?: DbAttachmentRow[];
};

type DbAttachmentRow = {
  id: string;
  reminder_id: string;
  kind: ReminderAttachment["kind"];
  storage_path: string | null;
  mime_type: string | null;
  file_name: string | null;
  file_size_bytes: number | null;
  url: string | null;
  text_content: string | null;
  preview_title: string | null;
  preview_icon_url: string | null;
  preview_image_url: string | null;
  metadata_status: ReminderAttachment["metadataStatus"];
  created_at: string;
};

type DbProfileRow = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  timezone: string;
  auto_archive_policy: Profile["autoArchivePolicy"];
  created_at: string;
  updated_at: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __smartReminderStore: StoreState | undefined;
}

function nowIso() {
  return new Date().toISOString();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function shouldUseSupabase(userId?: string) {
  return Boolean(getSupabaseServiceClient() && userId && userId !== DEMO_USER_ID && isUuid(userId));
}

function getStore(): StoreState {
  if (!global.__smartReminderStore) {
    global.__smartReminderStore = {
      profiles: new Map(),
      reminders: new Map()
    };
  }
  return global.__smartReminderStore;
}

function ensureProfileLocal(userId: string): Profile {
  const store = getStore();
  const existing = store.profiles.get(userId);
  if (existing) return existing;
  const createdAt = nowIso();
  const profile: Profile = {
    id: userId,
    displayName: "Demo User",
    avatarUrl: null,
    timezone: "UTC",
    autoArchivePolicy: "never",
    createdAt,
    updatedAt: createdAt
  };
  store.profiles.set(userId, profile);
  return profile;
}

function deepCloneReminder(reminder: Reminder): Reminder {
  return JSON.parse(JSON.stringify(reminder)) as Reminder;
}

function sortByRemindAtAsc(a: Reminder, b: Reminder) {
  const aTime = a.remindAt ? new Date(a.remindAt).getTime() : Number.POSITIVE_INFINITY;
  const bTime = b.remindAt ? new Date(b.remindAt).getTime() : Number.POSITIVE_INFINITY;
  return aTime - bTime;
}

function matchesArchiveSearch(reminder: Reminder, q?: string): boolean {
  if (!q?.trim()) return true;
  const needle = q.toLowerCase();
  if (reminder.note?.toLowerCase().includes(needle)) return true;
  return reminder.attachments.some((attachment) =>
    [attachment.fileName, attachment.url, attachment.previewTitle, attachment.textContent]
      .filter(Boolean)
      .some((value) => (value as string).toLowerCase().includes(needle))
  );
}

async function enrichAttachmentsForCreate(
  reminderId: string,
  items: CreateReminderInput["attachments"],
  timestamp: string
): Promise<ReminderAttachment[]> {
  return Promise.all(
    items.map(async (item) => {
      const base: ReminderAttachment = {
        id: randomUUID(),
        reminderId,
        kind: item.kind,
        storagePath: item.storagePath ?? null,
        mimeType: item.mimeType ?? null,
        fileName: item.fileName ?? null,
        fileSizeBytes: item.fileSizeBytes ?? null,
        url: item.url ?? null,
        textContent: item.textContent ?? null,
        previewTitle: item.previewTitle ?? null,
        previewIconUrl: item.previewIconUrl ?? null,
        previewImageUrl: item.previewImageUrl ?? null,
        metadataStatus: item.metadataStatus ?? "ready",
        createdAt: timestamp
      };
      if (base.kind === "link" && base.url) {
        const metadata = await fetchLinkPreview(base.url);
        return {
          ...base,
          previewTitle: base.previewTitle || metadata.previewTitle || base.url,
          previewIconUrl: base.previewIconUrl || metadata.previewIconUrl || getDomainFaviconUrl(base.url),
          metadataStatus: metadata.metadataStatus
        };
      }
      return base;
    })
  );
}

function mapProfileRow(row: DbProfileRow): Profile {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    timezone: row.timezone,
    autoArchivePolicy: row.auto_archive_policy,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapAttachmentRow(row: DbAttachmentRow): ReminderAttachment {
  return {
    id: row.id,
    reminderId: row.reminder_id,
    kind: row.kind,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    fileName: row.file_name,
    fileSizeBytes: row.file_size_bytes,
    url: row.url,
    textContent: row.text_content,
    previewTitle: row.preview_title,
    previewIconUrl: row.preview_icon_url,
    previewImageUrl: row.preview_image_url,
    metadataStatus: row.metadata_status,
    createdAt: row.created_at
  };
}

function mapReminderRow(row: DbReminderRow): Reminder {
  return {
    id: row.id,
    userId: row.user_id,
    note: row.note,
    status: row.status,
    archiveReason: row.archive_reason,
    remindAt: row.remind_at,
    archivedAt: row.archived_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    attachments: (row.reminder_attachments ?? []).map(mapAttachmentRow)
  };
}

async function maybeAttachSignedPreviewUrls(reminders: Reminder[]): Promise<Reminder[]> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return reminders;

  const out: Reminder[] = [];
  for (const reminder of reminders) {
    const attachments = await Promise.all(
      reminder.attachments.map(async (attachment) => {
        if (!attachment.storagePath) return attachment;
        if (attachment.kind !== "image") return attachment;
        const { data } = await supabase.storage
          .from(env.supabaseStorageBucket)
          .createSignedUrl(attachment.storagePath, 60 * 60);
        return {
          ...attachment,
          previewImageUrl: data?.signedUrl ?? attachment.previewImageUrl
        };
      })
    );
    out.push({ ...reminder, attachments });
  }
  return out;
}

async function ensureProfileSupabase(userId: string): Promise<Profile> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return structuredClone(ensureProfileLocal(userId));

  const now = nowIso();
  const { data: existing, error: readError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (readError) {
    return structuredClone(ensureProfileLocal(userId));
  }

  if (existing) {
    return mapProfileRow(existing as DbProfileRow);
  }

  const insertPayload = {
    id: userId,
    display_name: null,
    avatar_url: null,
    timezone: "UTC",
    auto_archive_policy: "never"
  };

  // If FK to auth.users is present and user does not exist, insert will fail.
  // In that case we fall back to local mode to keep development usable.
  const { error: insertError } = await supabase.from("profiles").insert(insertPayload);
  if (insertError) {
    return structuredClone(ensureProfileLocal(userId));
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error || !data) {
    return {
      id: userId,
      displayName: null,
      avatarUrl: null,
      timezone: "UTC",
      autoArchivePolicy: "never",
      createdAt: now,
      updatedAt: now
    };
  }

  return mapProfileRow(data as DbProfileRow);
}

async function fetchReminderByIdSupabase(userId: string, reminderId: string): Promise<Reminder | null> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("reminders")
    .select("*, reminder_attachments(*)")
    .eq("user_id", userId)
    .eq("id", reminderId)
    .single();
  if (error || !data) return null;
  const [mapped] = await maybeAttachSignedPreviewUrls([mapReminderRow(data as DbReminderRow)]);
  return mapped ?? null;
}

function archiveThresholdIso(policy: Profile["autoArchivePolicy"]): string | null {
  const threshold = getAutoArchiveThresholdMs(policy);
  if (threshold == null) return null;
  return new Date(Date.now() - threshold).toISOString();
}

// Local fallback implementation
async function createReminderLocal(userId: string, input: CreateReminderInput): Promise<Reminder> {
  ensureProfileLocal(userId);
  const store = getStore();
  const timestamp = nowIso();
  const reminderId = randomUUID();
  const attachments = await enrichAttachmentsForCreate(reminderId, input.attachments, timestamp);
  const reminder: Reminder = {
    id: reminderId,
    userId,
    note: input.note?.trim() || null,
    status: "upcoming",
    archiveReason: null,
    remindAt: input.remindAt ?? null,
    archivedAt: null,
    completedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    attachments
  };
  store.reminders.set(reminder.id, reminder);
  return deepCloneReminder(reminder);
}

async function getUpcomingRemindersLocal(userId: string): Promise<Reminder[]> {
  await autoArchiveForUserLocal(userId);
  const store = getStore();
  return Array.from(store.reminders.values())
    .filter((r) => r.userId === userId && r.status !== "archived")
    .sort(sortByRemindAtAsc)
    .map(deepCloneReminder);
}

async function updateReminderLocal(userId: string, reminderId: string, input: UpdateReminderInput): Promise<Reminder | null> {
  const store = getStore();
  const reminder = store.reminders.get(reminderId);
  if (!reminder || reminder.userId !== userId) return null;
  if ("remindAt" in input) reminder.remindAt = input.remindAt ?? null;
  reminder.updatedAt = nowIso();
  if (reminder.status === "archived") {
    reminder.status = "upcoming";
    reminder.archiveReason = null;
    reminder.archivedAt = null;
    reminder.completedAt = null;
  }
  return deepCloneReminder(reminder);
}

async function snoozeReminderLocal(userId: string, reminderId: string, input: SnoozeReminderInput): Promise<Reminder | null> {
  const store = getStore();
  const reminder = store.reminders.get(reminderId);
  if (!reminder || reminder.userId !== userId) return null;
  const base = new Date();
  if (input.preset === "10m") base.setMinutes(base.getMinutes() + 10);
  else if (input.preset === "1h") base.setHours(base.getHours() + 1);
  else if (input.preset === "tomorrow") {
    base.setDate(base.getDate() + 1);
    base.setHours(9, 0, 0, 0);
  } else base.setMinutes(base.getMinutes() + (input.minutes ?? 10));
  reminder.remindAt = base.toISOString();
  reminder.updatedAt = nowIso();
  if (reminder.status === "archived") {
    reminder.status = "upcoming";
    reminder.archiveReason = null;
    reminder.archivedAt = null;
    reminder.completedAt = null;
  }
  return deepCloneReminder(reminder);
}

async function archiveReminderLocal(
  userId: string,
  reminderId: string,
  input: ArchiveReminderInput
): Promise<Reminder | null> {
  const store = getStore();
  const reminder = store.reminders.get(reminderId);
  if (!reminder || reminder.userId !== userId) return null;
  const timestamp = nowIso();
  reminder.status = "archived";
  reminder.archiveReason = input.reason;
  reminder.archivedAt = timestamp;
  reminder.updatedAt = timestamp;
  if (input.reason === "completed") reminder.completedAt = timestamp;
  return deepCloneReminder(reminder);
}

async function getArchivedRemindersLocal(userId: string, query: ArchiveQuery): Promise<ArchiveQueryResult> {
  await autoArchiveForUserLocal(userId);
  const store = getStore();
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  const filtered = Array.from(store.reminders.values())
    .filter((r) => r.userId === userId && r.status === "archived")
    .filter((r) => (query.filter === "completed" ? r.archiveReason === "completed" : query.filter === "auto" ? r.archiveReason === "auto" : true))
    .filter((r) => matchesArchiveSearch(r, query.q))
    .sort((a, b) => new Date(b.archivedAt || b.updatedAt).getTime() - new Date(a.archivedAt || a.updatedAt).getTime());
  const start = (page - 1) * pageSize;
  return { items: filtered.slice(start, start + pageSize).map(deepCloneReminder), total: filtered.length, page, pageSize };
}

async function getProfileLocal(userId: string): Promise<Profile> {
  return structuredClone(ensureProfileLocal(userId));
}

async function updateSettingsLocal(userId: string, input: UpdateSettingsInput): Promise<Profile> {
  const profile = ensureProfileLocal(userId);
  if (input.timezone) profile.timezone = input.timezone;
  if (input.autoArchivePolicy) profile.autoArchivePolicy = input.autoArchivePolicy;
  profile.updatedAt = nowIso();
  return structuredClone(profile);
}

async function autoArchiveForUserLocal(userId: string): Promise<number> {
  const store = getStore();
  const profile = ensureProfileLocal(userId);
  const threshold = getAutoArchiveThresholdMs(profile.autoArchivePolicy);
  if (threshold == null) return 0;
  const now = Date.now();
  let count = 0;
  for (const reminder of store.reminders.values()) {
    if (reminder.userId !== userId || reminder.status === "archived") continue;
    if (!reminder.remindAt) continue;
    if (now >= new Date(reminder.remindAt).getTime() + threshold) {
      reminder.status = "archived";
      reminder.archiveReason = "auto";
      reminder.archivedAt = nowIso();
      reminder.updatedAt = reminder.archivedAt;
      count += 1;
    }
  }
  return count;
}

async function autoArchiveAllUsersLocal(): Promise<{ usersProcessed: number; archived: number }> {
  const store = getStore();
  const userIds = Array.from(store.profiles.keys());
  let archived = 0;
  for (const userId of userIds) archived += await autoArchiveForUserLocal(userId);
  return { usersProcessed: userIds.length, archived };
}

// Supabase implementation (used when service-role env exists and userId looks like a real auth UUID)
async function createReminderSupabase(userId: string, input: CreateReminderInput): Promise<Reminder> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return createReminderLocal(userId, input);
  await ensureProfileSupabase(userId);
  const reminderId = randomUUID();
  const timestamp = nowIso();
  const attachments = await enrichAttachmentsForCreate(reminderId, input.attachments, timestamp);

  const { error: reminderError } = await supabase.from("reminders").insert({
    id: reminderId,
    user_id: userId,
    note: input.note?.trim() || null,
    status: "upcoming",
    remind_at: input.remindAt ?? null,
    archive_reason: null,
    archived_at: null,
    completed_at: null
  });
  if (reminderError) throw new Error(reminderError.message);

  if (attachments.length > 0) {
    const { error: attachmentError } = await supabase.from("reminder_attachments").insert(
      attachments.map((a) => ({
        id: a.id,
        reminder_id: a.reminderId,
        kind: a.kind,
        storage_path: a.storagePath,
        mime_type: a.mimeType,
        file_name: a.fileName,
        file_size_bytes: a.fileSizeBytes,
        url: a.url,
        text_content: a.textContent,
        preview_title: a.previewTitle,
        preview_icon_url: a.previewIconUrl,
        preview_image_url: a.previewImageUrl,
        metadata_status: a.metadataStatus
      }))
    );
    if (attachmentError) throw new Error(attachmentError.message);
  }

  const fetched = await fetchReminderByIdSupabase(userId, reminderId);
  if (!fetched) throw new Error("Failed to fetch created reminder");
  return fetched;
}

async function getUpcomingRemindersSupabase(userId: string): Promise<Reminder[]> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return getUpcomingRemindersLocal(userId);
  await autoArchiveForUserSupabase(userId);

  const { data, error } = await supabase
    .from("reminders")
    .select("*, reminder_attachments(*)")
    .eq("user_id", userId)
    .neq("status", "archived")
    .order("remind_at", { ascending: true, nullsFirst: false })
    .returns<DbReminderRow[]>();

  if (error) throw new Error(error.message);
  return maybeAttachSignedPreviewUrls((data ?? []).map(mapReminderRow));
}

async function updateReminderSupabase(userId: string, reminderId: string, input: UpdateReminderInput): Promise<Reminder | null> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return updateReminderLocal(userId, reminderId, input);
  const patch: Record<string, unknown> = { updated_at: nowIso() };
  if ("remindAt" in input) patch.remind_at = input.remindAt ?? null;
  patch.status = "upcoming";
  patch.archive_reason = null;
  patch.archived_at = null;
  patch.completed_at = null;

  const { data, error } = await supabase
    .from("reminders")
    .update(patch)
    .eq("id", reminderId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return fetchReminderByIdSupabase(userId, reminderId);
}

async function snoozeReminderSupabase(userId: string, reminderId: string, input: SnoozeReminderInput): Promise<Reminder | null> {
  const base = new Date();
  if (input.preset === "10m") base.setMinutes(base.getMinutes() + 10);
  else if (input.preset === "1h") base.setHours(base.getHours() + 1);
  else if (input.preset === "tomorrow") {
    base.setDate(base.getDate() + 1);
    base.setHours(9, 0, 0, 0);
  } else base.setMinutes(base.getMinutes() + (input.minutes ?? 10));
  return updateReminderSupabase(userId, reminderId, { remindAt: base.toISOString() });
}

async function archiveReminderSupabase(userId: string, reminderId: string, input: ArchiveReminderInput): Promise<Reminder | null> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return archiveReminderLocal(userId, reminderId, input);
  const timestamp = nowIso();
  const patch: Record<string, unknown> = {
    status: "archived",
    archive_reason: input.reason,
    archived_at: timestamp,
    updated_at: timestamp
  };
  if (input.reason === "completed") patch.completed_at = timestamp;

  const { data, error } = await supabase
    .from("reminders")
    .update(patch)
    .eq("id", reminderId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return fetchReminderByIdSupabase(userId, reminderId);
}

async function getArchivedRemindersSupabase(userId: string, query: ArchiveQuery): Promise<ArchiveQueryResult> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return getArchivedRemindersLocal(userId, query);
  await autoArchiveForUserSupabase(userId);
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

  let q = supabase
    .from("reminders")
    .select("*, reminder_attachments(*)")
    .eq("user_id", userId)
    .eq("status", "archived")
    .order("archived_at", { ascending: false })
    .returns<DbReminderRow[]>();

  if (query.filter === "completed") q = q.eq("archive_reason", "completed");
  if (query.filter === "auto") q = q.eq("archive_reason", "auto");

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  let reminders = await maybeAttachSignedPreviewUrls((data ?? []).map(mapReminderRow));
  reminders = reminders.filter((r) => matchesArchiveSearch(r, query.q));
  const start = (page - 1) * pageSize;
  return { items: reminders.slice(start, start + pageSize), total: reminders.length, page, pageSize };
}

async function getProfileSupabase(userId: string): Promise<Profile> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return getProfileLocal(userId);
  return ensureProfileSupabase(userId);
}

async function updateSettingsSupabase(userId: string, input: UpdateSettingsInput): Promise<Profile> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return updateSettingsLocal(userId, input);
  await ensureProfileSupabase(userId);
  const patch: Record<string, unknown> = {};
  if (input.timezone) patch.timezone = input.timezone;
  if (input.autoArchivePolicy) patch.auto_archive_policy = input.autoArchivePolicy;
  if (Object.keys(patch).length === 0) return getProfileSupabase(userId);

  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", userId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapProfileRow(data as DbProfileRow);
}

async function autoArchiveForUserSupabase(userId: string): Promise<number> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return autoArchiveForUserLocal(userId);
  const profile = await ensureProfileSupabase(userId);
  const thresholdIso = archiveThresholdIso(profile.autoArchivePolicy);
  if (!thresholdIso) return 0;

  const { data, error } = await supabase
    .from("reminders")
    .update({
      status: "archived",
      archive_reason: "auto",
      archived_at: nowIso()
    })
    .eq("user_id", userId)
    .eq("status", "upcoming")
    .not("remind_at", "is", null)
    .lte("remind_at", thresholdIso)
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

async function autoArchiveAllUsersSupabase(): Promise<{ usersProcessed: number; archived: number }> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return autoArchiveAllUsersLocal();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, auto_archive_policy")
    .neq("auto_archive_policy", "never");
  if (error) throw new Error(error.message);
  let archived = 0;
  for (const row of data ?? []) {
    archived += await autoArchiveForUserSupabase(row.id as string);
  }
  return { usersProcessed: (data ?? []).length, archived };
}

// Public repository API
export async function createReminder(userId: string, input: CreateReminderInput): Promise<Reminder> {
  return shouldUseSupabase(userId) ? createReminderSupabase(userId, input) : createReminderLocal(userId, input);
}

export async function getUpcomingReminders(userId: string): Promise<Reminder[]> {
  return shouldUseSupabase(userId) ? getUpcomingRemindersSupabase(userId) : getUpcomingRemindersLocal(userId);
}

export async function updateReminder(userId: string, reminderId: string, input: UpdateReminderInput): Promise<Reminder | null> {
  return shouldUseSupabase(userId)
    ? updateReminderSupabase(userId, reminderId, input)
    : updateReminderLocal(userId, reminderId, input);
}

export async function snoozeReminder(userId: string, reminderId: string, input: SnoozeReminderInput): Promise<Reminder | null> {
  return shouldUseSupabase(userId)
    ? snoozeReminderSupabase(userId, reminderId, input)
    : snoozeReminderLocal(userId, reminderId, input);
}

export async function archiveReminder(
  userId: string,
  reminderId: string,
  input: ArchiveReminderInput
): Promise<Reminder | null> {
  return shouldUseSupabase(userId)
    ? archiveReminderSupabase(userId, reminderId, input)
    : archiveReminderLocal(userId, reminderId, input);
}

export async function getArchivedReminders(userId: string, query: ArchiveQuery): Promise<ArchiveQueryResult> {
  return shouldUseSupabase(userId) ? getArchivedRemindersSupabase(userId, query) : getArchivedRemindersLocal(userId, query);
}

export async function getProfile(userId: string): Promise<Profile> {
  return shouldUseSupabase(userId) ? getProfileSupabase(userId) : getProfileLocal(userId);
}

export async function updateSettings(userId: string, input: UpdateSettingsInput): Promise<Profile> {
  return shouldUseSupabase(userId) ? updateSettingsSupabase(userId, input) : updateSettingsLocal(userId, input);
}

export async function autoArchiveForUser(userId: string): Promise<number> {
  return shouldUseSupabase(userId) ? autoArchiveForUserSupabase(userId) : autoArchiveForUserLocal(userId);
}

export async function autoArchiveAllUsers(): Promise<{ usersProcessed: number; archived: number }> {
  return getSupabaseServiceClient() ? autoArchiveAllUsersSupabase() : autoArchiveAllUsersLocal();
}
