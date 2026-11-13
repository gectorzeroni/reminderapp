import { describe, expect, it } from "vitest";
import { hasCalendarEventEnded } from "@/lib/calendar-events";

describe("calendar event completion", () => {
  it("marks a timed event as ended at its end time, not its start", () => {
    const event = { end: "2026-11-13T15:00:00Z", allDay: false };
    expect(hasCalendarEventEnded(event, Date.parse("2026-11-13T14:59:59Z"))).toBe(false);
    expect(hasCalendarEventEnded(event, Date.parse("2026-11-13T15:00:00Z"))).toBe(true);
  });

  it("treats the exclusive end of an all-day event as local midnight", () => {
    const event = { end: "2026-11-14", allDay: true };
    expect(hasCalendarEventEnded(event, new Date(2026, 10, 13, 23, 59).getTime())).toBe(false);
    expect(hasCalendarEventEnded(event, new Date(2026, 10, 14).getTime())).toBe(true);
  });

  it("does not check events with missing or invalid end times", () => {
    expect(hasCalendarEventEnded({ allDay: false }, Date.now())).toBe(false);
    expect(hasCalendarEventEnded({ end: "2026-02-30", allDay: true }, Date.now())).toBe(false);
  });
});
