export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end?: string;
  allDay: boolean;
  url?: string;
  account: string;
};

export function calendarEventEndTime(event: Pick<CalendarEvent, "end" | "allDay">): number | null {
  if (!event.end) return null;
  if (event.allDay) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(event.end);
    if (!match) return null;
    const [, year, month, day] = match.map(Number);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date.getTime();
  }
  const timestamp = Date.parse(event.end);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function hasCalendarEventEnded(event: Pick<CalendarEvent, "end" | "allDay">, now: number): boolean {
  const endTime = calendarEventEndTime(event);
  return endTime !== null && endTime <= now;
}
