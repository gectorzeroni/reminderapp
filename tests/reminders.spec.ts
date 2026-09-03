import { describe, expect, it } from "vitest";
import {
  createReminder,
  getNotes,
  updateReminder
} from "@/lib/repositories/reminders";

describe("note editing", () => {
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
