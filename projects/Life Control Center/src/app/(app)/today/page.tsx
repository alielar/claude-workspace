"use client";

/**
 * /today — the home screen. Answers one question: what do I do right now?
 *
 * Renders instantly from the phone's local copy, refreshes in the background,
 * and every tick works offline (queued and synced later).
 *
 * Layout (phone first, single column):
 *   greeting + date + streak
 *   progress line
 *   NOW      — items for this part of the day (+ anytime), not yet done
 *   LATER    — the rest of today, collapsed to a compact list
 *   DONE     — what's already ticked, dimmed
 *   NEWS     — up to 4 headlines from the last brief (cached), tap → /news
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCached, fetchJson } from "@/lib/local/store";
import { sendOrQueue } from "@/lib/local/outbox";
import { useOnline } from "@/lib/useOnline";
import { checklistToday, dayPart, madridHour, type DayPart } from "@/lib/checklist/day";
import { itemColor, type ChecklistData, type ChecklistItem } from "@/lib/checklist/types";
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

// ─── Row ──────────────────────────────────────────────────────────────────────

function Row({ item, onToggle, compact = false }: {
  item: ChecklistItem;
  onToggle: (item: ChecklistItem) => void;
  compact?: boolean;
}) {
  const auto = item.source === "workout" || item.autoSource !== null;
  const done = item.completedToday;
  const accent = itemColor(item.color);

  return (
    <button
      type="button"
      onClick={() => !auto && onToggle(item)}
      disabled={auto}
      className="today-row"
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
        borderBottom: "1px solid var(--line)",
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
          borderStyle: item.source === "workout" ? "dashed" : "solid",
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
        {!compact && item.notes && (
          <span style={{ display: "block", fontSize: 12.5, color: "var(--ink-3)", marginTop: 2, lineHeight: 1.4 }}>
            {linkify(item.notes)}
          </span>
        )}
      </span>

      <span style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--ink-3)" }}>
        {auto && <span className="cc-pill" style={{ fontSize: 9.5, padding: "2px 6px" }}>auto</span>}
        {item.streak >= 2 && <span title={`${item.streak}-day streak`}>🔥 {item.streak}</span>}
      </span>
    </button>
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

  // When the outbox finishes syncing, pull fresh streaks.
  useEffect(() => {
    const h = () => refresh();
    window.addEventListener("cc:outbox-flushed", h);
    return () => window.removeEventListener("cc:outbox-flushed", h);
  }, [refresh]);

  // If the cached copy is from a previous day, the ticks no longer apply.
  const items = useMemo(() => {
    const list = data?.items ?? [];
    const cachedDay = typeof window !== "undefined" ? localStorage.getItem("cc:v1:checklist-day") : null;
    if (cachedDay && cachedDay !== today) return list.map((i) => ({ ...i, completedToday: false }));
    return list;
  }, [data, today]);
  useEffect(() => {
    try { if (data) localStorage.setItem("cc:v1:checklist-day", today); } catch {}
  }, [data, today]);

  const toggle = useCallback(async (item: ChecklistItem) => {
    const next = !item.completedToday;
    setData((prev) => ({
      ...(prev ?? { items: [], overallStreak: 0, monthlyPct: [], thirtyDayAvg: 0, bestStreak30: 0 }),
      items: (prev?.items ?? []).map((i) => i.id === item.id ? { ...i, completedToday: next } : i),
    }));
    try {
      await sendOrQueue({
        url: "/api/checklist/toggle",
        method: "POST",
        body: { itemId: item.id, completed: next, date: today },
        dedupeKey: `toggle:${item.id}:${today}`,
      });
    } catch {
      // server refused — put it back
      setData((prev) => ({
        ...(prev ?? { items: [], overallStreak: 0, monthlyPct: [], thirtyDayAvg: 0, bestStreak30: 0 }),
        items: (prev?.items ?? []).map((i) => i.id === item.id ? { ...i, completedToday: !next } : i),
      }));
    }
  }, [setData, today]);

  const total = items.length;
  const doneCount = items.filter((i) => i.completedToday).length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  const isNow = (i: ChecklistItem) => i.timeOfDay === part || i.timeOfDay === "anytime";
  const nowItems   = items.filter((i) => !i.completedToday && isNow(i));
  const laterItems = items.filter((i) => !i.completedToday && !isNow(i));
  const doneItems  = items.filter((i) => i.completedToday);

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
      <section className="cc-card">
        <div className="cc-card-head">
          <span className="title">{PART_LABEL[part]}</span>
          <Link href="/checklist" className="tail" style={{ textDecoration: "none", color: "var(--ink-3)" }}>Edit</Link>
        </div>
        <div style={{ padding: "0 14px" }}>
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
          {data && total > 0 && nowItems.length === 0 && (
            <div style={{ padding: "18px 0", fontSize: 14, color: "var(--pos)" }}>
              ✓ Nothing left for {PART_LABEL[part].toLowerCase()}.
            </div>
          )}
          {nowItems.map((item) => <Row key={item.id} item={item} onToggle={toggle} />)}
        </div>
      </section>

      {/* LATER */}
      {laterItems.length > 0 && (
        <section className="cc-card">
          <div className="cc-card-head">
            <span className="title">Later today</span>
            <span className="tail">{laterItems.length}</span>
          </div>
          <div style={{ padding: "0 14px" }}>
            {laterItems.map((item) => <Row key={item.id} item={item} onToggle={toggle} compact />)}
          </div>
        </section>
      )}

      {/* DONE */}
      {doneItems.length > 0 && (
        <section className="cc-card">
          <div className="cc-card-head">
            <span className="title">Done</span>
            <span className="tail">{doneItems.length}</span>
          </div>
          <div style={{ padding: "0 14px" }}>
            {doneItems.map((item) => <Row key={item.id} item={item} onToggle={toggle} compact />)}
          </div>
        </section>
      )}

      {/* NEWS */}
      <NewsCard today={today} />

      <style>{`
        .today-row:last-child { border-bottom: none !important; }
        .today-row:active:not(:disabled) { background: var(--fill-1); }
      `}</style>
    </div>
  );
}
