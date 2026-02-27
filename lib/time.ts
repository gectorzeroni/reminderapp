import type { AutoArchivePolicy, Reminder, ReminderWithComputed } from "@/lib/types";

export function computeReminderState(reminder: Reminder, now = new Date()): ReminderWithComputed {
  if (!reminder.remindAt) {
    return {
      ...reminder,
      isDue: false,
      isOverdue: false
    };
  }
  const remindAt = new Date(reminder.remindAt);
  const diffMs = remindAt.getTime() - now.getTime();
  const isDue = diffMs <= 0 && diffMs > -60_000 && reminder.status !== "archived";
  const isOverdue = diffMs <= 0 && reminder.status !== "archived";

  return {
    ...reminder,
    isDue,
    isOverdue
  };
}

export function getAutoArchiveThresholdMs(policy: AutoArchivePolicy): number | null {
  if (policy === "24h") return 24 * 60 * 60 * 1000;
  if (policy === "7d") return 7 * 24 * 60 * 60 * 1000;
  return null;
}

export function shouldAutoArchive(reminder: Reminder, policy: AutoArchivePolicy, now = new Date()): boolean {
  if (reminder.status === "archived") return false;
  if (!reminder.remindAt) return false;
  const threshold = getAutoArchiveThresholdMs(policy);
  if (threshold == null) return false;
  const remindAt = new Date(reminder.remindAt).getTime();
  return now.getTime() >= remindAt + threshold;
}

export function addSnooze(baseISO: string, preset?: "10m" | "1h" | "tomorrow", minutes?: number): string {
  const base = new Date(baseISO);
  if (preset === "10m") {
    base.setMinutes(base.getMinutes() + 10);
    return base.toISOString();
  }
  if (preset === "1h") {
    base.setHours(base.getHours() + 1);
    return base.toISOString();
  }
  if (preset === "tomorrow") {
    base.setDate(base.getDate() + 1);
    base.setHours(9, 0, 0, 0);
    return base.toISOString();
  }
  base.setMinutes(base.getMinutes() + (minutes ?? 10));
  return base.toISOString();
}

export function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDatetimeLocalValue(value: string): string {
  return new Date(value).toISOString();
}
