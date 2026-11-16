import { describe, expect, it } from "vitest";
import { reorderGroup } from "@/lib/note-order";
import { groupNotesByPeriod } from "@/lib/timeline";
import { createReminder, getNotes, reorderNotes } from "@/lib/repositories/reminders";
import type { Reminder } from "@/lib/types";

function item(id: string, day: number): Reminder {
  return { id, createdAt: new Date(2026, 10, day, 12).toISOString() } as Reminder;
}
describe("note ordering", () => {
  it("reorders within the group and retains the timestamps", () => {
    const notes = [item("a", 10), item("b", 11), item("c", 12)];
    const positions = reorderGroup(notes, "c", "a", false)!;
    const byId = new Map(positions.map((position) => [position.id, position.position]));
    const reordered = notes.map((note) => ({ ...note, sortPosition: byId.get(note.id) }));
    expect(groupNotesByPeriod(reordered, new Date(2026, 10, 13))[0].notes.map((note) => note.id)).toEqual(["c", "a", "b"]);
    expect(reordered.map((note) => note.createdAt)).toEqual(notes.map((note) => note.createdAt));
    expect(reorderGroup(notes, "a", "a", false)).toBeNull();
  });
  it("saves the order and rejects notes from another feed or user", async () => {
    const make = (userId: string, feed: string) => createReminder(userId, { note: "Test", feed, remindAt: null, attachments: [] });
    const a = await make("order-owner", "all");
    const b = await make("order-owner", "all");
    const otherFeed = await make("order-owner", "ideas");
    const otherUser = await make("order-other", "all");
    expect(await reorderNotes("order-owner", [{ id: a.id, position: 2 }, { id: b.id, position: 1 }])).toBe(true);
    expect((await getNotes("order-owner")).find((note) => note.id === b.id)?.sortPosition).toBe(1);
    expect(await reorderNotes("order-owner", [{ id: a.id, position: 0 }, { id: otherFeed.id, position: 1 }])).toBe(false);
    expect(await reorderNotes("order-owner", [{ id: a.id, position: 0 }, { id: otherUser.id, position: 1 }])).toBe(false);
    expect(await reorderNotes("order-owner", [{ id: a.id, position: 0 }, { id: a.id, position: 1 }])).toBe(false);
  });
});
