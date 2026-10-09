"use client";

/**
 * /news · rebuilt 2026-10-03 (Ali) · on the PHONE three parts behind a chip row since 2026-10-04
 * ("compartmentalize"), remembered in `cc-news-part`: Videos (daily picks · watch later · a Watched
 * fold) · Weekly brief (read or listen) · Football. On the LAPTOP (REDESIGN 2026-10-07, the prototype
 * Ali approved · `.cc-wide` + `.cc-cols`, no chips): the videos as a GRID on the left (the two daily
 * picks first, then Watch later), the weekly brief and the football on the right, and a video PLAYS
 * INSIDE THE HUB (`Player`, a YouTube embed above the columns) and marks itself watched · the tick
 * still undoes it; the phone keeps opening YouTube. A video or highlight is marked watched BY HAND with the tick on its row
 * (tapping it only plays it); the tick undoes itself. Shorts never appear (videos.ts checks each id).
 * The parts, top to bottom:
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

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCached, fetchJson } from "@/lib/local/store";
import { useHighlights, youtubeUrl } from "@/lib/news/useHighlights";
import { useVideos } from "@/lib/news/useVideos";
import { PickCard, VideoRow, VideoTile, WatchedTick } from "@/components/news/VideoCards";
import { useLaptop } from "@/lib/useLaptop";
import type { Video } from "@/lib/news/videos";
import type { NewsStory } from "@/lib/news-brief";
import type { WeeklyBrief } from "@/lib/news/weekly";
import type { Highlight, HighlightGroup } from "@/lib/news/highlights";
import { checklistToday } from "@/lib/checklist/day";
import { useNow } from "@/lib/useClientValue";
import { useProfile } from "@/lib/profile/useProfile";

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

function HighlightRow({ h, onWatch }: { h: Highlight; onWatch: (id: string, watched: boolean) => void }) {
  if (h.pending) return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", minHeight: 56, padding: "8px 16px", borderBottom: "1px solid var(--line)", opacity: 0.7 }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 16, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.home} vs {h.away}</span>
        <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)", marginTop: 2 }}>{h.context} · highlights not up yet</span>
      </span>
      <span aria-hidden style={{ width: 30, height: 30, borderRadius: 99, border: "1px dashed var(--line-strong)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-4)", fontSize: 13 }}>…</span>
    </div>
  );
  // Tapping the match plays it and marks nothing; the tick on the right is the "watched" mark
  // (Ali 2026-10-04: "sometimes I watched the game, no need for the highlights · a little mark").
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 4, alignItems: "center", borderBottom: "1px solid var(--line)", opacity: h.watched ? 0.5 : 1 }}>
      <a href={youtubeUrl(h.videoId)} target="_blank" rel="noopener noreferrer"
        style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, alignItems: "center", minHeight: 56, padding: "8px 0 8px 16px", textDecoration: "none", color: "inherit", minWidth: 0 }}>
        <span aria-hidden style={{ width: 30, height: 30, borderRadius: 99, background: "var(--fill-2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-2)", fontSize: 13, paddingLeft: 2 }}>▶</span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 16, fontWeight: h.watched ? 400 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: h.watched ? "var(--ink-3)" : "var(--ink)" }}>{h.home} vs {h.away}</span>
          <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)", marginTop: 2 }}>{h.context}{h.watched ? " · watched" : ""}</span>
        </span>
      </a>
      <span style={{ paddingRight: 4 }}><WatchedTick on={!!h.watched} onToggle={() => onWatch(h.videoId, !h.watched)} label={`${h.home} vs ${h.away}`} /></span>
    </div>
  );
}

function HighlightsSection({ label, items, onWatch }: { label: string; items: Highlight[]; onWatch: (id: string, watched: boolean) => void }) {
  // Watched rows sit behind a count (2026-10-08: six greyed rows under "all watched" were clutter) · open the
  // fold to untick one. The open rows show six at a time.
  const [showAll, setShowAll] = useState(false);
  const [showWatched, setShowWatched] = useState(false);
  const open = items.filter((h) => !h.watched), watched = items.filter((h) => h.watched);
  const unwatched = open.filter((h) => !h.pending).length;
  const shown = showAll ? open : open.slice(0, 6);
  return (
    <section className="cc-card">
      <div className="cc-card-head"><span className="title">{label}</span><span className="tail">{items.length === 0 ? "nothing new" : unwatched === 0 ? "all watched" : `${unwatched} to watch`}</span></div>
      {items.length > 0 && (
        <div>
          {shown.map((h) => <HighlightRow key={h.videoId} h={h} onWatch={onWatch} />)}
          {open.length > 6 && (
            <button onClick={() => setShowAll((v) => !v)} style={{ width: "100%", minHeight: 44, background: "transparent", border: "none", color: "var(--ink-3)", font: "inherit", fontSize: 14, cursor: "pointer" }}>
              {showAll ? "Show fewer" : `Show all ${open.length}`}
            </button>
          )}
          {watched.length > 0 && (
            <>
              <button onClick={() => setShowWatched((v) => !v)} aria-expanded={showWatched} style={{ width: "100%", minHeight: 44, background: "transparent", border: "none", color: "var(--ink-4)", font: "inherit", fontSize: 14, cursor: "pointer", textAlign: "left", padding: "0 4px" }}>
                {watched.length} watched <span aria-hidden style={{ display: "inline-block", transition: "transform var(--t-2) var(--easeOut)", transform: showWatched ? "rotate(90deg)" : "none", marginLeft: 4 }}>›</span>
              </button>
              {showWatched && watched.map((h) => <HighlightRow key={h.videoId} h={h} onWatch={onWatch} />)}
            </>
          )}
        </div>
      )}
    </section>
  );
}

/** The laptop's player · a YouTube embed, the title, the way out to YouTube, close. */
function Player({ v, onClose }: { v: Video; onClose: () => void }) {
  return (
    <section className="cc-card news-player cc-rise">
      <div className="news-player-box">
        <iframe src={`https://www.youtube-nocookie.com/embed/${v.videoId}?autoplay=1&rel=0&modestbranding=1`} title={v.title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
      </div>
      <div className="cc-card-body" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto", gap: 12, alignItems: "center" }}>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 16, fontWeight: 600, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.title}</span>
          <span style={{ display: "block", fontSize: 13.5, color: "var(--ink-3)" }}>{v.channel} · marked watched</span>
        </span>
        <a href={`https://www.youtube.com/watch?v=${v.videoId}`} target="_blank" rel="noopener noreferrer" className="cc-btn cc-btn-ghost" style={{ minHeight: 38, padding: "0 12px", borderRadius: 10, fontSize: 14, textDecoration: "none" }}>YouTube ↗</a>
        <button type="button" onClick={onClose} className="cc-btn cc-btn-secondary" aria-label="Close the player" style={{ minHeight: 38, minWidth: 38, padding: 0, borderRadius: 10 }}>✕</button>
      </div>
    </section>
  );
}

// ─── Podcasts ─────────────────────────────────────────────────────────────────

type Chapter = { title: string; startSec: number };
type Episode = { date: string; status: "pending" | "ready" | "failed"; script: string | null; audioUrl: string | null; attempts: number; chapters: Chapter[]; durationSec: number | null };

// ─── Page ─────────────────────────────────────────────────────────────────────

type WeeklyFeed = { brief: WeeklyBrief | null; episode: Episode | null; weeks: { week: string; from: string; to: string; label: string }[] };
type NewsPart = "videos" | "brief" | "football";

export default function NewsPage() {
  const today = checklistToday();
  const now = useNow();
  const { feed, loading: videosLoading, markWatched } = useVideos();
  const { data: weekly, loading: weeklyLoading } = useCached<WeeklyFeed>("news-weekly", () => fetchJson<WeeklyFeed>("/api/news/weekly"));
  const { items: highlights, markWatched: markHighlight } = useHighlights();
  const [laterAll, setLaterAll] = useState(false);
  const laptop = useLaptop();
  // A guest (2026-10-09): their own channels on one shelf, no daily picks, football by their choice.
  const { profile, primary } = useProfile();
  const guest = !!profile && !primary;
  const football = profile ? profile.football : true;
  const [playing, setPlaying] = useState<Video | null>(null);
  const play = (v: Video) => { setPlaying(v); if (!v.watched) markWatched(v.videoId, true); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const [section, setSection] = useState<string | null>(null);
  const [showWatched, setShowWatched] = useState(false);
  // Three parts (Ali 2026-10-04: "compartmentalize · the videos, the written news with the podcast, the football"), remembered on the phone.
  const [part, setPartState] = useState<NewsPart>("videos");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading localStorage after mount
    try { const p = localStorage.getItem("cc-news-part"); if (p === "brief" || p === "football") setPartState(p); } catch { /* ignore */ }
  }, []);
  const setPart = (p: NewsPart) => { setPartState(p); try { localStorage.setItem("cc-news-part", p); } catch { /* ignore */ } };
  const watchedList = feed?.watched ?? [];
  const unwatchedHl = highlights.filter((h) => !h.watched && !h.pending).length;

  const later = feed?.later ?? [];
  const laterShown = laterAll ? later : later.slice(0, 6);
  const brief = weekly?.brief ?? null;
  const ep = weekly?.episode ?? null;
  const sections = brief ? (section ? brief.sections.filter((s) => s.key === section) : brief.sections) : [];

  const picks = (feed?.picks ?? []).map((p, i) => ({ v: p.video, label: i === 0 ? "AI & Tech" : "Global news" })).filter((p): p is { v: Video; label: string } => !!p.v);
  const videosPhone = (
    <>
      {/* 1 · Daily picks (Ali's two star channels · a guest has none) */}
      {(!feed || feed.picks.length > 0) && <div style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-3)", padding: "0 2px" }}>Daily picks</span>
        {videosLoading && !feed ? (
          <div style={{ display: "grid", gap: 12 }}>{[0, 1].map((i) => <div key={i} className="cc-skeleton" style={{ aspectRatio: "16 / 10", borderRadius: 14 }} />)}</div>
        ) : (
          <div className="news-picks" style={{ display: "grid", gap: 12 }}>
            {(feed?.picks ?? []).map((p, i) => <PickCard key={p.channel.id} label={i === 0 ? "AI & Tech" : "Global news"} v={p.video} onWatch={markWatched} now={now} />)}
          </div>
        )}
      </div>}

      {/* 2 · Watch later */}
      <section className="cc-card">
        <div className="cc-card-head"><span className="title">{guest ? "Your channels" : "Watch later"}</span><span className="tail">{later.length === 0 ? (feed ? (guest && !watchedList.length ? "add channels in Settings" : "all caught up") : "…") : `${later.length} · last two weeks`}</span></div>
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

      {/* Watched · recently ticked, so a tick can be undone */}
      {watchedList.length > 0 && (
        <section className="cc-card">
          <button onClick={() => setShowWatched((v) => !v)} aria-expanded={showWatched} className="cc-card-head" style={{ width: "100%", background: "none", color: "inherit", cursor: "pointer", font: "inherit", borderLeft: "none", borderRight: "none", borderTop: "none", borderBottom: showWatched ? undefined : "none", borderRadius: showWatched ? undefined : "inherit" }}>
            <span className="title">Watched</span><span className="tail">{watchedList.length} <span aria-hidden style={{ display: "inline-block", transition: "transform var(--t-2) var(--easeOut)", transform: showWatched ? "rotate(90deg)" : "none", marginLeft: 6 }}>›</span></span>
          </button>
          {showWatched && <div>{watchedList.map((v, i) => <VideoRow key={v.videoId} v={v} onWatch={markWatched} now={now} last={i === watchedList.length - 1} />)}</div>}
        </section>
      )}
    </>
  );
  const videosLaptop = (
    <section className="cc-card">
      <div className="cc-card-head"><span className="title">{guest ? "Your channels" : "Daily picks and Watch later"}</span><span className="tail">{later.length === 0 ? (feed ? "all caught up" : "…") : `${later.length} to watch · plays here`}</span></div>
      <div className="cc-card-body">
        {videosLoading && !feed ? (
          <div className="news-grid">{[0, 1, 2, 3].map((i) => <div key={i} className="cc-skeleton" style={{ aspectRatio: "16 / 10", borderRadius: 12 }} />)}</div>
        ) : (
          <div className="news-grid">
            {picks.map((p) => <VideoTile key={p.v.videoId} v={p.v} label={p.label} onPlay={play} onWatch={markWatched} now={now} playing={playing?.videoId === p.v.videoId} />)}
            {laterShown.map((v) => <VideoTile key={v.videoId} v={v} onPlay={play} onWatch={markWatched} now={now} playing={playing?.videoId === v.videoId} />)}
          </div>
        )}
        {later.length > 6 && (
          <button onClick={() => setLaterAll((v) => !v)} style={{ width: "100%", minHeight: 44, marginTop: 6, background: "transparent", border: "none", color: "var(--ink-3)", font: "inherit", fontSize: 14, cursor: "pointer" }}>
            {laterAll ? "Show fewer" : `Show all ${later.length}`}
          </button>
        )}
        {watchedList.length > 0 && (
          <div style={{ marginTop: 10, borderTop: "1px solid var(--line)" }}>
            <button onClick={() => setShowWatched((v) => !v)} aria-expanded={showWatched} style={{ width: "100%", minHeight: 44, background: "none", border: "none", color: "var(--ink-3)", font: "inherit", fontSize: 14, cursor: "pointer", textAlign: "left", display: "flex", justifyContent: "space-between" }}>
              <span>Watched · {watchedList.length}</span><span aria-hidden style={{ display: "inline-block", transition: "transform var(--t-2) var(--easeOut)", transform: showWatched ? "rotate(90deg)" : "none" }}>›</span>
            </button>
            {showWatched && <div className="news-grid">{watchedList.map((v) => <VideoTile key={v.videoId} v={v} onPlay={play} onWatch={markWatched} now={now} playing={playing?.videoId === v.videoId} />)}</div>}
          </div>
        )}
      </div>
    </section>
  );
  const briefPart = (
    <>
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
    </>
  );
  const footballPart = (
    <>
        {GROUPS.map((g) => <HighlightsSection key={g.key} label={g.label} items={highlights.filter((h) => (h.group ?? (h.national ? "national" : "europe")) === g.key)} onWatch={markHighlight} />)}
        <div style={{ fontSize: 13.5, color: "var(--ink-4)", padding: "0 2px" }}>Matchup and context only, never a score.</div>
    </>
  );

  return (
    <div className="cc-wide" style={{ display: "grid", gap: 18, paddingBottom: 24, maxWidth: "100%", minWidth: 0, overflowX: "hidden" }}>
      <div className="cc-pagetitle" style={{ marginBottom: 0 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600 }}>News</h1>
          <div className="sub">{new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Madrid" }).format(new Date(today + "T12:00:00"))}{later.length ? ` · ${later.length} to watch` : ""}{unwatchedHl ? ` · ${unwatchedHl} highlight${unwatchedHl === 1 ? "" : "s"}` : ""}</div>
        </div>
      </div>

      {laptop && playing && <Player v={playing} onClose={() => setPlaying(null)} />}

      {laptop ? (
        <div className="cc-cols">
          <div className="cc-stack">{videosLaptop}{football && footballPart}</div>
          <div className="cc-stack">{briefPart}</div>
        </div>
      ) : (
        <>
          <div role="tablist" aria-label="News" style={{ display: "flex", gap: 8 }}>
            {([{ key: "videos", label: "Videos", tail: later.length ? String(later.length) : "" }, { key: "brief", label: "Weekly brief", tail: "" }, ...(football ? [{ key: "football", label: "Football", tail: unwatchedHl ? String(unwatchedHl) : "" }] : [])] as { key: NewsPart; label: string; tail: string }[]).map((p) => (
              <button key={p.key} role="tab" aria-selected={part === p.key} onClick={() => setPart(p.key)} className="cc-pill"
                style={{ minHeight: 36, padding: "0 14px", fontSize: 15, fontWeight: 500, cursor: "pointer", border: "1px solid var(--line)", transition: "background var(--t-2) var(--easeOut), color var(--t-2) var(--easeOut)", background: part === p.key ? "var(--accent-soft)" : "transparent", color: part === p.key ? "var(--ink)" : "var(--ink-3)" }}>
                {p.label}{p.tail ? <span className="tabular-nums" style={{ marginLeft: 6, fontSize: 13, color: part === p.key ? "var(--violet)" : "var(--ink-4)" }}>{p.tail}</span> : null}
              </button>
            ))}
          </div>
          {part === "videos" && <div key="videos" style={{ display: "grid", gap: 18 }}>{videosPhone}</div>}
          {part === "brief" && <div key="brief" style={{ display: "grid", gap: 18 }}>{briefPart}</div>}
          {part === "football" && football && <div key="football" style={{ display: "grid", gap: 18 }}>{footballPart}</div>}
          {part === "football" && !football && <div key="videos" style={{ display: "grid", gap: 18 }}>{videosPhone}</div>}
        </>
      )}

      <div style={{ color: "var(--ink-4)", fontSize: 14, display: "flex", justifyContent: "flex-end", gap: 12 }}>
        <Link href="/settings" style={{ color: "var(--ink-3)", textDecoration: "none", whiteSpace: "nowrap", minHeight: 44, display: "inline-flex", alignItems: "center" }}>Channels ›</Link>
      </div>

      <style>{`
        .news-pick:active, .news-later:active { opacity: 0.75; }
        .news-later:last-child { border-bottom: none !important; }
        @media (min-width: 720px) { .news-picks { grid-template-columns: 1fr 1fr; } }
      `}</style>
    </div>
  );
}
