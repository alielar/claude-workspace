"use client";

/**
 * /today · the home screen. Answers one question: what do I do right now?
 *
 * Renders instantly from the phone's local copy, refreshes in the background,
 * and every tick works offline (queued and synced later).
 *
 * The day is the spine (spec §6): wake → stretch → breathe → supplements →
 * day → evening → magnesium → reading habit.
 *
 * Layout (redesigned 2026-09-08, Ali's order with two agreed amendments):
 *   greeting + date + streak · progress line
 *   HEADLINES  · 3 one-line featured stories (strip, not the old rotating card) → /news
 *   TODAY      · ONE timeline card merging checklist, to-dos and calendar blocks:
 *                earlier/overdue on top → current part routine → timed (work blocks,
 *                personal events, timed to-dos) → anytime → next part → evening
 *                (folded in, dimmed until the evening). The read row doubles as
 *                "Reading now" (book title inline · the Books card is gone).
 *   BUILDING   · habits being built
 *   DONE       · one collapsed line, expandable
 */

import { Linkify } from "@/components/Linkify";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useCached, fetchJson, readCache } from "@/lib/local/store";
import { sendOrQueue } from "@/lib/local/outbox";
import { ensureMigrate } from "@/lib/ensureMigrate";
import { useOnline } from "@/lib/useOnline";
import { checklistToday, dayPart, madridHour, type DayPart } from "@/lib/checklist/day";
import { itemColor, BREATHING_VIDEO_URL, type ChecklistData, type ChecklistItem } from "@/lib/checklist/types";
import type { Book, BooksData } from "@/lib/books/types";
import { useTodos } from "@/lib/todo/useTodos";
import { playDoneSound } from "@/lib/todo/celebrate";
import { PodcastCard } from "@/components/PodcastCard";
import { useHighlights, youtubeUrl } from "@/lib/news/useHighlights";
import { parseMorningPlan, computeMorning } from "@/lib/morning/plan";
import { useOverview } from "@/lib/train/useTrain";
import { fmtDue, sortTodos, type Todo } from "@/lib/todo/types";
import type { CalBlock } from "@/lib/calendar/server";

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function greeting(h: number): string {
  if (h >= 4 && h < 12) return "Good morning";
  if (h >= 12 && h < 18) return "Good afternoon";
  if (h >= 18 && h < 23) return "Good evening";
  return "Late night";
}

const PART_LABEL: Record<DayPart, string> = {
  morning: "This morning",
  afternoon: "This afternoon",
  evening: "This evening",
};
const PART_ORDER: Record<DayPart, number> = { morning: 0, afternoon: 1, evening: 2 };

function longDate(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Madrid",
  }).format(d);
}

function linkify(text: string) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((p, i) =>
    /^https?:\/\//.test(p) ? (
      <a key={i} href={p} target="_blank" rel="noopener noreferrer"
         onClick={(e) => e.stopPropagation()}
         style={{ color: "var(--cyan)", textDecoration: "none", wordBreak: "break-all" }}>
        {p.replace(/^https?:\/\/(www\.)?/, "")}
      </a>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

/** Built-in routine steps get a dedicated action next to the tick. */
function routineAction(item: ChecklistItem): { label: string; href: string; external: boolean } | null {
  if (item.source === "workout") return { label: "Train", href: "/train", external: false };
  if (item.routineKey === "stretch") return { label: "Start", href: "/stretch", external: false };
  if (item.routineKey === "breathe") return { label: "Start", href: "/breathe", external: false };
  if (item.routineKey === "read") return { label: "Books", href: "/books", external: false };
  return null;
}

/** Notes for built-in steps are shown without the raw URL (the Video button carries it). */
function displayNotes(item: ChecklistItem, currentBook: string | null): string | null {
  if (item.routineKey === "read" && currentBook) return `Reading: ${currentBook}`;
  if (!item.notes) return null;
  if (item.routineKey === "breathe") return item.notes.replace(/https?:\/\/\S+/g, "").replace(/·\s*$/, "").trim() || null;
  return item.notes;
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function Row({ item, onToggle, compact = false, currentBook = null }: {
  item: ChecklistItem;
  onToggle: (item: ChecklistItem) => void;
  compact?: boolean;
  currentBook?: string | null;
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
  // The action stays after ticking (as a quiet "Again") so the stretch player is
  // always one tap from home · before this, a ticked row hid the only way in.
  const action = routineAction(item);
  const actionClass = done ? "cc-btn cc-btn-ghost" : "cc-btn cc-btn-primary";
  const actionLabel = done ? "Again" : action?.label;
  const notes = compact ? null : displayNotes(item, currentBook);

  // The workout row is not a tick box · it's a door to the Train tab.
  if (item.source === "workout") {
    const rest = item.title === "Rest day";
    return (
      <Link href="/train" className="today-row" style={{ display: "grid", gridTemplateColumns: "28px 1fr auto", gap: 14, alignItems: "center", minHeight: 56, padding: "12px 4px", textDecoration: "none", color: "inherit", borderBottom: "1px solid var(--line)" }}>
        <span aria-hidden style={{ fontSize: 18, textAlign: "center", color: done ? "var(--pos)" : "var(--ink-3)" }}>{done ? "✓" : "▶"}</span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 17, fontWeight: 500, color: done ? "var(--ink-3)" : "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title.replace(/^Train · /, "")}</span>
          {item.notes && <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)", marginTop: 2 }}>{item.notes}</span>}
        </span>
        <span className={done ? "cc-pill" : rest ? "cc-btn cc-btn-ghost" : "cc-btn cc-btn-primary"} style={done ? { fontSize: 14 } : { minHeight: 44, padding: "0 16px", borderRadius: 12 }}>{done ? "done" : rest ? "Train anyway" : "▶ Train"}</span>
      </Link>
    );
  }

  return (
    <div
      className="today-row"
      style={{
        display: "grid",
        gridTemplateColumns: action ? "1fr auto" : "1fr",
        alignItems: "stretch",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <button
        type="button"
        onClick={tickItem}
        disabled={auto}
        aria-pressed={done}
        style={{
          display: "grid",
          gridTemplateColumns: "28px 1fr auto",
          gap: 14,
          alignItems: "center",
          width: "100%",
          minHeight: compact ? 48 : 56,
          padding: compact ? "8px 4px" : "12px 4px",
          background: "transparent",
          border: "none",
          textAlign: "left",
          color: "inherit",
          font: "inherit",
          cursor: auto ? "default" : "pointer",
          opacity: done ? 0.55 : 1,
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <span
          aria-hidden
          className={celebrating ? "cc-done-pop" : undefined}
          style={{
            position: "relative",
            width: 28, height: 28, borderRadius: 9,
            border: `2px solid ${showDone ? "transparent" : auto ? `${accent}66` : "var(--line-strong)"}`,
            background: showDone ? accent : "var(--fill-1)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            transition: "background 0.15s, border-color 0.15s",
            flexShrink: 0,
          }}
        >
          {showDone && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#06060B" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
          {celebrating && <span className="cc-done-ring" />}
        </span>

        <span style={{ minWidth: 0 }}>
          <span style={{
            display: "block", fontSize: compact ? 14 : 16, fontWeight: 500,
            color: done ? "var(--ink-3)" : "var(--ink)",
            textDecoration: done ? "line-through" : "none",
            textDecorationColor: "var(--ink-4)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            <Linkify text={item.title} />
          </span>
          {notes && (
            <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)", marginTop: 2, lineHeight: 1.4 }}>
              {linkify(notes)}
            </span>
          )}
        </span>

        <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink-3)" }}>
          {auto && <span className="cc-pill" style={{ fontSize: 13, padding: "2px 6px" }}>auto</span>}
          {item.streak >= 2 && <span title={`${item.streak}-day streak`}>{item.streak}d</span>}
        </span>
      </button>

      {action && (
        action.external ? (
          <a
            href={action.href}
            target="_blank"
            rel="noopener noreferrer"
            className={actionClass}
            style={{ alignSelf: "center", minHeight: 44, padding: compact ? "0 12px" : "0 16px", borderRadius: 12, textDecoration: "none", marginLeft: 8 }}
          >
            ▶ {actionLabel}
          </a>
        ) : (
          <Link
            href={action.href}
            className={actionClass}
            style={{ alignSelf: "center", minHeight: 44, padding: compact ? "0 12px" : "0 16px", borderRadius: 12, textDecoration: "none", marginLeft: 8 }}
          >
            ▶ {actionLabel}
          </Link>
        )
      )}
    </div>
  );
}

function Card({ title, tail, children }: { title: string; tail?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="cc-card">
      <div className="cc-card-head">
        <span className="title">{title}</span>
        {tail !== undefined && <span className="tail">{tail}</span>}
      </div>
      <div style={{ padding: "0 14px" }}>{children}</div>
    </section>
  );
}

/**
 * Morning plan (2026-09-08, Ali-approved) · wake time + sequence, driven by whether
 * today is a training day (Settings → Training days). Minutes edited in Settings.
 */
function MorningCard({ today }: { today: string }) {
  void today;
  const { data: settings } = useCached<{ morningPlan?: string | null }>("settings", () => fetchJson("/api/settings"));
  const { data: ov } = useOverview();
  const plan = parseMorningPlan(settings?.morningPlan);
  const sched = ov?.schedule ?? null;
  const isTraining = sched ? sched.todayKey !== null : true;
  const { wake, rows, bufferMin } = computeMorning(plan, isTraining);
  const [open, setOpen] = useState(false);
  return (
    <section className="cc-card">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open}
        style={{ all: "unset", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", boxSizing: "border-box", minHeight: 46, padding: "10px 16px" }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>Morning · wake {wake}</span>
        <span style={{ fontSize: 13, color: "var(--ink-4)" }}>{isTraining ? "training day" : "rest day"} · calls {plan.callsAt} {open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div style={{ padding: "0 16px 12px" }}>
          {rows.map((r) => (
            <div key={r.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, minHeight: 36, alignItems: "center", borderBottom: "1px solid var(--line)" }}>
              <span style={{ fontFamily: "var(--f-mono)", fontSize: 13.5, color: "var(--ink-3)" }}>{r.start}–{r.end}</span>
              <span style={{ fontSize: 15 }}>{r.label}</span>
            </div>
          ))}
          <div style={{ paddingTop: 8, fontSize: 13.5, color: bufferMin < 0 ? "var(--warn)" : "var(--ink-4)" }}>
            {bufferMin >= 0 ? `${bufferMin} min spare before calls` : `${-bufferMin} min OVER · trim a step in Settings`}
            {!sched && " · set your training days in Settings so the wake time follows them"}
            {" · "}<Link href="/settings" style={{ color: "var(--violet)" }}>edit</Link>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Timeline pieces (calendar blocks + to-dos inside the TODAY card) ─────────

type CalData = { date: string; configured: boolean; blocks: (CalBlock & { ticked: boolean })[] };

function useCalendarDay(today: string) {
  const { data, setData } = useCached<CalData>("cal-today", () => fetchJson<CalData>("/api/calendar/today"));
  const blocks = data && data.date === today ? data.blocks : [];
  const tick = async (b: CalBlock & { ticked: boolean }) => {
    const next = !b.ticked;
    if (data) setData({ ...data, blocks: data.blocks.map((x) => x.key === b.key ? { ...x, ticked: next } : x) });
    try {
      await sendOrQueue({
        url: "/api/calendar/tick", method: "POST",
        body: { date: today, key: b.key, ticked: next },
        dedupeKey: `caltick:${today}:${b.key}`,
      });
    } catch { /* replayed later */ }
  };
  return { blocks, configured: data?.configured ?? false, tick };
}

/** A calendar block: tick = "I was productive in this block". */
function CalRow({ b, onTick }: { b: CalBlock & { ticked: boolean }; onTick: () => void }) {
  const work = b.source === "work";
  const [celebrating, setCelebrating] = useState(false);
  const tick = () => {
    if (celebrating) return;
    if (b.ticked) { onTick(); return; }
    setCelebrating(true);
    playDoneSound();
    window.setTimeout(() => { setCelebrating(false); onTick(); }, 700);
  };
  const showTicked = b.ticked || celebrating;
  return (
    <div className="today-row" style={{ display: "grid", gridTemplateColumns: "28px 1fr auto", gap: 14, alignItems: "center", minHeight: 52, padding: "8px 4px", borderBottom: "1px solid var(--line)", opacity: b.ticked ? 0.55 : 1 }}>
      <button onClick={tick} aria-pressed={showTicked} aria-label={b.ticked ? "Mark block not done" : "Mark block productive"} className={celebrating ? "cc-done-pop" : undefined}
        style={{ position: "relative", width: 28, height: 28, borderRadius: 9, border: `2px solid ${showTicked ? "transparent" : "var(--line-strong)"}`, background: showTicked ? "var(--cyan)" : "var(--fill-1)", cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        {showTicked && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#06060B" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
        {celebrating && <span className="cc-done-ring" />}
      </button>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 16, fontWeight: 500, color: b.ticked ? "var(--ink-3)" : "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {work ? "Work block" : b.title}
        </span>
        <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)", marginTop: 1, fontFamily: "var(--f-mono)" }}>
          {b.start}–{b.end}{work ? ` · ${b.title}` : " · personal"}
        </span>
      </span>
    </div>
  );
}

/** One to-do inside the timeline · ticking chimes, pops and folds the row away. */
function TodoRow({ t, today, toggleDone }: { t: Todo; today: string; toggleDone: (t: Todo) => void }) {
  const [celebrating, setCelebrating] = useState(false);
  const tick = () => {
    if (celebrating) return;
    setCelebrating(true);
    playDoneSound();
    window.setTimeout(() => { setCelebrating(false); toggleDone(t); }, 900);
  };
  return (
    <div className={`today-row${celebrating ? " cc-done-row" : ""}`} style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: 14, alignItems: "center", minHeight: 48, padding: "6px 4px", borderBottom: "1px solid var(--line)" }}>
      <button onClick={tick} aria-label="Mark done" className={celebrating ? "cc-done-pop" : undefined} style={{ position: "relative", width: 28, height: 28, borderRadius: 9, border: `2px solid ${celebrating ? "transparent" : t.priority === 2 ? "var(--neg)" : t.priority === 1 ? "var(--warn)" : "var(--line-strong)"}`, background: celebrating ? "var(--pos)" : "var(--fill-1)", cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        {celebrating && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#06060B" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
        {celebrating && <span className="cc-done-ring" />}
      </button>
      <Link href="/todo" style={{ textDecoration: "none", color: "inherit", minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><Linkify text={t.title} /></span>
        <span style={{ display: "block", fontSize: 14, color: t.dueDate && t.dueDate < today ? "var(--neg)" : "var(--ink-3)", fontFamily: "var(--f-mono)" }}>
          {t.dueDate && t.dueDate < today ? fmtDue(t.dueDate, today) : t.dueTime ?? (t.evening ? "evening" : "anytime")}{t.area === "work" ? " · Work" : t.area === "list" ? " · Doc" : ""}{t.project ? ` · #${t.project}` : ""}
        </span>
      </Link>
    </div>
  );
}

/** Small divider inside the timeline ("Anytime", "This evening"…). */
function SubHead({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 4px 2px" }}>
      <span style={{ fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-4)", fontFamily: "var(--f-mono)", whiteSpace: "nowrap" }}>{children}</span>
      <span aria-hidden style={{ flex: 1, height: 1, background: "var(--line)" }} />
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

  const { data, loading, stale, setData, refresh } = useCached<ChecklistData>(
    "checklist",
    () => fetchJson<ChecklistData>("/api/checklist")
  );

  // Make sure new database columns exist (once per session, fire-and-forget).
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
    return () => {
      window.removeEventListener("cc:outbox-flushed", h);
      document.removeEventListener("visibilitychange", vis);
    };
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
      await sendOrQueue({
        url: "/api/checklist/toggle",
        method: "POST",
        body: { itemId: item.id, completed: next, date: today },
        dedupeKey: `toggle:${item.id}:${today}`,
      });
    } catch {
      setData(patch(!next)); // server refused · put it back
    }
  }, [setData, today]);

  // ── Grouping ──────────────────────────────────────────────────────────────
  // Habits being built and the auto workout row are shown, but never counted (rest days must not break the streak).
  const counted = items.filter((i) => i.kind !== "habit" && i.source !== "workout");
  const total = counted.length;
  const doneCount = counted.filter((i) => i.completedToday).length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  const partOf = (i: ChecklistItem): DayPart | "anytime" => i.timeOfDay === "anytime" ? "anytime" : i.timeOfDay;
  const isNow = (i: ChecklistItem) => partOf(i) === part || partOf(i) === "anytime";
  const isEarlier = (i: ChecklistItem) => partOf(i) !== "anytime" && PART_ORDER[partOf(i) as DayPart] < PART_ORDER[part];

  const open = items.filter((i) => !i.completedToday);
  // The workout row lands after the routine steps.
  const nowItems   = open.filter((i) => i.kind !== "habit" && isNow(i)).sort((a, b) => (a.source === "workout" ? 1 : 0) - (b.source === "workout" ? 1 : 0));
  const earlier    = open.filter((i) => i.kind !== "habit" && isEarlier(i));
  const building   = open.filter((i) => i.kind === "habit" && (isNow(i) || isEarlier(i)));
  const afternoonItems = part === "morning" ? open.filter((i) => i.kind !== "habit" && partOf(i) === "afternoon") : [];
  const eveningItems   = part !== "evening" ? open.filter((i) => i.kind !== "habit" && partOf(i) === "evening") : [];
  const doneItems  = items.filter((i) => i.completedToday);
  const [showDone, setShowDone] = useState(false);

  // ── To-dos due today / overdue, merged into the timeline ──────────────────
  const { data: todoData, toggleDone } = useTodos(today); // also keeps the home-screen badge current
  const dueList = useMemo(() => {
    type Due = Todo & { dueDate: string };
    return (todoData?.todos ?? []).filter((t): t is Due =>
      !t.deleted && !t.doneAt && !t.someday && !(t.wakeDate && t.wakeDate > today) && t.dueDate !== null && t.dueDate <= today
    ).sort(sortTodos);
  }, [todoData, today]);
  const overdueTodos = dueList.filter((t) => t.dueDate < today);
  const todayTodos   = dueList.filter((t) => t.dueDate === today);
  const timedTodos   = todayTodos.filter((t) => t.dueTime && !t.evening);
  const eveningTodos = todayTodos.filter((t) => t.evening);
  const anytimeTodos = todayTodos.filter((t) => !t.dueTime && !t.evening).concat(part === "evening" ? eveningTodos : []);

  // ── Calendar blocks + timed to-dos, one time-ordered sequence ─────────────
  const { blocks, tick } = useCalendarDay(today);
  const toMinHM = (x: string) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3, 5));
  const timed: { min: number; node: React.ReactNode }[] = [
    ...blocks.map((b) => ({ min: b.startMin, node: <CalRow key={`cal-${b.key}`} b={b} onTick={() => tick(b)} /> })),
    ...timedTodos.map((t) => ({ min: toMinHM(t.dueTime!), node: <TodoRow key={t.clientId} t={t} today={today} toggleDone={toggleDone} /> })),
  ].sort((a, b) => a.min - b.min);

  const eveningSection = eveningItems.length + (part !== "evening" ? eveningTodos.length : 0);
  const allNowDone = data && total > 0 && nowItems.length === 0 && earlier.length === 0 && overdueTodos.length === 0;

  return (
    <div className="today-page" style={{ display: "grid", gap: 18 }}>

      {/* Header */}
      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.15 }}>
            {greeting(hour)}
          </h1>
          <div style={{ fontSize: 15, color: "var(--ink-3)", marginTop: 4 }}>
            {longDate(now)}
            {!online && <span style={{ color: "var(--warn)" }}> · offline, changes will sync</span>}
            {online && stale && <span> · showing saved copy</span>}
          </div>
        </div>
        {data && data.overallStreak > 0 && (
          <div className="cc-pill cc-pill-warn" style={{ fontSize: 15, padding: "6px 10px", whiteSpace: "nowrap" }}>
            {data.overallStreak} day{data.overallStreak === 1 ? "" : "s"}
          </div>
        )}
      </header>

      {/* Progress */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontFamily: "var(--f-mono)", color: "var(--ink-3)", marginBottom: 6 }}>
          <span>{loading && !data ? "…" : `${doneCount} / ${total} done`}</span>
          <span>{loading && !data ? "" : `${pct}%`}</span>
        </div>
        <div className="cc-progress-track" style={{ height: 4 }}>
          <div className="cc-progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* HEADLINES · compact strip, full news lives in the tab */}
      {part === "morning" && <MorningCard today={today} />}

      {/* The podcast replaced the headlines strip (2026-09-09) · it stays until listened,
          then Today is just the checklist and the day's to-dos. Full news lives on /news. */}
      <PodcastCard today={today} hideWhenHeard />

      {/* ONE spoiler-free highlight to watch (2026-09-12) · gone once tapped, the next unwatched takes its place */}
      <HighlightSuggestion />

      {/* TODAY · one timeline: checklist + calendar blocks + to-dos */}
      <Card
        title="Today"
        tail={<Link href="/checklist" style={{ textDecoration: "none", color: "var(--ink-2)", fontFamily: "var(--f-sans)", fontSize: 15, minHeight: 44, display: "inline-flex", alignItems: "center", padding: "0 4px", margin: "-12px -4px" }}>Edit</Link>}
      >
        {loading && !data && (
          <div style={{ padding: "12px 0", display: "grid", gap: 10 }}>
            {[0, 1, 2].map((i) => <div key={i} className="cc-skeleton" style={{ height: 44 }} />)}
          </div>
        )}
        {!loading && total === 0 && (
          <div style={{ padding: "18px 0", fontSize: 15, color: "var(--ink-3)" }}>
            No items yet. <Link href="/checklist" style={{ color: "var(--violet)" }}>Set up your checklist →</Link>
          </div>
        )}

        {/* Earlier + overdue float to the top · they need attention first */}
        {(earlier.length > 0 || overdueTodos.length > 0) && (
          <>
            <SubHead>Still open</SubHead>
            {earlier.map((item) => <Row key={item.id} item={item} onToggle={toggle} compact />)}
            {overdueTodos.map((t) => <TodoRow key={t.clientId} t={t} today={today} toggleDone={toggleDone} />)}
          </>
        )}

        {allNowDone && timed.length === 0 && anytimeTodos.length === 0 && (
          <div style={{ padding: "18px 0", fontSize: 15, color: "var(--pos)" }}>
            ✓ Nothing left for {PART_LABEL[part].toLowerCase()}.
          </div>
        )}

        {/* This part of the day · routine first */}
        {nowItems.map((item) => <Row key={item.id} item={item} onToggle={toggle} currentBook={currentBook} />)}

        {/* Timed · work blocks, personal events, timed to-dos in clock order */}
        {timed.map((e) => e.node)}

        {/* Anytime to-dos */}
        {anytimeTodos.length > 0 && (
          <>
            <SubHead>Anytime</SubHead>
            {anytimeTodos.map((t) => <TodoRow key={t.clientId} t={t} today={today} toggleDone={toggleDone} />)}
          </>
        )}

        {/* Later parts of the day, folded into the same timeline */}
        {afternoonItems.length > 0 && (
          <>
            <SubHead>This afternoon</SubHead>
            {afternoonItems.map((item) => <Row key={item.id} item={item} onToggle={toggle} compact />)}
          </>
        )}
        {eveningSection > 0 && (
          <div style={{ opacity: 0.65 }}>
            <SubHead>This evening</SubHead>
            {eveningItems.map((item) => <Row key={item.id} item={item} onToggle={toggle} compact />)}
            {part !== "evening" && eveningTodos.map((t) => <TodoRow key={t.clientId} t={t} today={today} toggleDone={toggleDone} />)}
          </div>
        )}
      </Card>

      {/* BUILDING · habits with their own streak (the read row carries the current book) */}
      {building.length > 0 && (
        <Card title="In the building" tail="habits, own streak">
          {building.map((item) => <Row key={item.id} item={item} onToggle={toggle} currentBook={currentBook} />)}
        </Card>
      )}

      {/* DONE · one quiet line, expandable */}
      {doneItems.length > 0 && (
        <section className="cc-card">
          <button onClick={() => setShowDone((v) => !v)} className="cc-card-head" style={{ width: "100%", background: "transparent", border: "none", borderBottom: showDone ? undefined : "none", color: "inherit", font: "inherit", cursor: "pointer", textAlign: "left" }}>
            <span className="title">Done</span><span className="tail">{doneItems.length} {showDone ? "▴" : "▾"}</span>
          </button>
          {showDone && <div style={{ padding: "0 14px" }}>{doneItems.map((item) => <Row key={item.id} item={item} onToggle={toggle} compact />)}</div>}
        </section>
      )}

      <style>{`
        .today-row:last-child { border-bottom: none !important; }
        .today-row > button:active:not(:disabled) { background: var(--fill-1); }
      `}</style>
    </div>
  );
}
