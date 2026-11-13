import type { Reminder } from "@/lib/types";

export type TimelineGroup = {
  key: string;
  label: string;
  notes: Reminder[];
};

export function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function groupNotesByPeriod(notes: Reminder[], now: Date): TimelineGroup[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const threeDaysAgo = new Date(today);
  threeDaysAgo.setDate(today.getDate() - 3);
  const fourteenDaysAgo = new Date(today);
  fourteenDaysAgo.setDate(today.getDate() - 14);
  const groups = new Map<string, TimelineGroup>();

  for (const note of notes) {
    const date = new Date(note.createdAt);
    let key: string;
    let label: string;
    if (date >= today) {
      key = "today";
      label = "Today";
    } else if (date >= threeDaysAgo) {
      key = "last-3-days";
      label = "3 days ago";
    } else if (date >= fourteenDaysAgo) {
      key = "last-14-days";
      label = "14 days ago";
    } else {
      key = `month-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);
    }
    const group = groups.get(key);
    if (group) group.notes.push(note);
    else groups.set(key, { key, label, notes: [note] });
  }

  if (!groups.has("today")) groups.set("today", { key: "today", label: "Today", notes: [] });
  const months = [...groups.values()].filter((group) => group.key.startsWith("month-")).sort((a, b) => a.key.localeCompare(b.key));
  return [...months, ...["last-14-days", "last-3-days", "today"].flatMap((key) => groups.has(key) ? [groups.get(key)!] : [])];
}
