import type { AutoArchivePolicy } from "@/lib/types";

export const DEMO_USER_ID = "demo-user";
export const MAX_ATTACHMENTS = 10;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const DEFAULT_PAGE_SIZE = 20;
export const AUTO_ARCHIVE_POLICIES = ["never", "24h", "7d"] as const satisfies readonly AutoArchivePolicy[];
