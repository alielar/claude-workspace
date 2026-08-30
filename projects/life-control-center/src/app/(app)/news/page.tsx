"use client";

/**
 * /news — Daily Brief, phone first (Phase 6 upgrade).
 *
 *   WORTH YOUR TIME — the standout story of each interest (keyword-matched to Ali's interests)
 *   VIDEOS          — fresh uploads from the chosen YouTube channels (2 per interest), open in the YouTube app
 *   BY INTEREST     — Football · Geopolitics · Business · Tech & AI, 5 stories each, tap to expand
 *
 * Generated once a day by the 06:00 cron (RSS + YouTube feeds, AI summaries). Cached on the phone:
 * the last brief shows instantly and offline; Refresh is the only manual trigger.
 * Archive drawer shows the last 30 days (DB-only reads).
 */

import { useState, useCallback } from "react";
import Link from "next/link";
import { useCached, fetchJson } from "@/lib/local/store";
import type { NewsBrief, NewsStory, NewsVideo } from "@/lib/news-brief";

// ─── Types ────────────────────────────────────────────────────────────────────

type ArchiveEntry = {
  date: string;
  storyCount: number;
  topHeadline: string;
  generatedAt: string;
};

// ─── Column config ────────────────────────────────────────────────────────────

const COLUMNS = [
  { id: "football",    label: "Football",    color: "#F97316", categories: ["football"] },
  { id: "geopolitics", label: "Geopolitics", color: "#FF8A8A", categories: ["geopolitics"] },
  { id: "business",    label: "Business",    color: "#6FD49A", categories: ["business"] },
  { id: "tech",        label: "Tech & AI",   color: "#64FFDA", categories: ["tech", "ai"] },
];

// ─── Story card ───────────────────────────────────────────────────────────────

type DeepDive = {
  whatHappened: string;
  whyItMatters: string;
  context: string;
  whatsNext: string;
};

function StoryCard({ story, accentColor, index }: { story: NewsStory; accentColor: string; index: number }) {
  const [open, setOpen] = useState(false);
  // Use pre-generated deep dive if available, otherwise null
  const [deepDive, setDeepDive] = useState<DeepDive | null>(story.deepDive ?? null);
  const [loadingDive, setLoadingDive] = useState(false);

  let hostname = "";
  if (story.source) {
    try { hostname = new URL(story.source).hostname.replace("www.", ""); } catch { /* noop */ }
  }

  const summaryText = story.summary || "";
  const keyPoints: string[] = Array.isArray(story.keyPoints) ? story.keyPoints : [];
  const isTopStory = index === 0;

  // Fetch deep dive on-demand only if not pre-generated
  const fetchDiveIfNeeded = async () => {
    if (deepDive || loadingDive) return;
    setLoadingDive(true);
    try {
      const res = await fetch("/api/news/deep-dive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headline: story.headline, summary: summaryText, source: story.source }),
      });
      if (res.ok) {
        const data = await res.json();
        setDeepDive(data);
      }
    } catch { /* ignore */ }
    setLoadingDive(false);
  };

  // When expanded and no deep dive yet, fetch it automatically
  const handleToggle = () => {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen && !deepDive && !loadingDive) {
      fetchDiveIfNeeded();
    }
  };

  const DIVE_SECTIONS = [
    { key: "whatHappened", label: "What happened", icon: "📰" },
    { key: "whyItMatters", label: "Why it matters", icon: "💡" },
    { key: "context", label: "Context", icon: "🔗" },
    { key: "whatsNext", label: "What's next", icon: "👉" },
  ] as const;

  return (
    <div
      onClick={handleToggle}
      style={{
        padding: isTopStory ? "14px 0" : "12px 0",
        borderBottom: "1px solid var(--line)",
        cursor: "pointer",
        transition: "background 0.1s",
      }}
    >
      {/* Headline row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{
          fontSize: isTopStory ? 16.5 : 15.5,
          lineHeight: 1.4,
          minWidth: 0, overflowWrap: "anywhere",
          letterSpacing: "-0.01em",
          fontWeight: 600,
          color: "var(--ink)",
          flex: 1,
        } as React.CSSProperties}>
          {story.headline}
        </div>
        <svg
          width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{
            color: "var(--ink-4)",
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.15s",
            flexShrink: 0,
            marginTop: 3,
          }}
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>

      {/* Source domain + summary preview */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, minWidth: 0 }}>
        {story.featured && (
          <span style={{ fontSize: 10, color: "var(--warn)", flexShrink: 0, fontFamily: "var(--f-mono)", letterSpacing: "0.04em", textTransform: "uppercase", padding: "1px 5px", borderRadius: 3, border: "1px solid var(--warn)", opacity: 0.9 }}>★ worth it</span>
        )}
        {hostname && (
          <span style={{
            fontSize: 10, color: accentColor, flexShrink: 0,
            fontFamily: "var(--f-mono)", letterSpacing: "0.04em",
            textTransform: "uppercase",
            padding: "1px 5px", borderRadius: 3,
            background: `${accentColor}12`, border: `1px solid ${accentColor}25`,
          }}>
            {hostname}
          </span>
        )}
        {!open && summaryText && (
          <span style={{
            fontSize: 12.5, color: "var(--ink-3)", flex: 1, minWidth: 0,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {summaryText.slice(0, 120)}{summaryText.length > 120 ? "…" : ""}
          </span>
        )}
      </div>

      {/* Expanded: Summary + key points + deep dive + source */}
      {open && (
        <div style={{ marginTop: 10, borderLeft: `2px solid ${accentColor}40`, paddingLeft: 12 }}>
          {summaryText && (
            <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--ink-2)", margin: "0 0 10px 0" }}>
              {summaryText}
            </p>
          )}
          {keyPoints.length > 0 && (
            <ul style={{ margin: "0 0 10px 0", paddingLeft: 16 }}>
              {keyPoints.map((pt, i) => (
                <li key={i} style={{ fontSize: 14, lineHeight: 1.55, color: "var(--ink-2)", marginBottom: 4 }}>
                  {pt}
                </li>
              ))}
            </ul>
          )}

          {/* Deep dive analysis — pre-generated or fetched on expand */}
          {loadingDive && (
            <div style={{ fontSize: 11, color: "var(--ink-4)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ display: "inline-block", animation: "spin 1s linear infinite", fontSize: 12 }}>⟳</span>
              Analyzing...
            </div>
          )}
          {deepDive && (
            <div style={{
              marginBottom: 12, padding: "12px 14px", borderRadius: 10,
              background: `${accentColor}06`, border: `1px solid ${accentColor}15`,
              display: "flex", flexDirection: "column", gap: 10,
            }}>
              {DIVE_SECTIONS.map(({ key, label, icon }) => {
                const text = deepDive[key];
                if (!text) return null;
                return (
                  <div key={key}>
                    <div style={{ fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color: accentColor, fontWeight: 600, marginBottom: 3, fontFamily: "var(--f-mono)" }}>
                      {icon} {label}
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-2)" }}>{text}</div>
                  </div>
                );
              })}
            </div>
          )}

          {story.source && (
            <a
              href={story.source} target="_blank" rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ fontSize: 13.5, color: accentColor, display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 500, minHeight: 44 }}
            >
              Read full article
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Column skeleton ──────────────────────────────────────────────────────────

function ColumnSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} style={{ padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
          <div className="cc-skeleton" style={{ height: 13, borderRadius: 4, marginBottom: 6, width: "100%" }} />
          <div className="cc-skeleton" style={{ height: 13, borderRadius: 4, width: "70%" }} />
          <div className="cc-skeleton" style={{ height: 10, borderRadius: 3, width: "35%", marginTop: 8 }} />
        </div>
      ))}
    </>
  );
}

// ─── Archive drawer ───────────────────────────────────────────────────────────

function formatArchiveDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function ArchiveDrawer({
  open, onClose, entries, loading, onSelectDate, selectedDate,
}: {
  open: boolean;
  onClose: () => void;
  entries: ArchiveEntry[];
  loading: boolean;
  onSelectDate: (date: string) => void;
  selectedDate: string | null;
}) {
  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          onClick={onClose}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.4)",
            zIndex: 40,
            backdropFilter: "blur(2px)",
          }}
        />
      )}

      {/* Drawer panel */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: "min(320px, 90vw)",
        background: "var(--bg-chrome)",
        borderLeft: "1px solid var(--line)",
        zIndex: 41,
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.25s ease",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Drawer header */}
        <div style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--line)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-2)" }}>
            Archive
          </span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--ink-4)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Drawer list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading ? (
            <div style={{ padding: "32px 20px", textAlign: "center", fontSize: 12, color: "var(--ink-4)" }}>
              Loading…
            </div>
          ) : entries.length === 0 ? (
            <div style={{ padding: "32px 20px", textAlign: "center", fontSize: 12, color: "var(--ink-4)" }}>
              No past briefs yet
            </div>
          ) : (
            entries.map(entry => {
              const isSelected = selectedDate === entry.date;
              return (
                <div
                  key={entry.date}
                  onClick={() => { onSelectDate(entry.date); onClose(); }}
                  style={{
                    padding: "12px 20px",
                    borderBottom: "1px solid var(--line)",
                    cursor: "pointer",
                    background: isSelected ? "var(--fill-2)" : "transparent",
                    transition: "background 100ms",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: isSelected ? "var(--violet)" : "var(--ink-2)", letterSpacing: "0.02em" }}>
                      {formatArchiveDate(entry.date)}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "var(--f-mono)" }}>
                      {entry.storyCount}
                    </span>
                  </div>
                  {entry.topHeadline && (
                    <div style={{
                      fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.4,
                      overflow: "hidden", display: "-webkit-box",
                      WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                    } as React.CSSProperties}>
                      {entry.topHeadline}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}

// ─── Video card ───────────────────────────────────────────────────────────────

function ago(iso: string): string {
  const h = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 3600_000));
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function VideoCard({ v, color }: { v: NewsVideo; color: string }) {
  return (
    <a href={v.url} target="_blank" rel="noopener noreferrer" className="news-video" style={{ display: "grid", gridTemplateColumns: "112px minmax(0, 1fr)", gap: 12, alignItems: "center", textDecoration: "none", color: "inherit", padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
      <span style={{ position: "relative", display: "block", width: 112, aspectRatio: "16 / 9", borderRadius: 8, overflow: "hidden", background: "var(--fill-2)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- YouTube thumbnail, plain <img> keeps the bundle small */}
        <img src={v.thumbnail} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        <span aria-hidden style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ width: 30, height: 30, borderRadius: 99, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, paddingLeft: 2 }}>▶</span>
        </span>
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ fontSize: 14, lineHeight: 1.35, fontWeight: 500, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" } as React.CSSProperties}>{v.title}</span>
        <span style={{ display: "block", fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
          <span style={{ color }}>{v.channel}</span> · {ago(v.publishedAt)}
        </span>
      </span>
    </a>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function NewsPage() {
  // Local-first: the last brief shows instantly (also offline); a fresh copy
  // is fetched in the background. Nothing is generated on open — the 06:00
  // cron does that; the Refresh button is the only manual trigger.
  const { data: brief, loading, stale, setData: setBrief } = useCached<NewsBrief>(
    "news-brief",
    () => fetchJson<NewsBrief>("/api/news/generate")
  );
  const [generating, setGenerating] = useState(false);
  const [confirmRefresh, setConfirmRefresh] = useState(false);
  const [section, setSection] = useState<string | null>(null); // interest filter chip

  // Archive state
  const [archiveOpen, setArchiveOpen]     = useState(false);
  const [archiveList, setArchiveList]     = useState<ArchiveEntry[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [viewingDate, setViewingDate]     = useState<string | null>(null);
  const [viewingBrief, setViewingBrief]   = useState<NewsBrief | null>(null);
  const [viewingLoading, setViewingLoading] = useState(false);

  const generate = useCallback(async (force = false) => {
    setGenerating(true);
    setConfirmRefresh(false);
    const res = await fetch("/api/news/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force }),
    }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      if (data) setBrief(data);
    }
    setGenerating(false);
  }, [setBrief]);

  function openArchive() {
    setArchiveOpen(true);
    if (archiveList.length > 0) return;
    setArchiveLoading(true);
    fetch("/api/news/archive")
      .then(r => r.json())
      .then(data => setArchiveList(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setArchiveLoading(false));
  }

  async function loadDateBrief(date: string) {
    setViewingDate(date);
    setViewingBrief(null);
    setViewingLoading(true);
    const res = await fetch(`/api/news/archive?date=${date}`).catch(() => null);
    if (res?.ok) setViewingBrief(await res.json());
    setViewingLoading(false);
  }
  function backToToday() { setViewingDate(null); setViewingBrief(null); setViewingLoading(false); }
  function handleRefreshClick() {
    if (!brief) { generate(true); return; }
    const ageMs = Date.now() - new Date(brief.generatedAt).getTime();
    if (ageMs < 3600000) setConfirmRefresh(true); else generate(true);
  }

  const isViewingPast = viewingDate !== null;
  const displayedBrief = isViewingPast ? viewingBrief : brief;
  const displayedLoading = isViewingPast ? viewingLoading : loading;

  const dateLabel = displayedBrief
    ? new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Madrid" }).format(new Date(displayedBrief.date + "T12:00:00"))
    : new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Madrid" }).format(new Date());
  const genTime = displayedBrief ? new Date(displayedBrief.generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : null;

  const columns = COLUMNS.map(col => ({
    ...col,
    stories: (displayedBrief?.stories ?? []).filter(s => col.categories.includes(s.category)),
    videos: (displayedBrief?.videos ?? []).filter(v => col.categories.includes(v.category)),
  })).filter(col => col.stories.length > 0 || col.videos.length > 0 || displayedLoading);

  // Featured: one flagged story per interest; if the generator flagged none (old brief), fall back to the first story.
  const featured = columns.flatMap(col => {
    const s = col.stories.find(x => x.featured) ?? col.stories[0];
    return s ? [{ story: s, col }] : [];
  });
  const videos = displayedBrief?.videos ?? [];
  const shown = section ? columns.filter(c => c.id === section) : columns;

  return (
    <div style={{ display: "grid", gap: 18, paddingBottom: 24, maxWidth: "100%", minWidth: 0, overflowX: "hidden" }}>

      {/* Page title */}
      <div className="cc-pagetitle" style={{ marginBottom: 0 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600 }}>News</h1>
          <div className="sub">
            {dateLabel}
            {genTime && !isViewingPast ? ` · ${genTime}` : ""}
            {stale && !isViewingPast ? " · saved copy" : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button className="cc-btn cc-btn-ghost" onClick={openArchive} style={{ minHeight: 40, borderRadius: 12 }} aria-label="Archive">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
          </button>
          {!isViewingPast && (
            <button className="cc-btn cc-btn-ghost" onClick={handleRefreshClick} disabled={generating || loading} style={{ minHeight: 40, borderRadius: 12 }} aria-label="Refresh">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: generating ? "spin 1s linear infinite" : "none" }}>
                <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {confirmRefresh && (
        <div className="cc-card"><div className="cc-card-body" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span style={{ fontSize: 13, color: "var(--ink-2)" }}>Today&apos;s brief is fresh ({genTime}). Rebuild it anyway?</span>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button className="cc-btn cc-btn-ghost" onClick={() => setConfirmRefresh(false)} style={{ minHeight: 40 }}>Cancel</button>
            <button className="cc-btn cc-btn-primary" onClick={() => generate(true)} style={{ minHeight: 40 }}>Refresh</button>
          </div>
        </div></div>
      )}

      {isViewingPast && (
        <div className="cc-card" style={{ borderColor: "var(--violet)" }}><div className="cc-card-body" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span style={{ fontSize: 13, color: "var(--ink-2)" }}>Viewing {formatArchiveDate(viewingDate!)}</span>
          <button className="cc-btn cc-btn-ghost" onClick={backToToday} style={{ minHeight: 40 }}>‹ Back to today</button>
        </div></div>
      )}

      {generating && (
        <div className="cc-card"><div className="cc-card-body" style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 14, color: "var(--ink-2)" }}>Building today&apos;s brief… about half a minute.</div>
          {[0, 1, 2].map(i => <div key={i} className="cc-skeleton" style={{ height: 44 }} />)}
        </div></div>
      )}

      {!generating && !displayedLoading && !displayedBrief && (
        <div className="cc-card"><div className="cc-card-body" style={{ fontSize: 14, color: "var(--ink-3)", lineHeight: 1.6 }}>
          No brief yet. It arrives every morning around 08:00; tap the refresh button to build one now.
        </div></div>
      )}

      {/* Worth your time */}
      {!generating && (displayedLoading || featured.length > 0) && (
        <section className="cc-card">
          <div className="cc-card-head"><span className="title" style={{ color: "var(--warn)" }}>★ Worth your time</span><span className="tail">one per interest</span></div>
          <div style={{ padding: "0 16px" }}>
            {displayedLoading && <ColumnSkeleton />}
            {!displayedLoading && featured.map(({ story, col }) => (
              <div key={col.id} style={{ borderLeft: `2px solid ${col.color}`, paddingLeft: 12, margin: "4px 0" }}>
                <div style={{ fontSize: 10, fontFamily: "var(--f-mono)", letterSpacing: "0.1em", textTransform: "uppercase", color: col.color, marginTop: 10 }}>{col.label}</div>
                <StoryCard story={story} accentColor={col.color} index={0} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Videos */}
      {!generating && !displayedLoading && videos.length > 0 && (
        <section className="cc-card">
          <div className="cc-card-head"><span className="title">▶ Videos</span><span className="tail">opens YouTube</span></div>
          <div style={{ padding: "0 16px" }}>
            {videos.map(v => <VideoCard key={v.id} v={v} color={COLUMNS.find(c => c.categories.includes(v.category))?.color ?? "var(--ink-2)"} />)}
          </div>
        </section>
      )}

      {/* Interest chips */}
      {!generating && columns.length > 1 && (
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
          {[{ id: null as string | null, label: "All", color: "var(--ink-2)" }, ...columns.map(c => ({ id: c.id as string | null, label: c.label, color: c.color }))].map(c => (
            <button key={c.id ?? "all"} onClick={() => setSection(c.id)} className="cc-pill" style={{ minHeight: 34, padding: "0 12px", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap", borderColor: section === c.id ? c.color : undefined, color: section === c.id ? "var(--ink)" : undefined }}>
              {c.label}
            </button>
          ))}
        </div>
      )}

      {/* By interest */}
      {!generating && shown.map(col => (
        <section key={col.id} className="cc-card">
          <div className="cc-card-head">
            <span className="title" style={{ color: col.color }}>{col.label}</span>
            <span className="tail">{displayedLoading ? "—" : `${col.stories.length} stories`}</span>
          </div>
          <div style={{ padding: "0 16px" }}>
            {displayedLoading ? <ColumnSkeleton /> : col.stories.length === 0 ? (
              <div style={{ padding: "16px 0", fontSize: 13, color: "var(--ink-4)" }}>No stories today</div>
            ) : col.stories.map((s, i) => <StoryCard key={i} story={s} accentColor={col.color} index={i} />)}
          </div>
        </section>
      ))}

      {displayedBrief && !displayedLoading && !generating && (
        <div style={{ color: "var(--ink-4)", fontSize: 11.5, letterSpacing: "0.02em", display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span>RSS + YouTube feeds · summaries by AI · no editorial opinion</span>
          <Link href="/settings" style={{ color: "var(--ink-3)", textDecoration: "none", whiteSpace: "nowrap" }}>Topics & channels ›</Link>
        </div>
      )}

      <ArchiveDrawer open={archiveOpen} onClose={() => setArchiveOpen(false)} entries={archiveList} loading={archiveLoading} onSelectDate={loadDateBrief} selectedDate={viewingDate} />

      <style>{`
        @keyframes spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }
        .news-video:last-child { border-bottom: none !important; }
        .news-video:active { opacity: 0.7; }
      `}</style>
    </div>
  );
}
