"use client";

/**
 * /news · rebuilt 2026-10-03 (Ali). Top to bottom:
 *
 *   DAILY PICKS   · two video cards a day: the latest upload of The AI Daily Brief (AI & Tech) and
 *                   of TLDR News Global (Global news). Thumbnail, title, channel, length. Tap opens
 *                   YouTube and marks it watched (server side, every device agrees).
 *   WATCH LATER   · uploads of the last two weeks from Ali's curated channels, in his priority
 *                   order, same cards; watched ones drop off. Folded past the first six.
 *   WEEKLY BRIEF  · the previous week's developments in Tech & AI · Business · Geopolitics, each
 *                   story expandable to its in-depth analysis (what happened, why it matters,
 *                   context, implications, what's next). Read it, or listen: the weekly podcast
 *                   (the main podcast now) plays in /podcast?date=<week>.
 *   (The DAILY PODCAST row went on 2026-10-04 · daily episodes are no longer made.)
 *   HIGHLIGHTS    · football, spoiler-free, in three sections: European clubs · Moroccan clubs ·
 *                   International teams. Matchup + context only, never a score or a thumbnail.
 *
 * The daily written news (story lists by interest) is gone from the page: the daily brief (RSS
 * only, no AI since 2026-10-04) is still generated at 06:00 because the weekly brief is built from it.
 * Everything paints from the phone's saved copy first.
 */

import { useState } from "react";
import Link from "next/link";
import { useCached, fetchJson } from "@/lib/local/store";
import { useHighlights, youtubeUrl } from "@/lib/news/useHighlights";
import { useVideos } from "@/lib/news/useVideos";
import { PickCard, VideoRow } from "@/components/news/VideoCards";
import type { NewsStory } from "@/lib/news-brief";
import type { WeeklyBrief } from "@/lib/news/weekly";
import type { Highlight, HighlightGroup } from "@/lib/news/highlights";
import { checklistToday } from "@/lib/checklist/day";
import { useNow } from "@/lib/useClientValue";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const prettyRange = (from: string, to: string) => {
  const f = new Date(`${from}T12:00:00Z`), t = new Date(`${to}T12:00:00Z`);
  const fmt = (d: Date, m: boolean) => new Intl.DateTimeFormat("en-GB", { day: "numeric", ...(m ? { month: "long" } : {}), timeZone: "UTC" }).format(d);
  return `${fmt(f, f.getUTCMonth() !== t.getUTCMonth())} to ${fmt(t, true)}`;
};

// ─── Weekly story (the in-depth read) ─────────────────────────────────────────

const DIVE_SECTIONS = [
  { key: "whatHappened", label: "What happened" },
  { key: "whyItMatters", label: "Why it matters" },
  { key: "context", label: "Context" },
  { key: "implications", label: "Implications" },
  { key: "whatsNext", label: "What's next" },
] as const;

function WeeklyStory({ story, color, last }: { story: NewsStory; color: string; last: boolean }) {
  const [open, setOpen] = useState(false);
  let host = "";
  try { host = story.source ? new URL(story.source).hostname.replace("www.", "") : ""; } catch { /* none */ }
  return (
    <div style={{ padding: "12px 0", borderBottom: last ? "none" : "1px solid var(--line)" }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "start", width: "100%", background: "transparent", border: "none", padding: 0, textAlign: "left", color: "inherit", font: "inherit", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
        <span style={{ display: "grid", gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 16.5, fontWeight: 600, lineHeight: 1.35, letterSpacing: "-0.01em" }}>{story.headline}</span>
          <span style={{ fontSize: 15, lineHeight: 1.55, color: "var(--ink-2)" }}>{story.summary}</span>
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--ink-4)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s", marginTop: 6 }}><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && story.deepDive && (
        <div style={{ marginTop: 12, borderLeft: `2px solid ${color}55`, paddingLeft: 12, display: "grid", gap: 12 }}>
          {DIVE_SECTIONS.map(({ key, label }) => {
            const text = story.deepDive?.[key];
            if (!text) return null;
            return (
              <div key={key}>
                <div style={{ fontSize: 12.5, color, fontWeight: 600, marginBottom: 3, fontFamily: "var(--f-mono)", letterSpacing: "0.04em", textTransform: "uppercase" }}>{label}</div>
                <div style={{ fontSize: 15.5, lineHeight: 1.6, color: "var(--ink-2)" }}>{text}</div>
              </div>
            );
          })}
          {story.source && (
            <a href={story.source} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14.5, color, display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 500, minHeight: 40, textDecoration: "none" }}>
              Read the source{host ? ` · ${host}` : ""} ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Football highlights · three sections (2026-10-03) ────────────────────────

const GROUPS: { key: HighlightGroup; label: string }[] = [
  { key: "europe",   label: "European clubs" },
  { key: "morocco",  label: "Moroccan clubs" },
  { key: "national", label: "International teams" },
];

function HighlightRow({ h, onWatch }: { h: Highlight; onWatch: (id: string) => void }) {
  if (h.pending) return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", minHeight: 56, padding: "8px 16px", borderBottom: "1px solid var(--line)", opacity: 0.7 }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 16, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.home} vs {h.away}</span>
        <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)", marginTop: 2 }}>{h.context} · highlights not up yet</span>
      </span>
      <span aria-hidden style={{ width: 30, height: 30, borderRadius: 99, border: "1px dashed var(--line-strong)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-4)", fontSize: 13 }}>…</span>
    </div>
  );
  return (
    <a href={youtubeUrl(h.videoId)} target="_blank" rel="noopener noreferrer" onClick={() => { if (!h.watched) onWatch(h.videoId); }}
      style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", minHeight: 56, padding: "8px 16px", textDecoration: "none", color: "inherit", borderBottom: "1px solid var(--line)", opacity: h.watched ? 0.45 : 1 }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 16, fontWeight: h.watched ? 400 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: h.watched ? "var(--ink-3)" : "var(--ink)" }}>{h.home} vs {h.away}</span>
        <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)", marginTop: 2 }}>{h.context}{h.watched ? " · watched" : ""}</span>
      </span>
      <span aria-hidden style={{ width: 30, height: 30, borderRadius: 99, background: h.watched ? "transparent" : "var(--fill-2)", border: h.watched ? "1px solid var(--line-strong)" : "none", display: "flex", alignItems: "center", justifyContent: "center", color: h.watched ? "var(--ink-4)" : "var(--ink-2)", fontSize: 13, paddingLeft: h.watched ? 0 : 2 }}>{h.watched ? "✓" : "▶"}</span>
    </a>
  );
}

function HighlightsSection({ label, items, onWatch }: { label: string; items: Highlight[]; onWatch: (id: string) => void }) {
  const [showAll, setShowAll] = useState(false);
  const unwatched = items.filter((h) => !h.watched && !h.pending).length;
  const shown = showAll ? items : items.slice(0, 6);
  return (
    <section className="cc-card">
      <div className="cc-card-head"><span className="title">{label}</span><span className="tail">{items.length === 0 ? "nothing new" : unwatched === 0 ? "all watched" : `${unwatched} to watch`}</span></div>
      {items.length > 0 && (
        <div>
          {shown.map((h) => <HighlightRow key={h.videoId} h={h} onWatch={onWatch} />)}
          {items.length > 6 && (
            <button onClick={() => setShowAll((v) => !v)} style={{ width: "100%", minHeight: 44, background: "transparent", border: "none", color: "var(--ink-3)", font: "inherit", fontSize: 14, cursor: "pointer" }}>
              {showAll ? "Show fewer" : `Show all ${items.length}`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Podcasts ─────────────────────────────────────────────────────────────────

type Chapter = { title: string; startSec: number };
type Episode = { date: string; status: "pending" | "ready" | "failed"; script: string | null; audioUrl: string | null; attempts: number; chapters: Chapter[]; durationSec: number | null };

// ─── Page ─────────────────────────────────────────────────────────────────────

type WeeklyFeed = { brief: WeeklyBrief | null; episode: Episode | null; weeks: { week: string; from: string; to: string; label: string }[] };

export default function NewsPage() {
  const today = checklistToday();
  const now = useNow();
  const { feed, loading: videosLoading, markWatched } = useVideos();
  const { data: weekly, loading: weeklyLoading } = useCached<WeeklyFeed>("news-weekly", () => fetchJson<WeeklyFeed>("/api/news/weekly"));
  const { items: highlights, markWatched: markHighlight } = useHighlights();
  const [laterAll, setLaterAll] = useState(false);
  const [section, setSection] = useState<string | null>(null);

  const later = feed?.later ?? [];
  const laterShown = laterAll ? later : later.slice(0, 6);
  const brief = weekly?.brief ?? null;
  const ep = weekly?.episode ?? null;
  const sections = brief ? (section ? brief.sections.filter((s) => s.key === section) : brief.sections) : [];

  return (
    <div style={{ display: "grid", gap: 18, paddingBottom: 24, maxWidth: "100%", minWidth: 0, overflowX: "hidden" }}>
      <div className="cc-pagetitle" style={{ marginBottom: 0 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600 }}>News</h1>
          <div className="sub">{new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Madrid" }).format(new Date(today + "T12:00:00"))}</div>
        </div>
      </div>

      {/* 1 · Daily picks */}
      <div style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 12.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-4)", fontFamily: "var(--f-mono)", padding: "0 2px" }}>Daily picks</span>
        {videosLoading && !feed ? (
          <div style={{ display: "grid", gap: 12 }}>{[0, 1].map((i) => <div key={i} className="cc-skeleton" style={{ aspectRatio: "16 / 10", borderRadius: 14 }} />)}</div>
        ) : (
          <div className="news-picks" style={{ display: "grid", gap: 12 }}>
            {(feed?.picks ?? []).map((p, i) => <PickCard key={p.channel.id} label={i === 0 ? "AI & Tech" : "Global news"} v={p.video} onWatch={markWatched} now={now} />)}
          </div>
        )}
      </div>

      {/* 2 · Watch later */}
      <section className="cc-card">
        <div className="cc-card-head"><span className="title">Watch later</span><span className="tail">{later.length === 0 ? (feed ? "all caught up" : "…") : `${later.length} · last two weeks`}</span></div>
        {later.length > 0 && (
          <div>
            {laterShown.map((v) => <VideoRow key={v.videoId} v={v} onWatch={markWatched} now={now} />)}
            {later.length > 6 && (
              <button onClick={() => setLaterAll((v) => !v)} style={{ width: "100%", minHeight: 44, background: "transparent", border: "none", color: "var(--ink-3)", font: "inherit", fontSize: 14, cursor: "pointer" }}>
                {laterAll ? "Show fewer" : `Show all ${later.length}`}
              </button>
            )}
          </div>
        )}
      </section>

      {/* 3 · Weekly brief · read or listen */}
      <div style={{ display: "grid", gap: 10 }}>
        <div className="cc-pagetitle" style={{ marginBottom: 0, alignItems: "end" }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>Weekly brief</h2>
            <div className="sub">{brief ? `${prettyRange(brief.from, brief.to)} · ${brief.readMinutes} min read` : weeklyLoading ? "…" : "arrives on Sunday morning"}</div>
          </div>
          {brief && ep?.status === "ready" && ep.audioUrl && (
            <Link href={`/podcast?date=${brief.week}`} className="cc-btn cc-btn-primary" style={{ minHeight: 44, padding: "0 16px", borderRadius: 12, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
              ▶ Listen{ep.durationSec ? ` · ${Math.round(ep.durationSec / 60)} min` : ""}
            </Link>
          )}
        </div>
        {brief && brief.sections.length > 1 && (
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
            {[{ key: null as string | null, label: "All", color: "var(--ink-2)" }, ...brief.sections.map((s) => ({ key: s.key as string | null, label: s.label, color: s.color }))].map((c) => (
              <button key={c.key ?? "all"} onClick={() => setSection(c.key)} className="cc-pill" style={{ minHeight: 34, padding: "0 12px", fontSize: 15, cursor: "pointer", whiteSpace: "nowrap", borderColor: section === c.key ? c.color : undefined, color: section === c.key ? "var(--ink)" : undefined }}>
                {c.label}
              </button>
            ))}
          </div>
        )}
        {!brief && !weeklyLoading && (
          <div className="cc-card"><div className="cc-card-body" style={{ fontSize: 15, color: "var(--ink-3)", lineHeight: 1.6 }}>The first weekly brief is written on Sunday morning from the week&apos;s daily briefs.</div></div>
        )}
        {sections.map((sec) => (
          <section key={sec.key} className="cc-card">
            <div className="cc-card-head"><span className="title" style={{ color: sec.color }}>{sec.label}</span><span className="tail">{sec.stories.length} development{sec.stories.length === 1 ? "" : "s"}</span></div>
            <div style={{ padding: "0 16px" }}>
              {sec.stories.map((s, i) => <WeeklyStory key={i} story={s} color={sec.color} last={i === sec.stories.length - 1} />)}
            </div>
          </section>
        ))}
        {brief && weekly && weekly.weeks.length > 1 && (
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, fontSize: 13.5, color: "var(--ink-4)", alignItems: "center" }}>
            <span>Past weeks</span>
            {weekly.weeks.filter((w) => w.week !== brief.week).slice(0, 6).map((w) => (
              <Link key={w.week} href={`/podcast?date=${w.week}`} className="cc-pill" style={{ minHeight: 30, padding: "0 10px", fontSize: 13, whiteSpace: "nowrap", textDecoration: "none" }}>{w.label}</Link>
            ))}
          </div>
        )}
      </div>

      {/* 5 · Football highlights · three sections */}
      <div style={{ display: "grid", gap: 10 }}>
        <span style={{ fontSize: 12.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-4)", fontFamily: "var(--f-mono)", padding: "0 2px" }}>Football · spoiler-free</span>
        {GROUPS.map((g) => <HighlightsSection key={g.key} label={g.label} items={highlights.filter((h) => (h.group ?? (h.national ? "national" : "europe")) === g.key)} onWatch={markHighlight} />)}
      </div>

      <div style={{ color: "var(--ink-4)", fontSize: 14, display: "flex", justifyContent: "space-between", gap: 12 }}>
        <span>Videos open in YouTube · summaries by AI</span>
        <Link href="/settings" style={{ color: "var(--ink-3)", textDecoration: "none", whiteSpace: "nowrap" }}>Channels ›</Link>
      </div>

      <style>{`
        .news-pick:active, .news-later:active { opacity: 0.75; }
        .news-later:last-child { border-bottom: none !important; }
        @media (min-width: 720px) { .news-picks { grid-template-columns: 1fr 1fr; } }
      `}</style>
    </div>
  );
}
