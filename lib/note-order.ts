import type { Reminder } from "@/lib/types";

export function reorderGroup(notes: Reminder[], fromId: string, toId: string, after: boolean): { id: string; position: number }[] | null {
  const from = notes.findIndex((note) => note.id === fromId);
  if (from < 0 || fromId === toId || !notes.some((note) => note.id === toId)) return null;
  const next = [...notes];
  const [dragged] = next.splice(from, 1);
  const target = next.findIndex((note) => note.id === toId);
  next.splice(target + (after ? 1 : 0), 0, dragged);
  if (next.every((note, index) => note.id === notes[index].id)) return null;
  const timestamps = notes.map((note) => new Date(note.createdAt).getTime());
  const earliest = Math.min(...timestamps);
  const latest = Math.max(...timestamps);
  const step = notes.length > 1 ? Math.max((latest - earliest) / (notes.length - 1), 1) : 1;
  return next.map((note, index) => ({ id: note.id, position: earliest + step * index }));
}
