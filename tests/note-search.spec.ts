import { describe, expect, it } from "vitest";
import { noteMatchesSearch, parseSearchDate, searchTerms } from "@/lib/note-search";
import type { Reminder } from "@/lib/types";

const note = { note: "Buy chocolate cake for Alex", createdAt: new Date(2026, 8, 13, 12).toISOString() } as Reminder;

describe("note search", () => {
  it("matches case-insensitive keywords within notes and requires all keywords", () => {
    expect(noteMatchesSearch(note, "CAKE chocolate")).toBe(true);
    expect(noteMatchesSearch(note, "cake bread")).toBe(false);
    expect(searchTerms("  Cake  Alex ")).toEqual(["cake", "alex"]);
  });

  it("matches dates in local time, with or without a year", () => {
    expect(noteMatchesSearch(note, "September 13")).toBe(true);
    expect(noteMatchesSearch(note, "September 13th")).toBe(true);
    expect(noteMatchesSearch(note, "13th September 2026")).toBe(true);
    expect(noteMatchesSearch(note, "Sep 13, 2026")).toBe(true);
    expect(noteMatchesSearch(note, "9/13/2026")).toBe(true);
    expect(noteMatchesSearch(note, "2025-09-13")).toBe(false);
    expect(noteMatchesSearch(note, "September 14")).toBe(false);
    expect(parseSearchDate("Feb 30")).toBeNull();
    expect(parseSearchDate("2026-09-13")).toEqual({ year: 2026, month: 9, day: 13 });
  });

  it("finds entire months, partial month names, and years", () => {
    expect(noteMatchesSearch(note, "September")).toBe(true);
    expect(noteMatchesSearch(note, "sept")).toBe(true);
    expect(noteMatchesSearch(note, "September 2026")).toBe(true);
    expect(noteMatchesSearch(note, "2026-09")).toBe(true);
    expect(noteMatchesSearch(note, "2026")).toBe(true);
    expect(noteMatchesSearch(note, "February")).toBe(false);
    expect(noteMatchesSearch(note, "September 2025")).toBe(false);
  });

  it("also finds and highlights date words appearing in note text", () => {
    const textNote = { ...note, note: "Plan a trip in February" };
    expect(noteMatchesSearch(textNote, "February")).toBe(true);
    expect(searchTerms("February")).toEqual(["february"]);
    expect(parseSearchDate("Feb 29, 2025")).toBeNull();
    expect(parseSearchDate("Feb 29, 2024")).toEqual({ month: 2, day: 29, year: 2024 });
  });
});
