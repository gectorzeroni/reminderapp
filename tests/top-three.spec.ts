import { beforeEach, describe, expect, it } from "vitest";
import { createReminder, deleteNote } from "@/lib/repositories/reminders";
import { addTopThree, getTopThree, removeTopThree, reorderTopThree } from "@/lib/repositories/top-three";

const owner = "top-three-test-owner";
async function note(userId = owner) {
  return createReminder(userId, { note: "Important", remindAt: null, attachments: [] });
}
describe("Top 3", () => {
  beforeEach(() => global.__laterTopThree?.clear());
  it("keeps at most three notes, is idempotent, and permits reuse after removal", async () => {
    const notes = await Promise.all([note(), note(), note(), note()]);
    for (const item of notes.slice(0, 3)) expect(await addTopThree(owner, item.id)).toBe("added");
    expect(await addTopThree(owner, notes[0].id)).toBe("already_added");
    expect(await addTopThree(owner, notes[3].id)).toBe("full");
    await removeTopThree(owner, notes[1].id);
    expect(await addTopThree(owner, notes[3].id)).toBe("added");
    expect(await getTopThree(owner)).toEqual([notes[0].id, notes[2].id, notes[3].id]);
  });
  it("rejects another user's note and clears deleted notes", async () => {
    const own = await note();
    const other = await note("top-three-other-owner");
    expect(await addTopThree(owner, other.id)).toBe("not_found");
    await addTopThree(owner, own.id);
    await removeTopThree("top-three-other-owner", own.id);
    expect(await getTopThree(owner)).toEqual([own.id]);
    await deleteNote(owner, own.id);
    expect(await getTopThree(owner)).toEqual([]);
  });
  it("keeps the three-note limit for simultaneous additions", async () => {
    const notes = await Promise.all([note(), note(), note(), note()]);
    const results = await Promise.all(notes.map((item) => addTopThree(owner, item.id)));
    expect(results.filter((result) => result === "added")).toHaveLength(3);
    expect(results.filter((result) => result === "full")).toHaveLength(1);
    expect(await getTopThree(owner)).toHaveLength(3);
  });
  it("reorders only the current user's exact Top 3 selection", async () => {
    const a = await note(); const b = await note(); const other = await note();
    await addTopThree(owner, a.id); await addTopThree(owner, b.id);
    expect(await reorderTopThree(owner, [b.id, a.id])).toBe(true);
    expect(await getTopThree(owner)).toEqual([b.id, a.id]);
    expect(await reorderTopThree(owner, [b.id, other.id])).toBe(false);
    expect(await reorderTopThree(owner, [b.id, b.id])).toBe(false);
  });

});
