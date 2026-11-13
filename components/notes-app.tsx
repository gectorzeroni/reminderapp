"use client";

import { play } from "cuelume";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, CalendarDays, Check, ChevronDown, LogOut, Trash2, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { Popover } from "radix-ui";
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
import { NoteComposerInput } from "@/components/note-composer-input";
import { NoteLinkText } from "@/components/note-link-text";
import { parseStoredNote } from "@/lib/note";
import { calendarEventEndTime, hasCalendarEventEnded, type CalendarEvent } from "@/lib/calendar-events";
import { groupNotesByPeriod, localDateKey } from "@/lib/timeline";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { NoteFeed, Reminder } from "@/lib/types";

type CalendarAccount = { id: string; email: string };

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

function sortChronologically(notes: Reminder[]) {
  return [...notes].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

function TodayEvents({ events }: { events: CalendarEvent[] }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let timer: number | undefined;
    function updateTime() {
      const current = Date.now();
      setNow(current);
      if (timer !== undefined) window.clearTimeout(timer);
      const nextEnd = events.map(calendarEventEndTime).filter((time): time is number => time !== null && time > current).sort((a, b) => a - b)[0];
      if (nextEnd !== undefined) timer = window.setTimeout(updateTime, Math.min(nextEnd - current + 1, 2_147_483_647));
    }
    updateTime();
    document.addEventListener("visibilitychange", updateTime);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", updateTime);
    };
  }, [events]);

  return (
    <div className="notes-today">
      <div className="notes-week__heading"><h2>Today · {dayFormatter.format(new Date())}</h2></div>
      {[...events].sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start)).map((event) => {
        const ended = hasCalendarEventEnded(event, now);
        return (
          <div className="calendar-event" key={event.id}>
            <CalendarDays size={17} aria-hidden="true" />
            <div>{event.url ? <a href={event.url} target="_blank" rel="noreferrer">{event.title}</a> : <span>{event.title}</span>}<small>{event.allDay ? "All day" : new Date(event.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {event.account}</small></div>
            {ended ? <span className="note-check is-checked calendar-event__check" role="img" aria-label="Event ended"><span className="note-check__circle"><Check size={16} strokeWidth={2.4} aria-hidden="true" /></span></span> : null}
          </div>
        );
      })}
    </div>
  );
}

const OPTIMISTIC_NOTE_PREFIX = "optimistic:";
const DELETE_TOAST_DURATION = 4000;

function deleteToastId(noteId: string) {
  return `note-deleted:${noteId}`;
}

function createOptimisticNote(text: string, feed: NoteFeed): Reminder {
  const timestamp = new Date().toISOString();
  return {
    id: `${OPTIMISTIC_NOTE_PREFIX}${crypto.randomUUID()}`,
    userId: "optimistic",
    feed,
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
  const [activeFeed, setActiveFeed] = useState<NoteFeed>("all");
  const [drafts, setDrafts] = useState<Record<NoteFeed, string>>({ all: "", ideas: "" });
  const [feedMenuOpen, setFeedMenuOpen] = useState(false);
  const draft = drafts[activeFeed];
  function setDraft(value: string) { setDrafts((current) => ({ ...current, [activeFeed]: value })); }
  function selectFeed(feed: NoteFeed) {
    if (feed === activeFeed) return;
    shouldScrollToLatestRef.current = true;
    setActiveFeed(feed);
    setContextMenu(null);
    setEditingNoteId(null);
    setError(null);
  }
  const [todayKey, setTodayKey] = useState(() => localDateKey(new Date()));
  const [profileOpen, setProfileOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarAccounts, setCalendarAccounts] = useState<CalendarAccount[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePeriod, setActivePeriod] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<NoteContextMenu | null>(null);
  const [checkingNoteIds, setCheckingNoteIds] = useState<Set<string>>(() => new Set());
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");
  const [savingNoteIds, setSavingNoteIds] = useState<Set<string>>(() => new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const longPressRef = useRef<LongPressGesture | null>(null);
  const suppressLongPressClickRef = useRef<string | null>(null);
  const noteRenderKeysRef = useRef(new Map<string, string>());
  const pendingDeletionRef = useRef<PendingDeletion | null>(null);
  const shouldScrollToLatestRef = useRef(true);
  const scrollBehaviorRef = useRef<ScrollBehavior>("auto");
  const calendarShouldScrollRef = useRef(false);

  const timelineGroups = useMemo(() => {
    const [year, month, day] = todayKey.split("-").map(Number);
    return groupNotesByPeriod(notes.filter((note) => (note.feed ?? "all") === activeFeed), new Date(year, month - 1, day));
  }, [notes, todayKey, activeFeed]);

  useEffect(() => {
    let timer: number;
    function updateToday() {
      const now = new Date();
      setTodayKey(localDateKey(now));
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      window.clearTimeout(timer);
      timer = window.setTimeout(updateToday, midnight.getTime() - now.getTime() + 50);
    }
    updateToday();
    document.addEventListener("visibilitychange", updateToday);
    return () => { window.clearTimeout(timer); document.removeEventListener("visibilitychange", updateToday); };
  }, []);

  async function loadCalendar() {
    try {
      const accountsResponse = await fetch("/api/calendar/accounts", { cache: "no-store" });
      const accountsBody = await accountsResponse.json();
      if (!accountsResponse.ok) throw new Error(accountsBody.error || "Could not load calendar accounts");
      setCalendarAccounts(accountsBody.accounts);
      if (!accountsBody.accounts.length) { setCalendarEvents([]); return; }
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end = new Date(start); end.setDate(end.getDate() + 1);
      const response = await fetch(`/api/calendar/events?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load calendar events");
      const scroller = scrollRef.current;
      calendarShouldScrollRef.current = !!scroller && scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 32;
      setCalendarEvents(body.events);
      setCalendarError(body.errors?.join(" ") || null);
    } catch (error) { setCalendarError(error instanceof Error ? error.message : "Could not load calendar"); }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("calendar_error")) { setProfileOpen(true); setCalendarOpen(true); setCalendarError(params.get("calendar_error")); }
    if (params.has("calendar") || params.has("calendar_error")) window.history.replaceState(null, "", window.location.pathname);
    let timer: number | undefined;
    let running = false;
    let stopped = false;

    async function refreshWhenVisible() {
      if (timer !== undefined) window.clearTimeout(timer);
      if (stopped || document.visibilityState !== "visible" || running) return;
      running = true;
      try {
        await loadCalendar();
      } finally {
        running = false;
        if (!stopped && document.visibilityState === "visible") {
          timer = window.setTimeout(() => void refreshWhenVisible(), 15_000);
        }
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") void refreshWhenVisible();
      else if (timer !== undefined) window.clearTimeout(timer);
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", refreshWhenVisible);
    void refreshWhenVisible();
    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, []);

  useEffect(() => {
    if (loading || !calendarShouldScrollRef.current) return;
    calendarShouldScrollRef.current = false;
    const frame = window.requestAnimationFrame(() => {
      const scroller = scrollRef.current;
      if (scroller) scroller.scrollTo({ top: scroller.scrollHeight, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [calendarEvents, loading]);

  async function disconnectCalendar(id: string) {
    const response = await fetch(`/api/calendar/accounts/${id}`, { method: "DELETE" });
    if (!response.ok) { setCalendarError("Could not disconnect this account."); return; }
    setCalendarError(null);
    await loadCalendar();
  }

  function syncActivePeriod() {
    const scroller = scrollRef.current;
    if (!scroller || timelineGroups.length === 0) return;

    const scrollerRect = scroller.getBoundingClientRect();
    const marker = scrollerRect.top + Math.min(160, scrollerRect.height * 0.32);
    let next = timelineGroups[0]?.key ?? null;

    for (const group of timelineGroups) {
      const section = document.getElementById(`period-${group.key}`);
      if (section && section.getBoundingClientRect().top <= marker) next = group.key;
    }

    if (scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 8) {
      next = timelineGroups.at(-1)?.key ?? next;
    }

    setActivePeriod((current) => (current === next ? current : next));
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
      window.requestAnimationFrame(syncActivePeriod);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loading, notes.length, activeFeed]);


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

    const feed = activeFeed;
    const optimisticNote = createOptimisticNote(text, feed);
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
        body: JSON.stringify({ text, feed })
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
      setDrafts((current) => ({ ...current, [feed]: current[feed] || text }));
      setError(saveError instanceof Error ? saveError.message : "Could not save note");
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLDivElement>) {
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

  function jumpToPeriod(key: string) {
    const scroller = scrollRef.current;
    const section = document.getElementById(`period-${key}`);
    if (!scroller || !section) return;
    setActivePeriod(key);
    const top = scroller.scrollTop + section.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 28;
    scroller.scrollTo({
      top,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
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
    suppressLongPressClickRef.current = null;
    if ((event.target as HTMLElement).closest("a")) return;
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
      suppressLongPressClickRef.current = gesture.noteId;
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
            <Popover.Root open={feedMenuOpen} onOpenChange={setFeedMenuOpen}>
              <Popover.Trigger asChild>
                <button type="button" className="feed-mobile-trigger" aria-label="Choose feed">
                  {activeFeed === "all" ? "All" : "Ideas"}<ChevronDown size={16} aria-hidden="true" />
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content className="feed-popover" align="start" sideOffset={8} collisionPadding={16} aria-label="Choose feed">
                  {(["all", "ideas"] as const).map((feed) => <button type="button" key={feed} className="feed-popover__item" aria-current={activeFeed === feed ? "page" : undefined} onClick={() => { selectFeed(feed); setFeedMenuOpen(false); }}>{feed === "all" ? "All" : "Ideas"}{activeFeed === feed ? <Check size={16} aria-hidden="true" /> : null}</button>)}
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </div>
          <Popover.Root open={profileOpen} onOpenChange={(open) => {
            setProfileOpen(open);
            if (!open) setCalendarOpen(false);
          }}>
            <Popover.Trigger asChild>
              <button type="button" className="profile-trigger" aria-label="Profile menu">
                <UserRound size={19} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content className="profile-popover" align="end" sideOffset={8} collisionPadding={16} aria-label="Profile menu">
                <button type="button" className="profile-menu-item" aria-expanded={calendarOpen} aria-controls="profile-calendar" onClick={() => setCalendarOpen((open) => !open)}>
                  <CalendarDays size={17} strokeWidth={1.8} aria-hidden="true" />
                  <span>Calendar</span>
                  <ChevronDown className={`profile-menu-item__chevron ${calendarOpen ? "is-open" : ""}`} size={15} aria-hidden="true" />
                </button>
                {calendarOpen ? <div id="profile-calendar" className="calendar-panel" role="region" aria-label="Google Calendar accounts">
                  <strong>Google Calendar</strong>
                  <p>Show events from up to two Google accounts in today’s list.</p>
                  {calendarAccounts.map((account) => <div className="calendar-account" key={account.id}><span>{account.email}</span><button type="button" onClick={() => void disconnectCalendar(account.id)}>Disconnect</button></div>)}
                  {calendarAccounts.length < 2 ? <a className="calendar-connect" href="/api/calendar/connect">Connect Google Calendar</a> : null}
                  {calendarError ? <p className="calendar-error" role="status">{calendarError}</p> : null}
                </div> : null}
                <button type="button" className="profile-menu-item" onClick={logOut}>
                  <LogOut size={17} strokeWidth={1.8} aria-hidden="true" />
                  <span>Log out</span>
                </button>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
      </header>

      <nav className="feed-tabs" aria-label="Feeds">
        {(["all", "ideas"] as const).map((feed) => <button type="button" key={feed} className={`feed-tab ${activeFeed === feed ? "is-active" : ""}`} aria-current={activeFeed === feed ? "page" : undefined} onClick={() => selectFeed(feed)}>{feed === "all" ? "All" : "Ideas"}</button>)}
      </nav>
      <div className="notes-stage">
        <section
          ref={scrollRef}
          className="notes-scroll"
          aria-label={activeFeed === "all" ? "All notes" : "Ideas"}
          aria-busy={loading}
          onScroll={() => {
            cancelLongPress();
            syncActivePeriod();
            setContextMenu(null);
          }}
        >
          <motion.div
            key={activeFeed}
            className="notes-list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
          >
            <AnimatePresence initial={false} mode="popLayout">
              {loading ? (
                <motion.div key="loading" layout="position" className="notes-state" role="status">
                  <span className="notes-state__pulse" aria-hidden="true" />
                  Loading notes
                </motion.div>
              ) : (
                timelineGroups.map((group) => (
                  <motion.section
                    key={group.key}
                    id={`period-${group.key}`}
                    data-period-key={group.key}
                    layout="position"
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8, transition: { duration: 0.14, ease: "easeIn" } }}
                    transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                    className="notes-week"
                    aria-labelledby={`period-label-${group.key}`}
                  >
                    {group.key === "today" ? (
                      <span className="sr-only" id={`period-label-${group.key}`}>{group.label}</span>
                    ) : (
                      <div className="notes-week__heading"><h2 id={`period-label-${group.key}`}>{group.label}</h2></div>
                    )}
                    <motion.div
                      layout="position"
                      className="notes-week__items"
                      transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                    >
                      {group.key === "today" ? <TodayEvents events={activeFeed === "all" ? calendarEvents : []} /> : null}
                      <AnimatePresence initial={false} mode="popLayout">
                        {group.notes.map((note, index) => {
                          const text = parseStoredNote(note.note).plainText;
                          const isSaving = isOptimisticNote(note);
                          const isEditing = editingNoteId === note.id;
                          const isSavingEdit = savingNoteIds.has(note.id);
                          const isChecked = note.checked;
                          const isChecking = checkingNoteIds.has(note.id);
                          const dateKey = localDateKey(new Date(note.createdAt));
                          const nextKey = index + 1 < group.notes.length ? localDateKey(new Date(group.notes[index + 1].createdAt)) : null;
                          const isLastOfDay = dateKey !== nextKey;
                          return (
                            <motion.article
                              key={noteRenderKeysRef.current.get(note.id) ?? note.id}
                              layout
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -8, transition: { duration: 0.14, ease: "easeIn" } }}
                              transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                              className={`note-row ${isLastOfDay ? "is-last-of-day" : ""} ${isEditing ? "is-editing" : ""} ${contextMenu?.noteId === note.id ? "has-open-menu" : ""}`}
                              tabIndex={isSaving || isEditing ? -1 : 0}
                              aria-label={isSaving || isSavingEdit ? "Saving note" : undefined}
                              aria-busy={isSaving || isSavingEdit}
                              onClickCapture={(event) => {
                                if (suppressLongPressClickRef.current === note.id) {
                                  suppressLongPressClickRef.current = null;
                                  event.preventDefault();
                                  event.stopPropagation();
                                  return;
                                }
                                if (event.button !== 0 || isSaving || isSavingEdit || isEditing) return;
                                if (event.target instanceof Element && event.target.closest("a")) return;
                                const checkbox = event.currentTarget.querySelector<HTMLButtonElement>(".note-check");
                                if (checkbox) {
                                  if (checkbox.contains(event.target as Node)) return;
                                  const bounds = checkbox.getBoundingClientRect();
                                  if (event.detail > 0 &&
                                      event.clientX >= bounds.left - 8 && event.clientX <= bounds.right + 8 &&
                                      event.clientY >= bounds.top - 8 && event.clientY <= bounds.bottom + 8) {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    return;
                                  }
                                }
                                event.preventDefault();
                                event.stopPropagation();
                                beginEditingNote(note);
                              }}
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
                                <div className="note-row__text">
                                  <NoteLinkText text={text} disabled={isSaving || isSavingEdit} onEdit={() => beginEditingNote(note)} />
                                </div>
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
          </motion.div>
        </section>

        {timelineGroups.length > 0 ? (
          <nav className="timeline-rail" aria-label="Jump to date group">
            <div className="timeline-rail__ticks">
              {timelineGroups.map((group) => (
                <button
                  key={group.key}
                  type="button"
                  className={`timeline-tick ${activePeriod === group.key ? "is-active" : ""}`}
                  aria-label={`Jump to ${group.label}`}
                  aria-current={activePeriod === group.key ? "date" : undefined}
                  onClick={() => jumpToPeriod(group.key)}
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
          <NoteComposerInput
            inputRef={textareaRef}
            value={draft}
            onChange={setDraft}
            onKeyDown={handleComposerKeyDown}
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
