"use client";

import { play } from "cuelume";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Check, LogOut, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Toaster, toast } from "sonner";
import { parseStoredNote } from "@/lib/note";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Reminder } from "@/lib/types";

type WeekGroup = {
  key: string;
  label: string;
  shortLabel: string;
  notes: Reminder[];
};

type NoteContextMenu = {
  noteId: string;
  x: number;
  y: number;
};

type PendingDeletion = {
  note: Reminder;
  originalIndex: number;
  timerId: number;
};

type LongPressGesture = {
  noteId: string;
  pointerId: number;
  timerId: number;
  x: number;
  y: number;
};

const dayFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric"
});

function startOfWeek(value: string) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);
  return date;
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatWeekLabel(start: Date) {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const startLabel = dayFormatter.format(start);
  const endLabel = dayFormatter.format(end);
  return `${startLabel} – ${endLabel}, ${end.getFullYear()}`;
}

function groupNotesByWeek(notes: Reminder[]): WeekGroup[] {
  const groups = new Map<string, WeekGroup>();

  for (const note of notes) {
    const weekStart = startOfWeek(note.createdAt);
    const key = localDateKey(weekStart);
    const existing = groups.get(key);
    if (existing) {
      existing.notes.push(note);
      continue;
    }

    groups.set(key, {
      key,
      label: formatWeekLabel(weekStart),
      shortLabel: dayFormatter.format(weekStart),
      notes: [note]
    });
  }

  return Array.from(groups.values());
}

function sortChronologically(notes: Reminder[]) {
  return [...notes].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

const OPTIMISTIC_NOTE_PREFIX = "optimistic:";
const DELETE_TOAST_DURATION = 4000;

function deleteToastId(noteId: string) {
  return `note-deleted:${noteId}`;
}

function createOptimisticNote(text: string): Reminder {
  const timestamp = new Date().toISOString();
  return {
    id: `${OPTIMISTIC_NOTE_PREFIX}${crypto.randomUUID()}`,
    userId: "optimistic",
    note: text,
    pinned: false,
    checked: false,
    status: "upcoming",
    archiveReason: null,
    remindAt: null,
    archivedAt: null,
    completedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    attachments: []
  };
}

function isOptimisticNote(note: Reminder) {
  return note.id.startsWith(OPTIMISTIC_NOTE_PREFIX);
}

function resizeNoteEditor(element: HTMLTextAreaElement) {
  element.style.height = "0px";
  element.style.height = `${element.scrollHeight}px`;
}

export function NotesApp() {
  const router = useRouter();
  const [notes, setNotes] = useState<Reminder[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeWeek, setActiveWeek] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<NoteContextMenu | null>(null);
  const [checkingNoteIds, setCheckingNoteIds] = useState<Set<string>>(() => new Set());
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");
  const [savingNoteIds, setSavingNoteIds] = useState<Set<string>>(() => new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const longPressRef = useRef<LongPressGesture | null>(null);
  const noteRenderKeysRef = useRef(new Map<string, string>());
  const pendingDeletionRef = useRef<PendingDeletion | null>(null);
  const shouldScrollToLatestRef = useRef(true);
  const scrollBehaviorRef = useRef<ScrollBehavior>("auto");

  const weekGroups = useMemo(() => groupNotesByWeek(notes), [notes]);

  function syncActiveWeek() {
    const scroller = scrollRef.current;
    if (!scroller || weekGroups.length === 0) return;

    const scrollerRect = scroller.getBoundingClientRect();
    const marker = scrollerRect.top + Math.min(160, scrollerRect.height * 0.32);
    let next = weekGroups[0]?.key ?? null;

    for (const group of weekGroups) {
      const section = document.getElementById(`week-${group.key}`);
      if (section && section.getBoundingClientRect().top <= marker) next = group.key;
    }

    if (scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 8) {
      next = weekGroups.at(-1)?.key ?? next;
    }

    setActiveWeek((current) => (current === next ? current : next));
  }

  useEffect(() => {
    let cancelled = false;

    async function loadNotes() {
      try {
        const response = await fetch("/api/notes", { cache: "no-store" });
        const body = (await response.json()) as { notes?: Reminder[]; error?: string };
        if (!response.ok) throw new Error(body.error || "Could not load notes");
        if (!cancelled) setNotes(sortChronologically(body.notes ?? []));
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load notes");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadNotes();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel("notes-sync")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "reminders" },
        (payload) => {
          const changedNote = payload.new as {
            id?: unknown;
            checked?: unknown;
            note?: unknown;
            updated_at?: unknown;
          };
          if (typeof changedNote.id !== "string") {
            return;
          }

          setNotes((current) =>
            current.map((note) => {
              if (note.id !== changedNote.id) return note;
              const nextNote = { ...note };
              if (typeof changedNote.checked === "boolean") {
                nextNote.checked = changedNote.checked;
              }
              if (typeof changedNote.note === "string" || changedNote.note === null) {
                nextNote.note = changedNote.note;
              }
              if (typeof changedNote.updated_at === "string") {
                nextNote.updatedAt = changedNote.updated_at;
              }
              return nextNote;
            })
          );
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (loading || !shouldScrollToLatestRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      const scroller = scrollRef.current;
      if (!scroller) return;
      scroller.scrollTo({ top: scroller.scrollHeight, behavior: scrollBehaviorRef.current });
      shouldScrollToLatestRef.current = false;
      scrollBehaviorRef.current = "auto";
      window.requestAnimationFrame(syncActiveWeek);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loading, notes.length]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
  }, [draft]);

  useEffect(() => {
    if (!contextMenu) return;

    const focusFrame = window.requestAnimationFrame(() => {
      contextMenuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    });
    function closeOnPointerDown(event: PointerEvent) {
      if (!contextMenuRef.current?.contains(event.target as Node)) setContextMenu(null);
    }
    function closeOnKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setContextMenu(null);
    }
    function closeMenu() {
      setContextMenu(null);
    }

    window.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("keydown", closeOnKeyDown);
    window.addEventListener("resize", closeMenu);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("keydown", closeOnKeyDown);
      window.removeEventListener("resize", closeMenu);
    };
  }, [contextMenu]);

  useEffect(
    () => () => {
      const longPress = longPressRef.current;
      if (longPress) window.clearTimeout(longPress.timerId);
      const pending = pendingDeletionRef.current;
      if (!pending) return;
      window.clearTimeout(pending.timerId);
      void fetch(`/api/notes/${pending.note.id}`, { method: "DELETE", keepalive: true });
    },
    []
  );

  async function createNote(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text) return;

    const optimisticNote = createOptimisticNote(text);
    shouldScrollToLatestRef.current = true;
    scrollBehaviorRef.current = "auto";
    setNotes((current) => [...current, optimisticNote]);
    setDraft("");
    setError(null);
    textareaRef.current?.focus();

    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text })
      });
      const body = (await response.json()) as { note?: Reminder; error?: string };
      if (!response.ok || !body.note) throw new Error(body.error || "Could not save note");

      const savedNote = body.note;
      noteRenderKeysRef.current.set(savedNote.id, optimisticNote.id);
      setNotes((current) =>
        sortChronologically(
          current.map((note) => (note.id === optimisticNote.id ? savedNote : note))
        )
      );
    } catch (saveError) {
      setNotes((current) => current.filter((note) => note.id !== optimisticNote.id));
      setDraft((current) => current || text);
      setError(saveError instanceof Error ? saveError.message : "Could not save note");
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void createNote();
  }

  function beginEditingNote(note: Reminder) {
    if (isOptimisticNote(note) || savingNoteIds.has(note.id)) return;
    cancelLongPress();
    setContextMenu(null);
    setError(null);
    setEditingNoteId(note.id);
    setEditingNoteText(parseStoredNote(note.note).plainText);
  }

  async function finishEditingNote(note: Reminder, nextValue: string) {
    if (editingNoteId !== note.id) return;

    const nextText = nextValue.trim();
    const previousText = note.note;
    const previousPlainText = parseStoredNote(previousText).plainText.trim();
    setEditingNoteId(null);
    setEditingNoteText("");

    if (!nextText) {
      setError("Note cannot be empty");
      return;
    }
    if (nextText === previousPlainText) return;

    setError(null);
    setSavingNoteIds((current) => new Set(current).add(note.id));
    setNotes((current) =>
      current.map((item) => (item.id === note.id ? { ...item, note: nextText } : item))
    );

    try {
      const response = await fetch(`/api/notes/${note.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: nextText })
      });
      const body = (await response.json()) as { note?: Reminder; error?: string };
      if (!response.ok || !body.note) {
        throw new Error(body.error || "Could not update note");
      }

      const savedNote = body.note;
      setNotes((current) =>
        current.map((item) => (item.id === note.id ? savedNote : item))
      );
    } catch (updateError) {
      setNotes((current) =>
        current.map((item) =>
          item.id === note.id ? { ...item, note: previousText } : item
        )
      );
      setError(updateError instanceof Error ? updateError.message : "Could not update note");
    } finally {
      setSavingNoteIds((current) => {
        const next = new Set(current);
        next.delete(note.id);
        return next;
      });
    }
  }

  function jumpToWeek(key: string) {
    setActiveWeek(key);
    document.getElementById(`week-${key}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  async function toggleNoteChecked(note: Reminder) {
    const previousChecked = note.checked;
    const nextChecked = !previousChecked;
    if (nextChecked) play("success");

    setError(null);
    setCheckingNoteIds((current) => new Set(current).add(note.id));
    setNotes((current) =>
      current.map((item) => (item.id === note.id ? { ...item, checked: nextChecked } : item))
    );

    try {
      const response = await fetch(`/api/notes/${note.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ checked: nextChecked })
      });
      const body = (await response.json()) as { note?: Reminder; error?: string };
      if (!response.ok || !body.note) {
        throw new Error(body.error || "Could not update note");
      }

      const savedNote = body.note;
      setNotes((current) =>
        current.map((item) => (item.id === note.id ? savedNote : item))
      );
    } catch (updateError) {
      setNotes((current) =>
        current.map((item) =>
          item.id === note.id ? { ...item, checked: previousChecked } : item
        )
      );
      setError(updateError instanceof Error ? updateError.message : "Could not update note");
    } finally {
      setCheckingNoteIds((current) => {
        const next = new Set(current);
        next.delete(note.id);
        return next;
      });
    }
  }

  function showNoteMenu(noteId: string, x: number, y: number) {
    const menuWidth = 176;
    const menuHeight = 60;
    const gutter = 10;
    setContextMenu({
      noteId,
      x: Math.max(gutter, Math.min(x, window.innerWidth - menuWidth - gutter)),
      y: Math.max(gutter, Math.min(y, window.innerHeight - menuHeight - gutter))
    });
  }

  function openNoteMenu(event: ReactMouseEvent<HTMLElement>, noteId: string) {
    event.preventDefault();
    showNoteMenu(noteId, event.clientX, event.clientY);
  }

  function openNoteMenuFromKeyboard(event: KeyboardEvent<HTMLElement>, noteId: string) {
    const isContextMenuKey = event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
    if (!isContextMenuKey) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    showNoteMenu(noteId, rect.right - 176, rect.top + 16);
  }

  function cancelLongPress(pointerId?: number) {
    const gesture = longPressRef.current;
    if (!gesture || (pointerId != null && gesture.pointerId !== pointerId)) return;
    window.clearTimeout(gesture.timerId);
    longPressRef.current = null;
  }

  function startLongPress(event: ReactPointerEvent<HTMLElement>, noteId: string) {
    if (event.pointerType !== "touch") return;
    cancelLongPress();
    const gesture: LongPressGesture = {
      noteId,
      pointerId: event.pointerId,
      timerId: 0,
      x: event.clientX,
      y: event.clientY
    };
    gesture.timerId = window.setTimeout(() => {
      if (longPressRef.current?.pointerId !== gesture.pointerId) return;
      longPressRef.current = null;
      showNoteMenu(gesture.noteId, gesture.x, gesture.y);
    }, 550);
    longPressRef.current = gesture;
  }

  function moveLongPress(event: ReactPointerEvent<HTMLElement>) {
    const gesture = longPressRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 10) {
      cancelLongPress(event.pointerId);
    }
  }

  async function persistDeletion(pending: PendingDeletion) {
    try {
      const response = await fetch(`/api/notes/${pending.note.id}`, { method: "DELETE" });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not delete note");
    } catch (deleteError) {
      setNotes((current) => {
        if (current.some((note) => note.id === pending.note.id)) return current;
        return sortChronologically([...current, pending.note]);
      });
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete note");
    }
  }

  function beginDelete(note: Reminder) {
    const previous = pendingDeletionRef.current;
    if (previous) {
      window.clearTimeout(previous.timerId);
      pendingDeletionRef.current = null;
      toast.dismiss(deleteToastId(previous.note.id));
      void persistDeletion(previous);
    }

    const originalIndex = notes.findIndex((item) => item.id === note.id);
    const pending: PendingDeletion = {
      note,
      originalIndex: Math.max(0, originalIndex),
      timerId: 0
    };
    pending.timerId = window.setTimeout(() => {
      if (pendingDeletionRef.current?.note.id !== note.id) return;
      pendingDeletionRef.current = null;
      toast.dismiss(deleteToastId(note.id));
      void persistDeletion(pending);
    }, DELETE_TOAST_DURATION);

    pendingDeletionRef.current = pending;
    setNotes((current) => current.filter((item) => item.id !== note.id));
    setContextMenu(null);
    setError(null);

    toast("Note deleted", {
      id: deleteToastId(note.id),
      duration: DELETE_TOAST_DURATION,
      dismissible: false,
      action: {
        label: "Undo",
        onClick: () => undoDelete(note.id)
      }
    });
  }

  function undoDelete(noteId: string) {
    const pending = pendingDeletionRef.current;
    if (!pending || pending.note.id !== noteId) return;
    window.clearTimeout(pending.timerId);
    pendingDeletionRef.current = null;
    toast.dismiss(deleteToastId(noteId));
    setNotes((current) => {
      if (current.some((note) => note.id === pending.note.id)) return current;
      const next = [...current];
      next.splice(Math.min(pending.originalIndex, next.length), 0, pending.note);
      return sortChronologically(next);
    });
  }

  async function logOut() {
    const supabase = getSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
    router.push("/auth/sign-in");
    router.refresh();
  }

  return (
    <main className="notes-app">
      <header className="notes-header">
        <div className="notes-header__inner">
          <div className="notes-brand">
            <span className="notes-brand__wordmark">Later™</span>
          </div>
          <button type="button" className="notes-logout" aria-label="Log out" onClick={logOut}>
            <LogOut size={15} strokeWidth={1.8} aria-hidden="true" />
            <span>Log out</span>
          </button>
        </div>
      </header>

      <div className="notes-stage">
        <section
          ref={scrollRef}
          className="notes-scroll"
          aria-label="Your notes"
          aria-busy={loading}
          onScroll={() => {
            cancelLongPress();
            syncActiveWeek();
            setContextMenu(null);
          }}
        >
          <div className="notes-list">
            <AnimatePresence initial={false} mode="popLayout">
              {loading ? (
                <motion.div key="loading" layout="position" className="notes-state" role="status">
                  <span className="notes-state__pulse" aria-hidden="true" />
                  Loading notes
                </motion.div>
              ) : notes.length === 0 ? (
                <motion.div key="empty" layout="position" className="notes-state notes-state--empty">
                  <p>Your timeline is empty.</p>
                  <span>Write your first note below.</span>
                </motion.div>
              ) : (
                weekGroups.map((group) => (
                  <motion.section
                    key={group.key}
                    id={`week-${group.key}`}
                    data-week-key={group.key}
                    layout="position"
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8, transition: { duration: 0.14, ease: "easeIn" } }}
                    transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                    className="notes-week"
                    aria-labelledby={`week-label-${group.key}`}
                  >
                    <motion.div
                      layout="position"
                      className="notes-week__heading"
                      transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                    >
                      <h2 id={`week-label-${group.key}`}>{group.label}</h2>
                    </motion.div>
                    <motion.div
                      layout="position"
                      className="notes-week__items"
                      transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                    >
                      <AnimatePresence initial={false} mode="popLayout">
                        {group.notes.map((note) => {
                          const text = parseStoredNote(note.note).plainText;
                          const isSaving = isOptimisticNote(note);
                          const isEditing = editingNoteId === note.id;
                          const isSavingEdit = savingNoteIds.has(note.id);
                          const isChecked = note.checked;
                          const isChecking = checkingNoteIds.has(note.id);
                          return (
                            <motion.article
                              key={noteRenderKeysRef.current.get(note.id) ?? note.id}
                              layout
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -8, transition: { duration: 0.14, ease: "easeIn" } }}
                              transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                              className={`note-row ${isEditing ? "is-editing" : ""} ${contextMenu?.noteId === note.id ? "has-open-menu" : ""}`}
                              tabIndex={isSaving || isEditing ? -1 : 0}
                              aria-label={isSaving || isSavingEdit ? "Saving note" : undefined}
                              aria-busy={isSaving || isSavingEdit}
                              onContextMenu={isSaving || isEditing ? undefined : (event) => openNoteMenu(event, note.id)}
                              onKeyDown={isSaving || isEditing ? undefined : (event) => openNoteMenuFromKeyboard(event, note.id)}
                              onPointerDown={isSaving || isEditing ? undefined : (event) => startLongPress(event, note.id)}
                              onPointerMove={moveLongPress}
                              onPointerUp={(event) => cancelLongPress(event.pointerId)}
                              onPointerCancel={(event) => cancelLongPress(event.pointerId)}
                              onPointerLeave={(event) => cancelLongPress(event.pointerId)}
                            >
                              {isEditing ? (
                                <textarea
                                  autoFocus
                                  className="note-row__editor"
                                  value={editingNoteText}
                                  maxLength={5000}
                                  aria-label="Edit note"
                                  rows={1}
                                  onChange={(event) => setEditingNoteText(event.target.value)}
                                  onInput={(event) => resizeNoteEditor(event.currentTarget)}
                                  onFocus={(event) => {
                                    resizeNoteEditor(event.currentTarget);
                                    const end = event.currentTarget.value.length;
                                    event.currentTarget.setSelectionRange(end, end);
                                  }}
                                  onBlur={(event) => void finishEditingNote(note, event.currentTarget.value)}
                                  onContextMenu={(event) => event.stopPropagation()}
                                  onPointerDown={(event) => {
                                    event.stopPropagation();
                                    cancelLongPress();
                                  }}
                                />
                              ) : (
                                <button
                                  type="button"
                                  className="note-row__text"
                                  disabled={isSaving || isSavingEdit}
                                  aria-label={`Edit note: ${text}`}
                                  onClick={() => beginEditingNote(note)}
                                  onContextMenu={(event) => event.stopPropagation()}
                                  onPointerDown={(event) => {
                                    event.stopPropagation();
                                    cancelLongPress();
                                  }}
                                >
                                  {text}
                                </button>
                              )}
                              <button
                                type="button"
                                className={`note-check ${isChecked ? "is-checked" : ""}`}
                                aria-label={isChecked ? "Uncheck note" : "Check note"}
                                aria-pressed={isChecked}
                                disabled={isSaving || isChecking}
                                onClick={() => void toggleNoteChecked(note)}
                                onContextMenu={(event) => event.stopPropagation()}
                                onPointerDown={(event) => {
                                  event.stopPropagation();
                                  cancelLongPress();
                                }}
                              >
                                <span className="note-check__circle" aria-hidden="true">
                                  <AnimatePresence initial={false}>
                                    {isChecked ? (
                                      <motion.span
                                        key="check"
                                        className="note-check__icon"
                                        initial={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
                                        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                                        exit={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
                                        transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                                      >
                                        <Check size={16} strokeWidth={2.4} />
                                      </motion.span>
                                    ) : null}
                                  </AnimatePresence>
                                </span>
                              </button>
                              <span className="sr-only">Right-click or press and hold for note actions.</span>
                            </motion.article>
                          );
                        })}
                      </AnimatePresence>
                    </motion.div>
                  </motion.section>
                ))
              )}
            </AnimatePresence>
          </div>
        </section>

        {weekGroups.length > 0 ? (
          <nav className="timeline-rail" aria-label="Jump to week">
            <span className="timeline-rail__line" aria-hidden="true" />
            <div className="timeline-rail__ticks">
              {weekGroups.map((group) => (
                <button
                  key={group.key}
                  type="button"
                  className={`timeline-tick ${activeWeek === group.key ? "is-active" : ""}`}
                  aria-label={`Jump to week of ${group.label}`}
                  aria-current={activeWeek === group.key ? "date" : undefined}
                  onClick={() => jumpToWeek(group.key)}
                >
                  <span className="timeline-tick__mark" aria-hidden="true" />
                  <span className="timeline-tick__label" aria-hidden="true">
                    <strong>{group.label}</strong>
                  </span>
                </button>
              ))}
            </div>
          </nav>
        ) : null}
      </div>

      <AnimatePresence initial={false}>
        {contextMenu ? (
          <motion.div
            ref={contextMenuRef}
            role="menu"
            aria-label="Note actions"
            className="note-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -3, scale: 0.98 }}
            transition={{ type: "spring", duration: 0.22, bounce: 0 }}
            onContextMenu={(event) => event.preventDefault()}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const note = notes.find((item) => item.id === contextMenu.noteId);
                if (note) beginDelete(note);
              }}
            >
              <Trash2 size={16} strokeWidth={1.8} aria-hidden="true" />
              Delete note
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <Toaster
        position="bottom-right"
        offset={{ bottom: 108 }}
        mobileOffset={{ right: 16, bottom: 104 }}
        visibleToasts={1}
        toastOptions={{
          duration: DELETE_TOAST_DURATION,
          unstyled: true,
          classNames: {
            toast: "note-delete-toast",
            actionButton: "note-delete-toast__action"
          }
        }}
        style={{ "--width": "244px" } as CSSProperties}
      />

      <footer className="notes-composer-area">
        <form className="notes-composer" onSubmit={createNote}>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            rows={1}
            maxLength={5000}
            placeholder="Write a note…"
            aria-label="Write a note"
          />
          <button
            type="submit"
            className="notes-send"
            disabled={!draft.trim()}
            aria-label="Add note"
          >
            <ArrowUp size={18} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </form>
        {error ? (
          <div className="notes-composer__meta">
            <span className="is-visible" role="status">
              {error}
            </span>
          </div>
        ) : null}
      </footer>
    </main>
  );
}
