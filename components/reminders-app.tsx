"use client";

import * as motion from "motion/react-client";
import { AnimatePresence } from "motion/react";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { PacmanLoader } from "react-spinners";
import { FireworksBackground } from "@/components/animate-ui/components/backgrounds/fireworks";
import { Dialog, DialogPanel } from "@/components/animate-ui/components/headless/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItemIndicator,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/animate-ui/primitives/radix/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/animate-ui/components/radix/popover";
import { ReminderComposer } from "@/components/reminder-composer";
import { ReminderCard } from "@/components/reminder-card";
import { parseStoredNote } from "@/lib/note";
import { extractTagsFromText } from "@/lib/parse";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { computeReminderState } from "@/lib/time";
import type { Profile, Reminder, ReminderWithComputed } from "@/lib/types";

type ArchiveFilter = "all" | "completed" | "auto";
type AuthUserIdentity = { id: string; email: string | null; name: string | null } | null;
type SortMode = "latest" | "upcoming";
const POPULAR_TIMEZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Toronto",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "America/Buenos_Aires",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Stockholm",
  "Europe/Warsaw",
  "Europe/Athens",
  "Europe/Istanbul",
  "Europe/Kyiv",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Perth",
  "Australia/Sydney",
  "Pacific/Auckland",
  "Pacific/Honolulu"
];

function initials(name?: string | null) {
  if (!name) return "U";
  return name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function RemindersApp() {
  const router = useRouter();
  const [upcoming, setUpcoming] = useState<Reminder[]>([]);
  const [archive, setArchive] = useState<Reminder[]>([]);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("all");
  const [archiveQuery, setArchiveQuery] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authUser, setAuthUser] = useState<AuthUserIdentity>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fireworksActive, setFireworksActive] = useState(false);
  const [loadAnimationKey, setLoadAnimationKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>("latest");
  const fireworksTimerRef = useRef<number | null>(null);
  const wasLoadingRef = useRef(true);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isMacPlatform =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
  const searchShortcutHint = isMacPlatform ? "⌘S" : "Alt+S";
  const showLoaderAnimation = loading;

  async function loadUpcoming() {
    const res = await fetch("/api/reminders/upcoming", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load reminders");
    const data = (await res.json()) as { reminders: Reminder[] };
    setUpcoming(data.reminders);
  }

  async function loadArchive(filter = archiveFilter, q = archiveQuery) {
    const params = new URLSearchParams();
    if (filter !== "all") params.set("filter", filter);
    if (q.trim()) params.set("q", q.trim());
    const res = await fetch(`/api/reminders/archive?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load archive");
    const data = (await res.json()) as { items: Reminder[] };
    setArchive(data.items);
  }

  async function loadProfile() {
    const res = await fetch("/api/settings", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load settings");
    const data = (await res.json()) as { profile: Profile; user: AuthUserIdentity };
    setProfile(data.profile);
    setAuthUser(data.user);
  }

  async function refreshAll() {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadUpcoming(), loadArchive(), loadProfile()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load app");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshAll();
  }, []);

  useEffect(() => {
    if (!archiveOpen) return;
    void loadArchive();
  }, [archiveOpen]);

  useEffect(() => {
    const timer = setInterval(() => {
      setUpcoming((prev) => [...prev]);
    }, 30_000);
    return () => clearInterval(timer);
  }, []);

  const upcomingComputed: ReminderWithComputed[] = useMemo(
    () => upcoming.map((r) => computeReminderState(r)),
    [upcoming]
  );

  const archivedComputed: ReminderWithComputed[] = useMemo(
    () => archive.map((r) => computeReminderState(r)),
    [archive]
  );

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    for (const reminder of [...upcoming, ...archive]) {
      for (const tag of extractTagsFromText(parseStoredNote(reminder.note).plainText)) {
        tags.add(tag);
      }
    }
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
  }, [upcoming, archive]);

  const filteredUpcoming = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return upcomingComputed.filter((reminder) => {
      const noteText = parseStoredNote(reminder.note).plainText;
      const noteTags = extractTagsFromText(noteText);
      const hasTagMatch =
        selectedTags.length === 0 || selectedTags.every((tag) => noteTags.includes(tag));
      if (!hasTagMatch) return false;
      if (!normalizedQuery) return true;

      const haystack = [
        noteText,
        ...reminder.attachments.map((attachment) => {
          if (attachment.kind === "link") {
            return `${attachment.previewTitle ?? ""} ${attachment.url ?? ""}`;
          }
          if (attachment.kind === "file" || attachment.kind === "image") {
            return `${attachment.fileName ?? ""} ${attachment.mimeType ?? ""}`;
          }
          return attachment.textContent ?? "";
        })
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [upcomingComputed, searchQuery, selectedTags]);

  const filteredAndSortedUpcoming = useMemo(() => {
    const items = [...filteredUpcoming];
    if (sortMode === "latest") {
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return items;
    }

    items.sort((a, b) => {
      const aTime = a.remindAt ? new Date(a.remindAt).getTime() : Number.POSITIVE_INFINITY;
      const bTime = b.remindAt ? new Date(b.remindAt).getTime() : Number.POSITIVE_INFINITY;
      if (aTime !== bTime) return aTime - bTime;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return items;
  }, [filteredUpcoming, sortMode]);

  const timezoneOptions = useMemo(() => {
    const current = profile?.timezone?.trim();
    if (!current || POPULAR_TIMEZONES.includes(current)) return POPULAR_TIMEZONES;
    return [current, ...POPULAR_TIMEZONES];
  }, [profile?.timezone]);

  async function createReminder(payload: { note: string; remindAt: string | null; attachments: unknown[] }) {
    const res = await fetch("/api/reminders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || "Failed to create reminder");
    startTransition(() => {
      setUpcoming((prev) => [body.reminder, ...prev].sort(sortByReminderTime));
    });
  }

  async function snooze(id: string, preset: "10m" | "1h" | "tomorrow") {
    const res = await fetch(`/api/reminders/${id}/snooze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ preset })
    });
    if (!res.ok) return;
    const body = (await res.json()) as { reminder: Reminder };
    setUpcoming((prev) =>
      prev
        .map((r) => (r.id === id ? body.reminder : r))
        .sort(sortByReminderTime)
    );
  }

  async function archiveReminder(id: string, reason: "completed" | "manual") {
    const existing = upcoming.find((r) => r.id === id);
    if (existing) {
      setUpcoming((prev) => prev.filter((r) => r.id !== id));
    }

    const res = await fetch(`/api/reminders/${id}/archive`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason })
    });
    if (!res.ok) {
      if (existing) {
        setUpcoming((prev) => [...prev, existing].sort(sortByReminderTime));
      }
      return;
    }

    const body = (await res.json()) as { reminder: Reminder };
    setArchive((prev) => [body.reminder, ...prev]);
  }

  async function rescheduleReminder(id: string, remindAt: string) {
    const res = await fetch(`/api/reminders/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ remindAt })
    });
    if (!res.ok) return;
    const body = (await res.json()) as { reminder: Reminder };
    setUpcoming((prev) => {
      const others = prev.filter((r) => r.id !== id);
      return [...others, body.reminder].sort(sortByReminderTime);
    });
    setArchive((prev) => prev.filter((r) => r.id !== id));
  }

  async function updateReminderNote(id: string, note: string, removeAttachmentIds?: string[]) {
    const res = await fetch(`/api/reminders/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ note, removeAttachmentIds })
    });
    if (!res.ok) return;
    const body = (await res.json()) as { reminder: Reminder };
    setUpcoming((prev) => prev.map((r) => (r.id === id ? body.reminder : r)).sort(sortByReminderTime));
    setArchive((prev) => prev.map((r) => (r.id === id ? body.reminder : r)));
  }

  async function restoreReminder(id: string) {
    const localValue = window.prompt("Choose a new date/time (YYYY-MM-DDTHH:mm)", "");
    if (!localValue) return;
    const parsed = new Date(localValue);
    if (Number.isNaN(parsed.getTime())) {
      window.alert("Invalid date/time format.");
      return;
    }
    await rescheduleReminder(id, parsed.toISOString());
  }

  async function saveSettings(next: Partial<Profile>) {
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next)
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || "Failed to save settings");
    setProfile(body.profile);
  }

  async function logOut() {
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    router.push("/auth/sign-in");
    router.refresh();
  }

  function triggerFireworks() {
    setFireworksActive(true);
    if (fireworksTimerRef.current != null) {
      window.clearTimeout(fireworksTimerRef.current);
    }
    fireworksTimerRef.current = window.setTimeout(() => {
      setFireworksActive(false);
      fireworksTimerRef.current = null;
    }, 5000);
  }

  useEffect(
    () => () => {
      if (fireworksTimerRef.current != null) {
        window.clearTimeout(fireworksTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (wasLoadingRef.current && !loading) {
      setLoadAnimationKey((prev) => prev + 1);
    }
    wasLoadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    function onGlobalKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      const isSearchShortcut = (event.metaKey && key === "s") || (event.altKey && key === "s");
      if (!isSearchShortcut) return;
      event.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }

    window.addEventListener("keydown", onGlobalKeyDown);
    return () => window.removeEventListener("keydown", onGlobalKeyDown);
  }, []);

  return (
    <main className="app-frame">
      <header className="top-bar">
        <div className="top-bar__inner">
          <p className="top-bar__title">Later™</p>
          <div className="top-bar__actions">
            <div className="top-bar__search-wrap">
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search reminders"
                className="top-bar__search"
                aria-label="Search reminders"
              />
              <span className="top-bar__search-shortcut" aria-hidden="true">
                {searchShortcutHint}
              </span>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <motion.button
                  type="button"
                  className="icon-btn top-bar__icon-btn"
                  aria-label="Filter by tags"
                  title="Filter by tags"
                  whileHover={{ scale: 1.12 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M4 6h16M7 12h10m-7 6h4"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </motion.button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="bottom" align="end" sideOffset={8} className="tags-dropdown p-1.5">
                <DropdownMenuLabel className="tags-dropdown__label">Filter tags</DropdownMenuLabel>
                <DropdownMenuSeparator className="tags-dropdown__separator" />
                {availableTags.length === 0 ? (
                  <div className="tags-dropdown__empty">No tags yet</div>
                ) : (
                  availableTags.map((tag) => {
                    const checked = selectedTags.includes(tag);
                    return (
                      <DropdownMenuCheckboxItem
                        key={tag}
                        checked={checked}
                        onCheckedChange={(next) => {
                          setSelectedTags((prev) => {
                            if (next === true) return [...prev, tag];
                            return prev.filter((item) => item !== tag);
                          });
                        }}
                        className="tags-dropdown__item"
                      >
                        <DropdownMenuItemIndicator className="tags-dropdown__indicator">
                          ✓
                        </DropdownMenuItemIndicator>
                        #{tag}
                      </DropdownMenuCheckboxItem>
                    );
                  })
                )}
                {selectedTags.length > 0 ? (
                  <>
                    <DropdownMenuSeparator className="tags-dropdown__separator" />
                    <button type="button" className="tags-dropdown__clear" onClick={() => setSelectedTags([])}>
                      Clear filters
                    </button>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <motion.button
                  type="button"
                  className="icon-btn top-bar__icon-btn"
                  aria-label="Sort reminders"
                  title="Sort reminders"
                  whileHover={{ scale: 1.12 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M8 6v12m0 0-3-3m3 3 3-3M16 18V6m0 0-3 3m3-3 3 3"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </motion.button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="bottom" align="end" sideOffset={8} className="tags-dropdown p-1.5">
                <DropdownMenuLabel className="tags-dropdown__label">Sort</DropdownMenuLabel>
                <DropdownMenuSeparator className="tags-dropdown__separator" />
                <DropdownMenuCheckboxItem
                  checked={sortMode === "latest"}
                  onCheckedChange={() => setSortMode("latest")}
                  className="tags-dropdown__item"
                >
                  <DropdownMenuItemIndicator className="tags-dropdown__indicator">✓</DropdownMenuItemIndicator>
                  Latest added first
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={sortMode === "upcoming"}
                  onCheckedChange={() => setSortMode("upcoming")}
                  className="tags-dropdown__item"
                >
                  <DropdownMenuItemIndicator className="tags-dropdown__indicator">✓</DropdownMenuItemIndicator>
                  Upcoming first
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <section className="upcoming-panel" aria-live="polite">
        {loading ? (
          <div className="loading-reminders" role="status" aria-live="polite" aria-label="Loading reminders">
            {showLoaderAnimation ? (
              <PacmanLoader color="#0f67ff" size={22} speedMultiplier={0.9} loading />
            ) : (
              <p className="empty-state compact">Loading reminders</p>
            )}
          </div>
        ) : error ? (
          <p className="empty-state error">{error}</p>
        ) : filteredAndSortedUpcoming.length === 0 ? (
          <div className="empty-state">
            {searchQuery.trim().length > 0 || selectedTags.length > 0 ? (
              <p>No reminders match the current filters.</p>
            ) : (
              <>
                <p>No upcoming reminders yet.</p>
                <p>Drop a link, file, image, or text into the composer below.</p>
              </>
            )}
          </div>
        ) : (
          <motion.ul className="reminder-grid" layout key={loadAnimationKey}>
            <AnimatePresence>
              {filteredAndSortedUpcoming.map((reminder, index) => (
                <motion.li
                  key={reminder.id}
                  layout
                  initial={{ opacity: 0, y: -20 }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    transition: {
                      duration: 0.25,
                      ease: "easeOut",
                      delay: index * 0.045
                    }
                  }}
                  exit={{
                    opacity: 0,
                    y: -10,
                    transition: { duration: 0.16, ease: "easeInOut" }
                  }}
                >
                  <ReminderCard
                    reminder={reminder}
                  onSnooze={snooze}
                  onArchive={archiveReminder}
                  onReschedule={rescheduleReminder}
                  onUpdateNote={updateReminderNote}
                />
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
        )}
      </section>

      <Dialog open={archiveOpen} onClose={setArchiveOpen} className="archive-dialog">
        <DialogPanel from="bottom" className="archive-panel open p-0" showCloseButton={false}>
          <div className="archive-panel__header">
            <div>
              <p className="eyebrow">History</p>
              <h2>Archive</h2>
            </div>
            <button className="icon-btn large" onClick={() => setArchiveOpen(false)} aria-label="Close archive">
              ×
            </button>
          </div>
          <div className="archive-toolbar">
            <select
              value={archiveFilter}
              onChange={(e) => {
                const next = e.target.value as ArchiveFilter;
                setArchiveFilter(next);
                void loadArchive(next, archiveQuery);
              }}
            >
              <option value="all">All</option>
              <option value="completed">Completed</option>
              <option value="auto">Auto-archived</option>
            </select>
            <input
              value={archiveQuery}
              onChange={(e) => {
                const q = e.target.value;
                setArchiveQuery(q);
                void loadArchive(archiveFilter, q);
              }}
              placeholder="Search archive"
            />
          </div>
          {archivedComputed.length === 0 ? (
            <p className="empty-state compact">No archived reminders yet.</p>
          ) : (
            <ul className="archive-list">
              {archivedComputed.map((reminder) => (
                <li key={reminder.id}>
                  <ReminderCard
                    reminder={reminder}
                    compact
                    onSnooze={snooze}
                    onArchive={archiveReminder}
                    onReschedule={rescheduleReminder}
                    onUpdateNote={updateReminderNote}
                    onRestore={restoreReminder}
                  />
                </li>
              ))}
            </ul>
          )}
        </DialogPanel>
      </Dialog>

      <div className="bottom-right-controls">
        <motion.button
          className="archive-fab icon-only"
          whileHover={{ scale: 1.12 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setArchiveOpen((v) => !v)}
          aria-expanded={archiveOpen}
          aria-label="Open archive"
          title="Archive"
        >
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M5 7h14l-1.1 12.1a2 2 0 0 1-1.99 1.82H8.09a2 2 0 0 1-1.99-1.82L5 7Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M9 7V5.5A2.5 2.5 0 0 1 11.5 3h1A2.5 2.5 0 0 1 15 5.5V7"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </motion.button>

        <div className="settings-anchor settings-anchor--floating">
          <Popover>
            <PopoverTrigger asChild>
              <motion.button
                className="avatar-btn"
                whileHover={{ scale: 1.12 }}
                whileTap={{ scale: 0.9 }}
                aria-haspopup="menu"
                aria-label="Open settings"
              >
                {initials(profile?.displayName)}
              </motion.button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="end"
              sideOffset={10}
              className="account-popover p-0"
            >
              <div className="settings-menu__section">
                <p className="settings-title">
                  {authUser?.name || profile?.displayName || "Demo User"}
                </p>
                <p className="settings-subtle">{authUser?.email || "Account settings"}</p>
              </div>
              <div className="settings-menu__section">
                <label>
                  Timezone
                  <select
                    value={profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone}
                    onChange={(e) => setProfile((prev) => (prev ? { ...prev, timezone: e.target.value } : prev))}
                  >
                    {timezoneOptions.map((timezone) => (
                      <option key={timezone} value={timezone}>
                        {timezone}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Auto-archive
                  <select
                    value={profile?.autoArchivePolicy ?? "never"}
                    onChange={(e) =>
                      setProfile((prev) =>
                        prev ? { ...prev, autoArchivePolicy: e.target.value as Profile["autoArchivePolicy"] } : prev
                      )
                    }
                  >
                    <option value="never">Never</option>
                    <option value="24h">24 hours</option>
                    <option value="7d">7 days</option>
                  </select>
                </label>
                <button
                  className="btn primary"
                  onClick={async () => {
                    if (!profile) return;
                    await saveSettings({
                      timezone: profile.timezone,
                      autoArchivePolicy: profile.autoArchivePolicy
                    });
                  }}
                >
                  Save settings
                </button>
                <button type="button" className="btn" onClick={() => void logOut()}>
                  Log out
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <footer className="composer-wrap">
        <ReminderComposer
          onCreate={async (payload) => {
            await createReminder(payload);
            if (archiveOpen) void loadArchive();
          }}
        />
      </footer>

      <p className="app-watermark" aria-hidden="true">
        <button type="button" className="watermark-btn" onClick={triggerFireworks}>
          © Vladsplayground
        </button>
      </p>

      {fireworksActive ? (
        <div className="fireworks-easteregg" aria-hidden="true">
          <FireworksBackground
            population={3}
            fireworkSpeed={{ min: 6.5, max: 11 }}
            particleSpeed={{ min: 3.5, max: 10 }}
          />
        </div>
      ) : null}
    </main>
  );
}
  function sortByReminderTime(a: Reminder, b: Reminder) {
    const aTime = a.remindAt ? new Date(a.remindAt).getTime() : Number.POSITIVE_INFINITY;
    const bTime = b.remindAt ? new Date(b.remindAt).getTime() : Number.POSITIVE_INFINITY;
    return aTime - bTime;
  }
