import { describe, expect, it } from "vitest";
import { updateNoteSchema } from "@/lib/validation";

describe("updateNoteSchema", () => {
  it("accepts note text and trims its outer whitespace", () => {
    expect(updateNoteSchema.parse({ note: "  Updated note  " })).toEqual({
      note: "Updated note"
    });
  });

  it("accepts checked-state updates", () => {
    expect(updateNoteSchema.parse({ checked: true })).toEqual({ checked: true });
  });

  it("rejects empty notes and empty updates", () => {
    expect(updateNoteSchema.safeParse({ note: "   " }).success).toBe(false);
    expect(updateNoteSchema.safeParse({}).success).toBe(false);
  });
});
