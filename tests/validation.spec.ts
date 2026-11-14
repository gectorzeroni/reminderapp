import { describe, expect, it } from "vitest";
import { createNoteSchema, updateNoteSchema } from "@/lib/validation";

describe("updateNoteSchema", () => {
  it("accepts note text and trims its outer whitespace", () => {
    expect(updateNoteSchema.parse({ note: "  Updated note  " })).toEqual({
      note: "Updated note"
    });
  });

  it("accepts checked-state updates", () => {
    expect(updateNoteSchema.parse({ checked: true })).toEqual({ checked: true });
  });

  it("accepts valid feed changes and rejects unknown feeds", () => {
    expect(updateNoteSchema.parse({ feed: "ideas" })).toEqual({ feed: "ideas" });
    expect(updateNoteSchema.parse({ feed: "all" })).toEqual({ feed: "all" });
    expect(updateNoteSchema.safeParse({ feed: "other" }).success).toBe(false);
  });

  it("rejects empty notes and empty updates", () => {
    expect(updateNoteSchema.safeParse({ note: "   " }).success).toBe(false);
    expect(updateNoteSchema.safeParse({}).success).toBe(false);
  });
});


describe("createNoteSchema feed", () => {
  it("defaults existing clients to All and accepts Ideas", () => {
    expect(createNoteSchema.parse({ text: "Note" }).feed).toBe("all");
    expect(createNoteSchema.parse({ text: "Idea", feed: "ideas" }).feed).toBe("ideas");
    expect(createNoteSchema.safeParse({ text: "Note", feed: "other" }).success).toBe(false);
  });
});
