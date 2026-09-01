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
 * Sections, phone first, single column:
 *   greeting + date + streak · progress line
 *   NOW        · routine + items for this part of the day (+ anytime), not done
 *   STILL OPEN · items from earlier today that weren't ticked (compact)
 *   BUILDING   · habits being built, only in their part of the day
 *   UP NEXT    · the next part of the day (compact) · evening items stay hidden in the morning
 *   DONE       · ticked today, dimmed
 *   NEWS       · 4 headlines from the last brief (cached) → /news
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
import type { NewsBrief } from "@/lib/news-brief";
import type { Book, BooksData } from "@/lib/books/types";
import { useTodos } from "@/lib/todo/useTodos";
import { fmtDue, sortTodos, type Todo } from "@/lib/todo/types";

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
const NEXT_PART: Record<DayPart, DayPart | null> = { morning: "afternoon", afternoon: "evening", evening: null };
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
        <span aria-hidden style={{ fontSize: 22, textAlign: "center" }}>{done ? "✅" : rest ? "🛌" : "🏋️"}</span>
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
        onClick={() => !auto && onToggle(item)}
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
          style={{
            width: 28, height: 28, borderRadius: 9,
            border: `2px solid ${done ? "transparent" : auto ? `${accent}66` : "var(--line-strong)"}`,
            background: done ? accent : "var(--fill-1)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            transition: "background 0.15s, border-color 0.15s",
            flexShrink: 0,
          }}
        >
          {done && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#06060B" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </span>

        <span style={{ minWidth: 0 }}>
          <span style={{
            display: "block", fontSize: compact ? 14 : 16, fontWeight: 500,
            color: done ? "var(--ink-3)" : "var(--ink)",
            textDecoration: done ? "line-through" : "none",
            textDecorationColor: "var(--ink-4)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {item.emoji ? `${item.emoji} ` : ""}<Linkify text={item.title} />
          </span>
          {notes && (
            <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)", marginTop: 2, lineHeight: 1.4 }}>
              {linkify(notes)}
            </span>
          )}
        </span>

        <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink-3)" }}>
          {auto && <span className="cc-pill" style={{ fontSize: 13, padding: "2px 6px" }}>auto</span>}
          {item.streak >= 2 && <span title={`${item.streak}-day streak`}>🔥 {item.streak}</span>}
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

// ─── News: rotating "Worth your time" card ────────────────────────────────────
// One featured story at a time (one per interest), auto-advances every 6 s, pauses while
// touched, swipes left/right, tap opens News. Reads the phone's copy of the brief.

const NEWS_CATS: { label: string; match: string[]; color: string }[] = [
  { label: "Football",    match: ["football"],     color: "#D97A2B" },
  { label: "Geopolitics", match: ["geopolitics"],  color: "#D05A5A" },
  { label: "Business",    match: ["business"],     color: "#3E9A63" },
  { label: "Tech & AI",   match: ["tech", "ai"],   color: "#2E9E8F" },
];

function firstLine(text: string, max = 120): string {
  const t = text.replace(/\s+/g, " ").trim();
  const dot = t.search(/[.!?](\s|$)/);
  const cut = dot > 40 && dot < max ? t.slice(0, dot + 1) : t.slice(0, max);
  return cut.length < t.length && !/[.!?]$/.test(cut) ? cut.replace(/\s\S*$/, "") + "…" : cut;
}

function NewsCard({ today }: { today: string }) {
  const { data: brief, loading } = useCached<NewsBrief>("news-brief", () => fetchJson<NewsBrief>("/api/news/generate"));
  const picks = useMemo(() => {
    if (!brief) return [];
    return NEWS_CATS.flatMap((c) => {
      const s = brief.stories.find((st) => c.match.includes(st.category) && st.featured) ?? brief.stories.find((st) => c.match.includes(st.category));
      return s ? [{ ...c, headline: s.headline, line: firstLine(s.summary || "") }] : [];
    });
  }, [brief]);

  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const n = picks.length;
  useEffect(() => {
    if (n < 2 || paused) return;
    const t = setInterval(() => setI((x) => (x + 1) % n), 6000);
    return () => clearInterval(t);
  }, [n, paused]);
  const cur = picks[Math.min(i, Math.max(0, n - 1))];
  const isOld = brief && brief.date !== today;

  const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX; setPaused(true); };
  const onTouchEnd = (e: React.TouchEvent) => {
    const dx = touchX.current === null ? 0 : e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) > 40 && n > 1) setI((x) => (x + (dx < 0 ? 1 : n - 1)) % n);
    setTimeout(() => setPaused(false), 400);
  };

  return (
    <Link href="/news" className="cc-card" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onTouchCancel={() => { touchX.current = null; setPaused(false); }}
      style={{ display: "block", textDecoration: "none", color: "inherit", overflow: "hidden" }}>
      <div className="cc-card-head">
        <span className="title" style={{ color: "var(--warn)" }}>★ Worth your time</span>
        <span className="tail">{brief ? (isOld ? `from ${brief.date}` : "") : loading ? "…" : "no brief yet"}</span>
      </div>
      <div className="cc-card-body" style={{ display: "grid", gap: 8, minHeight: 96 }}>
        {!cur && (
          <span style={{ fontSize: 15, color: "var(--ink-3)" }}>{loading ? "Loading the last brief…" : "The brief arrives every morning. Tap to open News."}</span>
        )}
        {cur && (
          <div key={cur.label} className="news-rotate" style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, color: cur.color }}>{cur.label}</span>
            <span style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.3, letterSpacing: "-0.01em" }}>{cur.headline}</span>
            {cur.line && <span style={{ fontSize: 15, color: "var(--ink-2)", lineHeight: 1.45 }}>{cur.line}</span>}
          </div>
        )}
        {n > 1 && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
            {picks.map((p, k) => (
              <span key={p.label} style={{ height: 4, borderRadius: 99, flex: k === i ? 3 : 1, background: k === i ? p.color : "var(--fill-3)", transition: "flex .3s, background .3s" }} />
            ))}
            {brief?.videos?.length ? <span style={{ fontSize: 13, color: "var(--ink-4)", marginLeft: 6, whiteSpace: "nowrap" }}>▶ {brief.videos.length} videos</span> : null}
          </div>
        )}
      </div>
      <style>{`@keyframes news-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } } .news-rotate { animation: news-in .35s var(--easeOut); }`}</style>
    </Link>
  );
}

// ─── Books card ───────────────────────────────────────────────────────────────
// Current book (cover + title) and what's next. Tap → /books. Phone copy first.

function BookCover({ b, width }: { b: Book; width: number }) {
  const [failed, setFailed] = useState(false);
  const h = Math.round(width * 1.5);
  if (!b.coverUrl || failed) return <span aria-hidden style={{ width, height: h, borderRadius: 5, background: "var(--grad-soft)", border: "1px solid var(--line)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(width / 3), flexShrink: 0 }}>📖</span>;
  // eslint-disable-next-line @next/next/no-img-element -- external cover, plain <img> keeps the bundle small
  return <img src={b.coverUrl} alt="" width={width} height={h} loading="lazy" decoding="async" onError={() => setFailed(true)} style={{ width, height: h, objectFit: "cover", borderRadius: 5, flexShrink: 0, boxShadow: "0 2px 6px rgba(0,0,0,0.3)", background: "var(--fill-2)" }} />;
}

function BooksCard() {
  const { data, loading } = useCached<BooksData>("books", () => fetchJson<BooksData>("/api/books"));
  const books = data?.books ?? [];
  const reading = books.find((b) => b.status === "reading") ?? null;
  const queue = books.filter((b) => b.status === "queue");
  const next = queue[0] ?? null;
  const show = reading ?? next;
  return (
    <Link href="/books" className="cc-card" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
      <div className="cc-card-head">
        <span className="title">{reading ? "Reading now" : "Next book"}</span>
        <span className="tail">{queue.length ? `${queue.length} waiting ›` : "shelf ›"}</span>
      </div>
      <div className="cc-card-body" style={{ display: "grid", gridTemplateColumns: show ? "44px 1fr" : "1fr", gap: 12, alignItems: "center", minHeight: 66 }}>
        {loading && !data && <div className="cc-skeleton" style={{ height: 44, gridColumn: "1 / -1" }} />}
        {!loading && !show && <span style={{ fontSize: 15, color: "var(--ink-3)" }}>{data ? "The shelf is empty · add a book." : "Couldn't load the shelf · tap to open it."}</span>}
        {show && (
          <>
            <BookCover b={show} width={44} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 17, fontWeight: 500, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{show.title}</span>
              <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {show.author}{reading && next ? ` · next: ${next.title}` : !reading ? " · tap to start" : ""}
              </span>
            </span>
          </>
        )}
      </div>
    </Link>
  );
}

// ─── To-do card ───────────────────────────────────────────────────────────────

function TodoCard({ today, part }: { today: string; part: DayPart }) {
  const { data, toggleDone } = useTodos(today); // also keeps the home-screen badge current
  const open = useMemo(() => {
    type Due = Todo & { dueDate: string };
    const list = (data?.todos ?? []).filter((t): t is Due => !t.deleted && !t.doneAt && !t.someday && t.dueDate !== null && t.dueDate <= today);
    // in the morning/afternoon, evening tasks wait their turn
    return list.filter((t) => part === "evening" || !t.evening || t.dueDate < today).sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : sortTodos(a, b)));
  }, [data, today, part]);
  if (!data || open.length === 0) return null;
  const overdue = open.filter((t) => t.dueDate < today).length;
  return (
    <Card title="To-do" tail={<Link href="/todo" style={{ textDecoration: "none", color: "var(--ink-3)" }}>{open.length > 4 ? `+${open.length - 4} more ›` : "All ›"}</Link>}>
      {open.slice(0, 4).map((t, i, arr) => (
        <div key={t.clientId} style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: 14, alignItems: "center", minHeight: 50, padding: "6px 4px", borderBottom: i < arr.length - 1 ? "1px solid var(--line)" : "none" }}>
          <button onClick={() => toggleDone(t)} aria-label="Mark done" style={{ width: 28, height: 28, borderRadius: 9, border: `2px solid ${t.priority === 2 ? "var(--neg)" : t.priority === 1 ? "var(--warn)" : "var(--line-strong)"}`, background: "var(--fill-1)", cursor: "pointer", padding: 0 }} />
          <Link href="/todo" style={{ textDecoration: "none", color: "inherit", minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><Linkify text={t.title} /></span>
            <span style={{ display: "block", fontSize: 14, color: t.dueDate < today ? "var(--neg)" : "var(--ink-3)", fontFamily: "var(--f-mono)" }}>
              {t.dueDate < today ? fmtDue(t.dueDate, today) : t.dueTime ?? (t.evening ? "this evening" : "today")}{t.area === "work" ? " · Work" : t.area === "list" ? " · Doc" : ""}{t.project ? ` · #${t.project}` : ""}
            </span>
          </Link>
        </div>
      ))}
      {overdue > 0 && <div style={{ padding: "6px 4px 10px", fontSize: 14, color: "var(--ink-4)" }}>{overdue} overdue · open To-do to move or clear them.</div>}
    </Card>
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
  const isNext = (i: ChecklistItem) => NEXT_PART[part] !== null && partOf(i) === NEXT_PART[part];

  const open = items.filter((i) => !i.completedToday);
  // The workout row lands after the routine steps in NOW.
  const nowItems   = open.filter((i) => i.kind !== "habit" && isNow(i)).sort((a, b) => (a.source === "workout" ? 1 : 0) - (b.source === "workout" ? 1 : 0));
  const earlier    = open.filter((i) => i.kind !== "habit" && isEarlier(i));
  const building   = open.filter((i) => i.kind === "habit" && (isNow(i) || isEarlier(i)));
  const upNext     = open.filter((i) => isNext(i));
  const doneItems  = items.filter((i) => i.completedToday);

  const allNowDone = data && total > 0 && nowItems.length === 0;

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
            🔥 {data.overallStreak} day{data.overallStreak === 1 ? "" : "s"}
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

      {/* NOW */}
      <Card
        title={PART_LABEL[part]}
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
        {allNowDone && (
          <div style={{ padding: "18px 0", fontSize: 15, color: "var(--pos)" }}>
            ✓ Nothing left for {PART_LABEL[part].toLowerCase()}.
          </div>
        )}
        {nowItems.map((item) => <Row key={item.id} item={item} onToggle={toggle} currentBook={currentBook} />)}
      </Card>

      {/* NEWS · worth your time, rotating */}
      <NewsCard today={today} />

      {/* TO-DO due today */}
      <TodoCard today={today} part={part} />

      {/* BOOKS */}
      <BooksCard />

      {/* STILL OPEN (earlier today) */}
      {earlier.length > 0 && (
        <Card title="Still open from earlier" tail={earlier.length}>
          {earlier.map((item) => <Row key={item.id} item={item} onToggle={toggle} compact />)}
        </Card>
      )}

      {/* BUILDING */}
      {building.length > 0 && (
        <Card title="Building" tail="habits, own streak">
          {building.map((item) => <Row key={item.id} item={item} onToggle={toggle} currentBook={currentBook} />)}
        </Card>
      )}

      {/* UP NEXT */}
      {upNext.length > 0 && (
        <Card title={NEXT_PART[part] === "evening" ? "This evening" : "This afternoon"} tail={upNext.length}>
          {upNext.map((item) => <Row key={item.id} item={item} onToggle={toggle} compact />)}
        </Card>
      )}

      {/* DONE */}
      {doneItems.length > 0 && (
        <Card title="Done" tail={doneItems.length}>
          {doneItems.map((item) => <Row key={item.id} item={item} onToggle={toggle} compact />)}
        </Card>
      )}

      <style>{`
        .today-row:last-child { border-bottom: none !important; }
        .today-row > button:active:not(:disabled) { background: var(--fill-1); }
      `}</style>
    </div>
  );
}
