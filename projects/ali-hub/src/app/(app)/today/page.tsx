"use client";

/**
 * /today · the home screen. Answers one question: what do I do right now?
 *
 * Renders instantly from the phone's local copy, refreshes in the background,
 * and every tick works offline (queued and synced later).
 *
 * DAY SPINE · the one layout (Ali picked it 2026-09-15; the "Now First" alternative and its
 * switch are gone). Top to bottom:
 *
 *   greeting + date + clock · streak · progress line
 *   LOOSE ENDS · due to-dos with no time slot, each with Time (native wheel → today at that
 *                hour) and Tmrw →. The card DISAPPEARS when the list is empty — the empty space
 *                is the point ("it motivates me to keep the page clean").
 *   THE SPINE  · Morning 04–12 · Afternoon 12–21 · Evening 21–04 on a vertical time line;
 *                routine steps and timed to-dos placed by the hour, past segments folded to one
 *                line, the current one outlined, a violet "now" line with the clock after it.
 *   Morning brief, then ONE highlight · listening and watching come after the day's actions.
 *
 * Tapping a to-do anywhere here opens the SAME task sheet as /todo (../todo/sheet), so time and
 * date can be changed without leaving the page (Ali 2026-09-15).
 *
 * Calendar work blocks were REMOVED the same evening (Ali: "work blocks are natural, I have
 * them every day · this is a personal to-do app"). The calendar API routes still exist but
 * nothing on Today reads them; Settings has no Calendars card any more.
 *
 * Machine days (gym-push/pull/legs) and the kettlebell Saturday (gym-kb) are checklist rows
 * with a Train/Start button · shown, never counted (the server's streak uses the same rule).
 */

import { Linkify } from "@/components/Linkify";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCached, fetchJson, readCache } from "@/lib/local/store";
import { sendOrQueue } from "@/lib/local/outbox";
import { ensureMigrate } from "@/lib/ensureMigrate";
import { useOnline } from "@/lib/useOnline";
import { checklistToday, dayPart, madridHour, type DayPart } from "@/lib/checklist/day";
import { itemColor, type ChecklistData, type ChecklistItem } from "@/lib/checklist/types";
import type { BooksData } from "@/lib/books/types";
import { useTodos } from "@/lib/todo/useTodos";
import { playDoneSound } from "@/lib/todo/celebrate";
import { PodcastCard } from "@/components/PodcastCard";
import { useHighlights, youtubeUrl } from "@/lib/news/useHighlights";
import { useBirthdays } from "@/lib/birthdays/useBirthdays";
import { daysUntil, dueSoon, fmtDaysUntil, sortByUpcoming, turningAge } from "@/lib/birthdays/types";
import { parseMorningPlan, computeMorning } from "@/lib/morning/plan";
import { useOverview } from "@/lib/train/useTrain";
import { addDays, fmtDue, sortTodos, type Todo } from "@/lib/todo/types";
import { Sheet } from "../todo/sheet";

// ─── One highlight suggestion (News keeps the rest) ──────────────────────────

function HighlightSuggestion() {
  const { unwatched, markWatched } = useHighlights();
  const h = unwatched[0];
  if (!h) return null;
  return (
    <a href={youtubeUrl(h.videoId)} target="_blank" rel="noopener noreferrer" onClick={() => markWatched(h.videoId)} className="cc-card"
      style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", padding: "12px 16px", textDecoration: "none", color: "inherit" }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13, color: "var(--ink-3)", marginBottom: 2 }}>Highlight to watch{unwatched.length > 1 ? ` · ${unwatched.length - 1} more on News` : ""}</span>
        <span style={{ display: "block", fontSize: 16, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.home} vs {h.away}</span>
        <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)", marginTop: 2 }}>{h.context}</span>
      </span>
      <span aria-hidden style={{ width: 34, height: 34, borderRadius: 99, background: "var(--fill-2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-2)", fontSize: 14, paddingLeft: 2 }}>▶</span>
    </a>
  );
}

// ─── Birthday reminder (Docs → Birthdays keeps the rest) ─────────────────────
// Quiet nudge, near the top since it's usually actionable (get a gift, say
// happy birthday) — unlike the passive highlight at the bottom. Disappears once
// the nearest one is outside its own reminder window (2026-09-19).

function BirthdayCard({ today }: { today: string }) {
  const { data } = useBirthdays();
  const upcoming = sortByUpcoming((data?.birthdays ?? []).filter((b) => dueSoon(b, today)), today);
  const b = upcoming[0];
  if (!b) return null;
  const days = daysUntil(b, today);
  const age = turningAge(b, today);
  return (
    <Link href="/birthdays" className="cc-card" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", padding: "12px 16px", textDecoration: "none", color: "inherit" }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13, color: "var(--ink-3)", marginBottom: 2 }}>Birthday{upcoming.length > 1 ? ` · ${upcoming.length - 1} more coming up` : ""}</span>
        <span style={{ display: "block", fontSize: 16, fontWeight: 500 }}>{b.name}{age !== null ? ` turns ${age}` : ""}</span>
      </span>
      <span style={{ fontSize: 14, color: "var(--violet)", fontWeight: 600, whiteSpace: "nowrap" }}>{fmtDaysUntil(days)}</span>
    </Link>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function greeting(h: number): string {
  if (h >= 4 && h < 12) return "Good morning";
  if (h >= 12 && h < 18) return "Good afternoon";
  if (h >= 18 && h < 23) return "Good evening";
  return "Late night";
}

const PART_TITLE: Record<DayPart, string> = { morning: "Morning", afternoon: "Afternoon", evening: "Evening" };
const PART_HOURS: Record<DayPart, [string, string]> = { morning: ["04:00", "12:00"], afternoon: ["12:00", "21:00"], evening: ["21:00", "04:00"] };
const PART_ORDER: Record<DayPart, number> = { morning: 0, afternoon: 1, evening: 2 };
const PARTS: DayPart[] = ["morning", "afternoon", "evening"];

/** Ali's day, not the calendar's: before 04:00 the header must still name the day the list belongs to. */
function longDate(ymd: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date(ymd + "T12:00:00"));
}
function clock(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Madrid" }).format(d);
}
/** Which part of the day a HH:MM belongs to (Ali's clock). */
function partOfTime(hhmm: string): DayPart {
  const h = Number(hhmm.slice(0, 2));
  if (h >= 4 && h < 12) return "morning";
  if (h >= 12 && h < 21) return "afternoon";
  return "evening";
}
function nextFullHour(): string {
  const h = new Date().getHours() + 1;
  return h > 23 ? "23:30" : `${String(h).padStart(2, "0")}:00`;
}
function openPicker(e: React.SyntheticEvent<HTMLInputElement>) {
  const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
  try { el.showPicker?.(); } catch { /* iOS opens the wheel itself */ }
}

function linkify(text: string) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((p, i) =>
    /^https?:\/\//.test(p) ? (
      <a key={i} href={p} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
         style={{ color: "var(--cyan)", textDecoration: "none", wordBreak: "break-all" }}>
        {p.replace(/^https?:\/\/(www\.)?/, "")}
      </a>
    ) : <span key={i}>{p}</span>
  );
}

/** Built-in routine steps get a dedicated action next to the tick. */
function routineAction(item: ChecklistItem): { label: string; href: string } | null {
  if (item.source === "workout") return { label: "Train", href: "/train" };
  if (item.routineKey === "stretch") return { label: "Start", href: "/stretch" };
  if (item.routineKey === "breathe") return { label: "Start", href: "/breathe" };
  if (item.routineKey === "read") return { label: "Books", href: "/books" };
  if (item.routineKey === "gym-kb") return { label: "Train", href: "/train/kb1" };
  return null;
}

/** Notes for built-in steps are shown without the raw URL (the button carries it). */
function displayNotes(item: ChecklistItem, currentBook: string | null): string | null {
  if (item.routineKey === "read" && currentBook) return `Reading: ${currentBook}`;
  if (!item.notes) return null;
  if (item.routineKey === "breathe") return item.notes.replace(/https?:\/\/\S+/g, "").replace(/·\s*$/, "").trim() || null;
  return item.notes;
}

const isMachine = (i: ChecklistItem) => !!i.routineKey?.startsWith("gym-");

// ─── Row ──────────────────────────────────────────────────────────────────────

function Row({ item, onToggle, compact = false, currentBook = null, flag }: {
  item: ChecklistItem;
  onToggle: (item: ChecklistItem) => void;
  compact?: boolean;
  currentBook?: string | null;
  /** Small note under the title, e.g. "from this morning". */
  flag?: string;
}) {
  const auto = item.source === "workout" || item.autoSource !== null;
  const done = item.completedToday;
  const accent = itemColor(item.color);
  // Ticking chimes and pops here too · same reward as the to-do list. Un-ticking stays instant.
  const [celebrating, setCelebrating] = useState(false);
  const tickItem = () => {
    if (auto || celebrating) return;
    if (done) { onToggle(item); return; }
    setCelebrating(true);
    playDoneSound();
    window.setTimeout(() => { setCelebrating(false); onToggle(item); }, 700);
  };
  const showDone = done || celebrating;
  // The action stays after ticking (as a quiet "Again") so the player is always one tap from home.
  const action = routineAction(item);
  const actionClass = done ? "cc-btn cc-btn-ghost" : "cc-btn cc-btn-primary";
  const actionLabel = done ? "Again" : action?.label;
  const notes = flag ?? (compact ? null : displayNotes(item, currentBook));

  // The virtual workout row (a KB session done today on an unplanned day) is a door to Train.
  if (item.source === "workout") {
    return (
      <Link href="/train" className="today-row" style={{ display: "grid", gridTemplateColumns: "28px 1fr auto", gap: 14, alignItems: "center", minHeight: 56, padding: "12px 4px", textDecoration: "none", color: "inherit", borderBottom: "1px solid var(--line)" }}>
        <span aria-hidden style={{ fontSize: 18, textAlign: "center", color: done ? "var(--pos)" : "var(--ink-3)" }}>{done ? "✓" : "▶"}</span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 17, fontWeight: 500, color: done ? "var(--ink-3)" : "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title.replace(/^Train · /, "")}</span>
          {item.notes && <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)", marginTop: 2 }}>{item.notes}</span>}
        </span>
        <span className={done ? "cc-pill" : "cc-btn cc-btn-primary"} style={done ? { fontSize: 14 } : { minHeight: 44, padding: "0 16px", borderRadius: 12 }}>{done ? "done" : "▶ Train"}</span>
      </Link>
    );
  }

  return (
    <div className="today-row" style={{ display: "grid", gridTemplateColumns: action ? "1fr auto" : "1fr", alignItems: "stretch", borderBottom: "1px solid var(--line)" }}>
      <button type="button" onClick={tickItem} disabled={auto} aria-pressed={done}
        style={{ display: "grid", gridTemplateColumns: "28px 1fr auto", gap: 14, alignItems: "center", width: "100%", minHeight: compact ? 48 : 56, padding: compact ? "8px 4px" : "12px 4px", background: "transparent", border: "none", textAlign: "left", color: "inherit", font: "inherit", cursor: auto ? "default" : "pointer", opacity: done ? 0.55 : 1, WebkitTapHighlightColor: "transparent" }}>
        <span aria-hidden className={celebrating ? "cc-done-pop" : undefined}
          style={{ position: "relative", width: 28, height: 28, borderRadius: 10, border: `2px solid ${showDone ? "transparent" : auto ? `${accent}66` : "var(--line-strong)"}`, background: showDone ? accent : "var(--fill-1)", display: "inline-flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s, border-color 0.15s", flexShrink: 0 }}>
          {showDone && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#06060B" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
          {celebrating && <span className="cc-done-ring" />}
        </span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, overflow: "hidden", fontSize: compact ? 14 : 16, fontWeight: 500, lineHeight: 1.3, color: done ? "var(--ink-3)" : "var(--ink)", textDecoration: done ? "line-through" : "none", textDecorationColor: "var(--ink-4)" }}>
            <Linkify text={item.title} />
          </span>
          {(item.atTime || notes) && (
            <span style={{ display: "block", fontSize: 14, color: flag ? "var(--warn)" : "var(--ink-3)", marginTop: 2, lineHeight: 1.4 }}>
              {item.atTime && <span style={{ fontFamily: "var(--f-mono)" }}>{item.atTime}{notes ? " · " : ""}</span>}
              {notes && linkify(notes)}
            </span>
          )}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink-3)" }}>
          {auto && <span className="cc-pill" style={{ fontSize: 13, padding: "2px 6px" }}>auto</span>}
          {item.streak >= 2 && <span title={`${item.streak}-day streak`}>{item.streak}d</span>}
        </span>
      </button>
      {action && (
        <Link href={action.href} className={actionClass} style={{ alignSelf: "center", minHeight: 44, padding: compact ? "0 12px" : "0 16px", borderRadius: 12, textDecoration: "none", marginLeft: 8 }}>
          ▶ {actionLabel}
        </Link>
      )}
    </div>
  );
}

/** One to-do inside Today · ticking chimes, pops and folds the row away. Optional Time / Tmrw actions (Day Spine's loose ends). */
function TodoRow({ t, today, toggleDone, onOpen, onTime, onDefer }: {
  t: Todo; today: string; toggleDone: (t: Todo) => void; onOpen: (t: Todo) => void;
  onTime?: (hhmm: string) => void; onDefer?: () => void;
}) {
  const [celebrating, setCelebrating] = useState(false);
  const tick = () => {
    if (celebrating) return;
    setCelebrating(true);
    playDoneSound();
    window.setTimeout(() => { setCelebrating(false); toggleDone(t); }, 900);
  };
  const late = !!t.dueDate && t.dueDate < today;
  const actions = !!(onTime || onDefer) && !celebrating;
  return (
    <div className={`today-row${celebrating ? " cc-done-row" : ""}`} style={{ display: "grid", gridTemplateColumns: actions ? "28px 1fr auto" : "28px 1fr", gap: 14, alignItems: "center", minHeight: 48, padding: "6px 4px", borderBottom: "1px solid var(--line)" }}>
      <button onClick={tick} aria-label="Mark done" className={celebrating ? "cc-done-pop" : undefined} style={{ position: "relative", width: 28, height: 28, borderRadius: 10, border: `2px solid ${celebrating ? "transparent" : t.priority === 2 ? "var(--neg)" : t.priority === 1 ? "var(--warn)" : "var(--line-strong)"}`, background: celebrating ? "var(--pos)" : "var(--fill-1)", cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        {celebrating && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#06060B" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
        {celebrating && <span className="cc-done-ring" />}
      </button>
      {/* Tap = open the task sheet right here (2026-09-15) · it used to jump to /todo and need a second tap. */}
      <button type="button" onClick={() => onOpen(t)} style={{ background: "transparent", border: "none", padding: 0, font: "inherit", textAlign: "left", color: "inherit", minWidth: 0, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
        <span style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, overflow: "hidden", fontSize: 16, lineHeight: 1.3 }}><Linkify text={t.title} /></span>
        <span style={{ display: "block", fontSize: 14, color: late ? "var(--neg)" : "var(--ink-3)", fontFamily: "var(--f-mono)" }}>
          {late ? fmtDue(t.dueDate!, today) : t.dueTime ?? (t.evening ? "evening" : "anytime")}{t.area === "work" ? " · Work" : t.area === "list" ? " · Doc" : ""}{t.project ? ` · #${t.project}` : ""}
        </span>
      </button>
      {actions && (
        <span style={{ display: "flex", gap: 4 }}>
          {onTime && (
            <label className="cc-btn cc-btn-ghost" aria-label="Give it a time today" style={{ minHeight: 40, padding: "0 10px", fontSize: 13.5, borderRadius: 10, position: "relative", display: "inline-flex", alignItems: "center", cursor: "pointer" }}>
              Time
              <input type="time" defaultValue={nextFullHour()} onClick={openPicker} onChange={(e) => { if (e.target.value) onTime(e.target.value); }}
                aria-label="Pick a time for today" style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", fontSize: 17 }} />
            </label>
          )}
          {onDefer && <button onClick={onDefer} className="cc-btn cc-btn-ghost" aria-label="Move to tomorrow" style={{ minHeight: 40, padding: "0 10px", fontSize: 13.5, borderRadius: 10 }}>Tmrw →</button>}
        </span>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const EMPTY: ChecklistData = { items: [], overallStreak: 0, monthlyPct: [], thirtyDayAvg: 0, bestStreak30: 0 };

export default function TodayPage() {
  const online = useOnline();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const today = checklistToday(now);
  const part = dayPart(now);
  const hour = madridHour(now);

  const { data, loading, stale, setData, refresh } = useCached<ChecklistData>("checklist", () => fetchJson<ChecklistData>("/api/checklist"));
  useEffect(() => { ensureMigrate(); }, []);

  // The book being read right now · from the phone's saved copy of /books (no extra request here).
  const [currentBook, setCurrentBook] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading localStorage after mount
    setCurrentBook(readCache<BooksData>("books")?.data.books.find((b) => b.status === "reading")?.title ?? null);
  }, []);

  // When the outbox finishes syncing, or the app comes back to the foreground, pull fresh data.
  useEffect(() => {
    const h = () => refresh();
    const vis = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("cc:outbox-flushed", h);
    document.addEventListener("visibilitychange", vis);
    return () => { window.removeEventListener("cc:outbox-flushed", h); document.removeEventListener("visibilitychange", vis); };
  }, [refresh]);

  // If the saved copy is from a previous day, yesterday's ticks no longer apply.
  const [cachedDay, setCachedDay] = useState<string | null>(null);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading localStorage after mount
      setCachedDay(localStorage.getItem("cc:v1:checklist-day"));
      if (data) localStorage.setItem("cc:v1:checklist-day", today);
    } catch { /* ignore */ }
  }, [data, today]);
  const items = useMemo(() => {
    const list = data?.items ?? [];
    if (cachedDay && cachedDay !== today && stale) return list.map((i) => ({ ...i, completedToday: false }));
    return list;
  }, [data, cachedDay, today, stale]);

  const toggle = useCallback(async (item: ChecklistItem) => {
    const next = !item.completedToday;
    const patch = (v: boolean) => (prev: ChecklistData | null): ChecklistData => ({
      ...(prev ?? EMPTY),
      items: (prev?.items ?? []).map((i) => i.id === item.id ? { ...i, completedToday: v } : i),
    });
    setData(patch(next));
    try {
      await sendOrQueue({ url: "/api/checklist/toggle", method: "POST", body: { itemId: item.id, completed: next, date: today }, dedupeKey: `toggle:${item.id}:${today}` });
    } catch { setData(patch(!next)); }
  }, [setData, today]);

  // ── Checklist grouping ────────────────────────────────────────────────────
  // Habits being built, the virtual workout row and the machine/kettlebell days are shown but never counted.
  const machineDay = items.some(isMachine);
  const counted = items.filter((i) => i.kind !== "habit" && i.source !== "workout" && !isMachine(i));
  const total = counted.length;
  const doneCount = counted.filter((i) => i.completedToday).length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  const partOf = (i: ChecklistItem): DayPart | "anytime" => i.timeOfDay === "anytime" ? "anytime" : i.timeOfDay;

  // ── To-dos due today / overdue ────────────────────────────────────────────
  const { data: todoData, toggleDone, upsert, remove } = useTodos(today); // also keeps the home-screen badge current
  const dueList = useMemo(() => {
    type Due = Todo & { dueDate: string };
    return (todoData?.todos ?? []).filter((t): t is Due =>
      !t.deleted && !t.doneAt && !t.someday && !(t.wakeDate && t.wakeDate > today) && t.dueDate !== null && t.dueDate <= today
    ).sort(sortTodos);
  }, [todoData, today]);
  const overdueTodos = dueList.filter((t) => t.dueDate < today);
  const todayTodos = dueList.filter((t) => t.dueDate === today);
  const timedTodos = todayTodos.filter((t) => t.dueTime && !t.evening).sort((a, b) => (a.dueTime! < b.dueTime! ? -1 : 1));
  const eveningTodos = todayTodos.filter((t) => t.evening && !t.dueTime);
  const anytimeTodos = todayTodos.filter((t) => !t.dueTime && !t.evening);
  const giveTime = (t: Todo, hhmm: string) => upsert({ ...t, dueDate: today, dueTime: hhmm, evening: false });
  const defer = (t: Todo) => upsert({ ...t, dueDate: addDays(today, 1), dueTime: null });

  // The task sheet, opened by tapping a to-do row (same component as /todo).
  const [openTodo, setOpenTodo] = useState<Todo | null>(null);
  const projects = useMemo(
    () => [...new Set((todoData?.todos ?? []).filter((t) => !t.deleted && t.project).map((t) => t.project!))].sort(),
    [todoData]);

  const [opened, setOpened] = useState<Set<DayPart>>(new Set()); // past segments reopened by tap

  // ── Header · shared ───────────────────────────────────────────────────────
  const header = (
    <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.15 }}>{greeting(hour)}</h1>
        <div style={{ fontSize: 15, color: "var(--ink-3)", marginTop: 4 }}>
          {longDate(today)}
          <span style={{ fontFamily: "var(--f-mono)" }}> · {clock(now)}</span>
          {!online && <span style={{ color: "var(--warn)" }}> · offline, changes will sync</span>}
          {online && stale && <span> · showing saved copy</span>}
        </div>
      </div>
      {data && data.overallStreak > 0 && (
        <div className="cc-pill cc-pill-warn" style={{ fontSize: 15, padding: "6px 10px", whiteSpace: "nowrap" }}>{data.overallStreak} day{data.overallStreak === 1 ? "" : "s"}</div>
      )}
    </header>
  );

  // ─── The spine ─────────────────────────────────────────────────────────────
  const renderSpine = () => {
    // Untimed due to-dos have no slot on the spine · they sit in the tray until given a time or moved.
    const loose = [...overdueTodos, ...anytimeTodos, ...(part === "evening" ? eveningTodos : [])];
    // A routine step with a time (Ali 2026-09-15) belongs to the part that hour falls in,
    // whatever its "when in the day" says; without one it stays in its part, and "anytime"
    // steps ride along with the current part.
    const partOfItem = (i: ChecklistItem): DayPart | "anytime" => (i.atTime ? partOfTime(i.atTime) : partOf(i));
    const minOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
    const segFor = (p: DayPart) => {
      const routine = items.filter((i) => partOfItem(i) === p || (p === part && partOfItem(i) === "anytime"));
      const todos = p === "evening"
        ? [...timedTodos.filter((t) => partOfTime(t.dueTime!) === "evening"), ...(part !== "evening" ? eveningTodos : [])]
        : timedTodos.filter((t) => partOfTime(t.dueTime!) === p);
      const openCount = routine.filter((i) => !i.completedToday && i.kind !== "habit").length + todos.length;
      const status: "past" | "now" | "future" = PART_ORDER[p] < PART_ORDER[part] ? "past" : p === part ? "now" : "future";
      // One list in clock order · anything without an hour sits above the timed rows.
      const rows: { key: string; min: number; order: number; node: React.ReactNode }[] = [
        ...routine.map((i, n) => ({ key: `i${i.id}`, min: i.atTime ? minOf(i.atTime) : -1, order: n,
          node: <Row key={i.id} item={i} onToggle={toggle} currentBook={currentBook} compact={status !== "now"} /> })),
        ...todos.map((t, n) => ({ key: t.clientId, min: t.dueTime ? minOf(t.dueTime) : -1, order: 1000 + n,
          node: <TodoRow key={t.clientId} t={t} today={today} toggleDone={toggleDone} onOpen={setOpenTodo} /> })),
      ].sort((a, b) => a.min - b.min || a.order - b.order);
      return { p, routine, todos, rows, openCount, status };
    };
    const segs = PARTS.map(segFor);
    const nowIdx = PARTS.indexOf(part);

    return (
      <>
        {/* No loose ends = no card (Ali 2026-09-15: the empty space is the reward for
            giving everything a time or a new day · never "nothing untimed is open"). */}
        {loose.length > 0 && (
          <section className="cc-card">
            <div className="cc-card-head">
              <span className="title">Loose ends</span>
              <span className="tail">{loose.length} with no time slot</span>
            </div>
            <div style={{ padding: "0 14px" }}>
              {loose.map((t) => <TodoRow key={t.clientId} t={t} today={today} toggleDone={toggleDone} onOpen={setOpenTodo} onTime={(hhmm) => giveTime(t, hhmm)} onDefer={() => defer(t)} />)}
            </div>
          </section>
        )}

        <div style={{ display: "grid", gap: 0 }}>
          {segs.map((s, idx) => {
            const collapsed = s.status === "past" && !opened.has(s.p);
            const [from, to] = PART_HOURS[s.p];
            const dotColor = s.status === "past" ? "var(--pos)" : s.status === "now" ? "var(--violet)" : "var(--line-strong)";
            return (
              <div key={s.p}>
                <div style={{ display: "grid", gridTemplateColumns: "52px 1fr", gap: 10, position: "relative", paddingBottom: 14 }}>
                  <div style={{ fontFamily: "var(--f-mono)", fontSize: 13, color: "var(--ink-4)", textAlign: "right", paddingTop: 14, paddingRight: 2, lineHeight: 1.3 }}>
                    <span style={{ display: "block", color: "var(--ink-3)", fontWeight: 500 }}>{from}</span>{to}
                  </div>
                  <span aria-hidden style={{ position: "absolute", left: 58, top: 0, bottom: 0, width: 2, background: "var(--line)" }} />
                  <span aria-hidden style={{ position: "absolute", left: 53, top: 18, width: 12, height: 12, borderRadius: "50%", background: s.status === "future" ? "var(--bg-chrome)" : dotColor, border: `2px solid ${dotColor}`, boxShadow: s.status === "now" ? "0 0 0 4px var(--accent-soft)" : "none" }} />
                  <section className="cc-card" style={{ marginLeft: 14, borderColor: s.status === "now" ? "var(--violet)" : undefined, borderStyle: s.status === "past" ? "dashed" : undefined, background: s.status === "past" ? "transparent" : undefined, opacity: s.status === "future" ? 0.75 : 1 }}>
                    {collapsed ? (
                      <button type="button" onClick={() => setOpened((o) => new Set(o).add(s.p))}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", minHeight: 46, padding: "0 16px", background: "transparent", border: "none", color: "var(--ink-3)", font: "inherit", fontSize: 15, cursor: "pointer", textAlign: "left" }}>
                        <span><b style={{ fontWeight: 500, color: "var(--ink-2)" }}>{PART_TITLE[s.p]}</b> · {s.openCount === 0 ? "✓ all done" : `${s.openCount} left open`}</span><span>▾</span>
                      </button>
                    ) : (
                      <>
                        <div className="cc-card-head" onClick={s.status === "past" ? () => setOpened((o) => { const n = new Set(o); n.delete(s.p); return n; }) : undefined}
                          role={s.status === "past" ? "button" : undefined} style={s.status === "past" ? { cursor: "pointer" } : undefined}>
                          <span className="title">{PART_TITLE[s.p]}</span>
                          <span className="tail" style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                            {s.status === "now" ? "now" : s.status === "past" ? "earlier" : "later"} · {s.openCount === 0 ? "done" : `${s.openCount} to do`}{s.status === "past" && <span aria-hidden> ▴</span>}
                            {s.status === "now" && <Link href="/checklist" style={{ textDecoration: "none", color: "var(--ink-2)", fontFamily: "var(--f-sans)", fontSize: 15, minHeight: 44, display: "inline-flex", alignItems: "center", padding: "0 4px", margin: "-12px -4px" }}>Edit</Link>}
                          </span>
                        </div>
                        <div style={{ padding: "0 14px" }}>
                          {s.p === "morning" && s.status === "now" && <MorningCardLine machineDay={machineDay} />}
                          {loading && !data && s.status === "now" && <div style={{ padding: "12px 0", display: "grid", gap: 10 }}>{[0, 1].map((i) => <div key={i} className="cc-skeleton" style={{ height: 44 }} />)}</div>}
                          {s.rows.length === 0 && !(loading && !data) && <div style={{ padding: "10px 4px 14px", fontSize: 14, color: "var(--ink-4)" }}>Nothing planned.</div>}
                          {s.rows.map((r) => r.node)}
                        </div>
                      </>
                    )}
                  </section>
                </div>
                {idx === nowIdx && idx < PARTS.length - 1 && (
                  <div aria-hidden style={{ position: "relative", height: 0, margin: "-6px 0 8px" }}>
                    <span style={{ position: "absolute", left: 52, right: 0, top: 0, borderTop: "2px solid var(--violet)" }} />
                    <span style={{ position: "absolute", left: 0, top: -9, width: 48, textAlign: "right", fontSize: 12, color: "var(--violet)", fontWeight: 600, fontFamily: "var(--f-mono)" }}>{clock(now)}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </>
    );
  };

  return (
    <div className="today-page" style={{ display: "grid", gap: 18 }}>
      {header}

      <div>
        <div className="cc-progress-track" style={{ height: 4 }}><div className="cc-progress-fill" style={{ width: `${pct}%` }} /></div>
        <div style={{ fontSize: 13, color: "var(--ink-4)", fontFamily: "var(--f-mono)", marginTop: 6 }}>
          {loading && !data ? "…" : `${doneCount} / ${total} routine · ${pct}%`}
        </div>
      </div>

      <BirthdayCard today={today} />

      {renderSpine()}

      {/* Morning brief at the BOTTOM, just above the highlight (Ali 2026-09-14 night: once heard it
          must not sit on top · the day's actions come first, listening and watching last). */}
      <PodcastCard today={today} />

      {/* ONE spoiler-free highlight to watch (2026-09-12) · at the very bottom on purpose. */}
      <HighlightSuggestion />

      {/* The task sheet · same one as /todo, so a time or date is one tap away from here. */}
      {openTodo && (
        <Sheet t={openTodo} today={today} projects={projects}
          onSave={(t) => upsert(t)} onDelete={() => remove(openTodo)} onClose={() => setOpenTodo(null)} />
      )}

      <style>{`
        .today-row:last-child { border-bottom: none !important; }
        .today-row > button:active:not(:disabled) { background: var(--fill-1); }
      `}</style>
    </div>
  );
}

/** One quiet line inside the spine's Morning segment: the wake time, tap → Settings. */
function MorningCardLine({ machineDay }: { machineDay: boolean }) {
  const { data: settings } = useCached<{ morningPlan?: string | null }>("settings", () => fetchJson("/api/settings"));
  const { data: ov } = useOverview();
  const plan = parseMorningPlan(settings?.morningPlan);
  const sched = ov?.schedule ?? null;
  const isTraining = machineDay || (sched ? sched.todayKey !== null : true);
  const { wake, bufferMin } = computeMorning(plan, isTraining);
  return (
    <Link href="/settings" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 36, padding: "6px 4px", fontSize: 13.5, color: "var(--ink-4)", textDecoration: "none", borderBottom: "1px solid var(--line)" }}>
      <span>Wake {wake} · {isTraining ? "training day" : "rest day"} · calls {plan.callsAt}</span>
      <span style={{ color: bufferMin < 0 ? "var(--warn)" : "var(--ink-4)" }}>{bufferMin >= 0 ? `${bufferMin} min spare` : `${-bufferMin} min over`}</span>
    </Link>
  );
}
