"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { HandleIcon } from "@/components/icons";
import { forwardRef, type ComponentProps, type ReactNode } from "react";
import { motion } from "motion/react";

export type NoteDragData = { kind: "note"; noteId: string; source: "feed" | "top-three"; groupKey?: string };

export function NoteDragHandle({ noteId, source, groupKey, disabled = false }: { noteId: string; source: "feed" | "top-three"; groupKey?: string; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `${source}:${noteId}`, data: { kind: "note", noteId, source, groupKey } satisfies NoteDragData, disabled });
  return <button ref={setNodeRef} type="button" className={`note-drag-handle ${isDragging ? "is-dragging" : ""}`} aria-label="Drag note" {...attributes} {...listeners} onClick={(event) => { event.preventDefault(); event.stopPropagation(); }} onPointerDown={(event) => { event.stopPropagation(); listeners?.onPointerDown?.(event); }}><HandleIcon size={16} /></button>;
}

export const NoteDropRow = forwardRef<HTMLElement, ComponentProps<typeof motion.article> & { noteId: string; groupKey: string }>(function NoteDropRow({ noteId, groupKey, children, ...props }, forwardedRef) {
  const { setNodeRef, isOver } = useDroppable({ id: `row:${noteId}`, data: { kind: "row", noteId, groupKey } });
  return <motion.article {...props} ref={(element) => { setNodeRef(element); if (typeof forwardedRef === "function") forwardedRef(element); else if (forwardedRef) forwardedRef.current = element; }} data-drop-active={isOver || undefined}>{children}</motion.article>;
});

export function NoteDropTarget({ id, kind, children, className }: { id: string; kind: "feed" | "top-three"; children: ReactNode; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${kind}:${id}`, data: { kind, id } });
  return <div ref={setNodeRef} className={className} data-drop-active={isOver || undefined}>{children}</div>;
}

export function TopThreeDropRow({ noteId, children }: { noteId: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `top-three-row:${noteId}`, data: { kind: "top-three-row", noteId } });
  return <li ref={setNodeRef} data-drop-active={isOver || undefined}>{children}</li>;
}
