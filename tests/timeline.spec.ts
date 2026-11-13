import { describe, expect, it } from "vitest";
import { groupNotesByPeriod } from "@/lib/timeline";
import type { Reminder } from "@/lib/types";

function note(id: string, year: number, month: number, day: number): Reminder {
  return { id, createdAt: new Date(year, month - 1, day, 12).toISOString() } as Reminder;
}

describe("timeline date groups", () => {
  it("groups calendar days without overlapping the 3-day and 14-day ranges", () => {
    const notes = [note("older", 2026, 10, 29), note("fourteen", 2026, 10, 30), note("four", 2026, 11, 9), note("three", 2026, 11, 10), note("yesterday", 2026, 11, 12), note("today", 2026, 11, 13)];
    const groups = groupNotesByPeriod(notes, new Date(2026, 10, 13, 16));
    expect(groups.map(({ label, notes: items }) => [label, items.map(({ id }) => id)])).toEqual([
      ["October 2026", ["older"]],
      ["14 days ago", ["fourteen", "four"]],
      ["3 days ago", ["three", "yesterday"]],
      ["Today", ["today"]]
    ]);
  });

  it("uses local calendar boundaries across the new year and always includes today", () => {
    const notes = [note("old", 2025, 12, 15), note("december", 2025, 12, 28), note("january", 2026, 1, 2)];
    const groups = groupNotesByPeriod(notes, new Date(2026, 0, 3));
    expect(groups.map(({ label, notes: items }) => [label, items.map(({ id }) => id)])).toEqual([
      ["December 2025", ["old"]], ["14 days ago", ["december"]], ["3 days ago", ["january"]], ["Today", []]
    ]);
  });
});
