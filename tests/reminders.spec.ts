import { describe, expect, it } from "vitest";
import {
  archiveReminder,
  createReminder,
  getNotes,
  updateReminder
} from "@/lib/repositories/reminders";

describe("note editing", () => {
  it("persists the feed alongside each note", async () => {
    const userId = "note-feed-test-user";
    const standard = await createReminder(userId, { note: "A note", attachments: [] });
    const idea = await createReminder(userId, { note: "An idea", feed: "ideas", attachments: [] });
    await updateReminder(userId, idea.id, { note: "An edited idea" });
    const notes = await getNotes(userId);
    expect(notes.find((note) => note.id === standard.id)?.feed).toBe("all");
    expect(notes.find((note) => note.id === idea.id)).toMatchObject({ feed: "ideas", note: "An edited idea" });
  });

  it("moves a note between feeds without changing its content or archive status", async () => {
    const userId = "note-move-test-user";
    const note = await createReminder(userId, { note: "Keep this", attachments: [] });
    await updateReminder(userId, note.id, { checked: true });
    await archiveReminder(userId, note.id, { reason: "manual" });
    const moved = await updateReminder(userId, note.id, { feed: "ideas" });
    expect(moved).toMatchObject({ id: note.id, feed: "ideas", note: "Keep this", checked: true, status: "archived" });
    expect((await getNotes(userId)).find((item) => item.id === note.id)?.feed).toBe("ideas");
    const movedBack = await updateReminder(userId, note.id, { feed: "all" });
    expect(movedBack).toMatchObject({ feed: "all", status: "archived" });
    expect(await updateReminder("another-user", note.id, { feed: "ideas" })).toBeNull();
  });

  it("persists edited text on the existing reminder", async () => {
    const userId = "note-edit-test-user";
    const created = await createReminder(userId, {
      note: "Before",
      remindAt: null,
      attachments: []
    });

    const updated = await updateReminder(userId, created.id, { note: "After" });
    const saved = (await getNotes(userId)).find((note) => note.id === created.id);

    expect(updated?.id).toBe(created.id);
    expect(updated?.note).toBe("After");
    expect(saved?.note).toBe("After");
  });
});
