"use client";

/**
 * /today — the home screen. Answers one question: what do I do right now?
 *
 * Renders instantly from the phone's local copy, refreshes in the background,
 * and every tick works offline (queued and synced later).
 *
 * The day is the spine (spec §6): wake → stretch → breathe → supplements →
 * day → evening → magnesium → reading habit.
 *
 * Sections, phone first, single column:
 *   greeting + date + streak · progress line
 *   NOW        — routine + items for this part of the day (+ anytime), not done
 *   STILL OPEN — items from earlier today that weren't ticked (compact)
 *   BUILDING   — habits being built, only in their part of the day
 *   UP NEXT    — the next part of the day (compact) — evening items stay hidden in the morning
 *   DONE       — ticked today, dimmed
 *   NEWS       — 4 headlines from the last brief (cached) → /news
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCached, fetchJson } from "@/lib/local/store";
import { sendOrQueue } from "@/lib/local/outbox";
import { useOnline } from "@/lib/useOnline";
import { checklistToday, dayPart, madridHour, type DayPart } from "@/lib/checklist/day";
import { itemColor, BREATHING_VIDEO_URL, type ChecklistData, type ChecklistItem } from "@/lib/checklist/types";
import type { NewsBrief } from "@/lib/news-brief";

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
  if (item.routineKey === "stretch") return { label: "Start", href: "/stretch", external: false };
  if (item.routineKey === "breathe") return { label: "Video", href: BREATHING_VIDEO_URL, external: true };
  return null;
}

/** Notes for built-in steps are shown without the raw URL (the Video button carries it). */
function displayNotes(item: ChecklistItem): string | null {
  if (!item.notes) return null;
  if (item.routineKey === "breathe") return item.notes.replace(/https?:\/\/\S+/g, "").replace(/·\s*$/, "").trim() || null;
  return item.notes;
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function Row({ item, onToggle, compact = false }: {
  item: ChecklistItem;
  onToggle: (item: ChecklistItem) => void;
  compact?: boolean;
}) {
  const auto = item.source === "workout" || item.autoSource !== null;
  const done = item.completedToday;
  const accent = itemColor(item.color);
  const action = !done && !compact ? routineAction(item) : null;
  const notes = compact ? null : displayNotes(item);

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
            {item.emoji ? `${item.emoji} ` : ""}{item.title}
          </span>
          {notes && (
            <span style={{ display: "block", fontSize: 12.5, color: "var(--ink-3)", marginTop: 2, lineHeight: 1.4 }}>
              {linkify(notes)}
            </span>
          )}
        </span>

        <span style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--ink-3)" }}>
          {auto && <span className="cc-pill" style={{ fontSize: 9.5, padding: "2px 6px" }}>auto</span>}
          {item.streak >= 2 && <span title={`${item.streak}-day streak`}>🔥 {item.streak}</span>}
        </span>
      </button>

      {action && (
        action.external ? (
          <a
            href={action.href}
            target="_blank"
            rel="noopener noreferrer"
            className="cc-btn cc-btn-primary"
            style={{ alignSelf: "center", minHeight: 44, padding: "0 16px", borderRadius: 12, textDecoration: "none", marginLeft: 8 }}
          >
            ▶ {action.label}
          </a>
        ) : (
          <Link
            href={action.href}
            className="cc-btn cc-btn-primary"
            style={{ alignSelf: "center", minHeight: 44, padding: "0 16px", borderRadius: 12, textDecoration: "none", marginLeft: 8 }}
          >
            ▶ {action.label}
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

// ─── News card ────────────────────────────────────────────────────────────────

const NEWS_CATS: { label: string; match: string[]; color: string }[] = [
  { label: "Football",    match: ["football"],     color: "#F97316" },
  { label: "Geopolitics", match: ["geopolitics"],  color: "#FF8A8A" },
  { label: "Tech & AI",   match: ["tech", "ai"],   color: "#64FFDA" },
  { label: "Business",    match: ["business"],     color: "#6FD49A" },
];

function NewsCard({ today }: { today: string }) {
  const { data: brief, loading } = useCached<NewsBrief>(
    "news-brief",
    () => fetchJson<NewsBrief>("/api/news/generate")
  );

  const picks = useMemo(() => {
    if (!brief) return [];
    return NEWS_CATS.flatMap((c) => {
      const s = brief.stories.find((st) => c.match.includes(st.category));
      return s ? [{ ...c, headline: s.headline }] : [];
    });
  }, [brief]);

  const isOld = brief && brief.date !== today;

  return (
    <Link href="/news" className="cc-card" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
      <div className="cc-card-head">
        <span className="title">News</span>
        <span className="tail">{brief ? (isOld ? `from ${brief.date}` : "today") : loading ? "—" : "no brief yet"}</span>
      </div>
      <div className="cc-card-body" style={{ display: "grid", gap: 10 }}>
        {picks.length === 0 && (
          <span style={{ fontSize: 13, color: "var(--ink-3)" }}>
            {loading ? "Loading the last brief…" : "The brief arrives every morning. Tap to open News."}
          </span>
        )}
        {picks.map((p) => (
          <div key={p.label} style={{ display: "grid", gridTemplateColumns: "8px 1fr", gap: 10, alignItems: "start" }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: p.color, marginTop: 6 }} />
            <span style={{ fontSize: 14, lineHeight: 1.4, color: "var(--ink)" }}>
              <span style={{ fontSize: 10, fontFamily: "var(--f-mono)", letterSpacing: "0.08em", textTransform: "uppercase", color: p.color, marginRight: 8 }}>{p.label}</span>
              {p.headline}
            </span>
          </div>
        ))}
      </div>
    </Link>
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
      setData(patch(!next)); // server refused — put it back
    }
  }, [setData, today]);

  // ── Grouping ──────────────────────────────────────────────────────────────
  const counted = items.filter((i) => i.kind !== "habit");
  const total = counted.length;
  const doneCount = counted.filter((i) => i.completedToday).length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  const partOf = (i: ChecklistItem): DayPart | "anytime" => i.timeOfDay === "anytime" ? "anytime" : i.timeOfDay;
  const isNow = (i: ChecklistItem) => partOf(i) === part || partOf(i) === "anytime";
  const isEarlier = (i: ChecklistItem) => partOf(i) !== "anytime" && PART_ORDER[partOf(i) as DayPart] < PART_ORDER[part];
  const isNext = (i: ChecklistItem) => NEXT_PART[part] !== null && partOf(i) === NEXT_PART[part];

  const open = items.filter((i) => !i.completedToday);
  const nowItems   = open.filter((i) => i.kind !== "habit" && isNow(i));
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
            {greeting(hour)}<span className="grad-text">.</span>
          </h1>
          <div style={{ fontSize: 13.5, color: "var(--ink-3)", marginTop: 4 }}>
            {longDate(now)}
            {!online && <span style={{ color: "var(--warn)" }}> · offline, changes will sync</span>}
            {online && stale && <span> · showing saved copy</span>}
          </div>
        </div>
        {data && data.overallStreak > 0 && (
          <div className="cc-pill cc-pill-warn" style={{ fontSize: 13, padding: "6px 10px", whiteSpace: "nowrap" }}>
            🔥 {data.overallStreak} day{data.overallStreak === 1 ? "" : "s"}
          </div>
        )}
      </header>

      {/* Progress */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontFamily: "var(--f-mono)", color: "var(--ink-3)", marginBottom: 6 }}>
          <span>{loading && !data ? "—" : `${doneCount} / ${total} done`}</span>
          <span>{loading && !data ? "" : `${pct}%`}</span>
        </div>
        <div className="cc-progress-track" style={{ height: 4 }}>
          <div className="cc-progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* NOW */}
      <Card
        title={PART_LABEL[part]}
        tail={<Link href="/checklist" style={{ textDecoration: "none", color: "var(--ink-3)" }}>Edit</Link>}
      >
        {loading && !data && (
          <div style={{ padding: "12px 0", display: "grid", gap: 10 }}>
            {[0, 1, 2].map((i) => <div key={i} className="cc-skeleton" style={{ height: 44 }} />)}
          </div>
        )}
        {!loading && total === 0 && (
          <div style={{ padding: "18px 0", fontSize: 14, color: "var(--ink-3)" }}>
            No items yet. <Link href="/checklist" style={{ color: "var(--violet)" }}>Set up your checklist →</Link>
          </div>
        )}
        {allNowDone && (
          <div style={{ padding: "18px 0", fontSize: 14, color: "var(--pos)" }}>
            ✓ Nothing left for {PART_LABEL[part].toLowerCase()}.
          </div>
        )}
        {nowItems.map((item) => <Row key={item.id} item={item} onToggle={toggle} />)}
      </Card>

      {/* STILL OPEN (earlier today) */}
      {earlier.length > 0 && (
        <Card title="Still open from earlier" tail={earlier.length}>
          {earlier.map((item) => <Row key={item.id} item={item} onToggle={toggle} compact />)}
        </Card>
      )}

      {/* BUILDING */}
      {building.length > 0 && (
        <Card title="Building" tail="habits, own streak">
          {building.map((item) => <Row key={item.id} item={item} onToggle={toggle} />)}
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

      {/* NEWS */}
      <NewsCard today={today} />

      <style>{`
        .today-row:last-child { border-bottom: none !important; }
        .today-row > button:active:not(:disabled) { background: var(--fill-1); }
      `}</style>
    </div>
  );
}
