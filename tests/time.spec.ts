import { describe, expect, it } from "vitest";
import { computeReminderState, getAutoArchiveThresholdMs, shouldAutoArchive } from "@/lib/time";
import type { Reminder } from "@/lib/types";

function makeReminder(remindAt: string): Reminder {
  return {
    id: "r1",
    userId: "u1",
    note: "Test",
    status: "upcoming",
    archiveReason: null,
    remindAt,
    archivedAt: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    attachments: []
  };
}

describe("time helpers", () => {
  it("computes overdue state", () => {
    const now = new Date("2026-02-26T12:00:00.000Z");
    const reminder = makeReminder("2026-02-26T11:00:00.000Z");
    const computed = computeReminderState(reminder, now);
    expect(computed.isOverdue).toBe(true);
  });

  it("returns archive threshold by policy", () => {
    expect(getAutoArchiveThresholdMs("never")).toBeNull();
    expect(getAutoArchiveThresholdMs("24h")).toBe(86_400_000);
    expect(getAutoArchiveThresholdMs("7d")).toBe(604_800_000);
  });

  it("checks auto-archive eligibility", () => {
    const reminder = makeReminder("2026-02-25T10:00:00.000Z");
    const now = new Date("2026-02-26T10:30:00.000Z");
    expect(shouldAutoArchive(reminder, "24h", now)).toBe(true);
    expect(shouldAutoArchive(reminder, "never", now)).toBe(false);
  });
});
