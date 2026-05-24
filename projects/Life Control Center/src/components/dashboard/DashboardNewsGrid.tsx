"use client";

/**
 * Dashboard News Grid — 4-column layout matching the /news page.
 * Renders all 20 stories grouped by category with expandable cards.
 *
 * Self-contained: fetches its own data from /api/news/generate.
 * If no brief exists for today, auto-generates one and shows a loading skeleton.
 * NEVER returns null — always renders a visible section.
 */

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

type Story = {
  headline: string;
  summary?: string;
  keyPoints?: string[];
  category: string;
  source?: string;
  whyItMatters?: string;
};

const COLUMNS = [
  { id: "football",    label: "Football",    color: "#F97316", categories: ["football"] },
  { id: "geopolitics", label: "Geopolitics", color: "#FF8A8A", categories: ["geopolitics"] },
  { id: "business",    label: "Business",    color: "#6FD49A", categories: ["business"] },
  { id: "tech",        label: "Tech & AI",   color: "#64FFDA", categories: ["tech", "ai"] },
];

function StoryCard({ story, accentColor }: { story: Story; accentColor: string }) {
  const [open, setOpen] = useState(false);

  let hostname = "";
  if (story.source) {
    try { hostname = new URL(story.source).hostname.replace("www.", ""); } catch { /* */ }
  }

  const summaryText = story.summary || story.whyItMatters || "";
  const keyPoints: string[] = Array.isArray(story.keyPoints) ? story.keyPoints : [];

  return (
    <div
      onClick={() => setOpen((v) => !v)}
      style={{ padding: "12px 0", borderBottom: "1px solid var(--line)", cursor: "pointer" }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 13, lineHeight: 1.42, letterSpacing: "-0.008em", color: "var(--ink)", flex: 1 }}>
          {story.headline}
        </div>
        <svg
          width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{
            color: "var(--ink-4)",
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.15s",
            flexShrink: 0, marginTop: 3,
          }}
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>

      {hostname && (
        <div style={{
          fontSize: 10, color: "var(--ink-4)",
          fontFamily: "var(--f-mono)", letterSpacing: "0.04em",
          textTransform: "uppercase", marginTop: 5,
        }}>
          {hostname}
        </div>
      )}

      {open && (
        <div style={{ marginTop: 10 }}>
          {summaryText && (
            <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--ink-2)", margin: "0 0 10px 0" }}>
              {summaryText}
            </p>
          )}
          {keyPoints.length > 0 && (
            <ul style={{ margin: "0 0 10px 0", paddingLeft: 16 }}>
              {keyPoints.map((pt, i) => (
                <li key={i} style={{ fontSize: 12, lineHeight: 1.5, color: "var(--ink-3)", marginBottom: 3 }}>
                  {pt}
                </li>
              ))}
            </ul>
          )}
          {story.source && (
            <a
              href={story.source} target="_blank" rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ fontSize: 11, color: accentColor, display: "inline-flex", alignItems: "center", gap: 5 }}
            >
              Read source
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

// ─── Skeleton placeholder (matches project rules: no spinners, use skeletons) ──

function SkeletonGrid() {
  return (
    <div className="news-grid">
      {COLUMNS.map(col => (
        <div key={col.id} className="cc-card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{
            padding: "12px 16px", borderBottom: "1px solid var(--line)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: col.color, boxShadow: `0 0 6px ${col.color}`, opacity: 0.5,
              flexShrink: 0,
            }} />
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
              textTransform: "uppercase", color: col.color, opacity: 0.5,
            }}>
              {col.label}
            </span>
          </div>
          <div style={{ padding: "0 16px" }}>
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} style={{ padding: "14px 0", borderBottom: "1px solid var(--line)" }}>
                <div style={{
                  height: 12, borderRadius: 4,
                  background: "rgba(255,255,255,0.04)",
                  width: `${60 + (i * 7) % 30}%`,
                  animation: "pulse 1.5s ease-in-out infinite",
                }} />
                <div style={{
                  height: 9, borderRadius: 3, marginTop: 8,
                  background: "rgba(255,255,255,0.025)",
                  width: "35%",
                  animation: "pulse 1.5s ease-in-out 0.2s infinite",
                }} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

type Phase = "loading" | "generating" | "ready" | "error";

export function DashboardNewsGrid({ stories: initialStories }: { stories: Story[] }) {
  // Use a ref to persist stories across re-renders/remounts via closure
  const storiesRef = useRef<Story[]>(initialStories);
  const [stories, setStories] = useState<Story[]>(initialStories);
  const [phase, setPhase] = useState<Phase>(initialStories.length > 0 ? "ready" : "loading");
  const attempted = useRef(false);

  // Keep ref in sync
  useEffect(() => {
    if (stories.length > 0) storiesRef.current = stories;
  }, [stories]);

  // Sync server-passed stories (when parent re-renders with fresh data)
  useEffect(() => {
    if (initialStories.length > 0) {
      setStories(initialStories);
      setPhase("ready");
    }
  }, [initialStories]);

  // Self-contained fetch: check cache, then generate if needed
  useEffect(() => {
    // Already have stories (from server or previous fetch)
    if (initialStories.length > 0) return;
    // Already attempted this mount
    if (attempted.current) return;
    attempted.current = true;

    let cancelled = false;

    async function load() {
      try {
        // Step 1: check for cached brief (fast, ~100ms)
        const cached = await fetch("/api/news/generate");
        if (cancelled) return;

        if (cached.ok) {
          const data = await cached.json();
          if (data?.stories?.length) {
            setStories(data.stories);
            setPhase("ready");
            return;
          }
        }

        // Step 2: no cached brief — generate one
        setPhase("generating");
        const gen = await fetch("/api/news/generate", { method: "POST" });
        if (cancelled) return;

        if (gen.ok) {
          const brief = await gen.json();
          if (brief?.stories?.length) {
            setStories(brief.stories);
            setPhase("ready");
            return;
          }
        }

        // Generation returned empty or non-OK
        setPhase("error");
      } catch {
        if (!cancelled) setPhase("error");
      }
    }

    load();
    return () => { cancelled = true; };
  }, [initialStories]);

  async function retry() {
    setPhase("generating");
    try {
      const res = await fetch("/api/news/generate", { method: "POST" });
      if (res.ok) {
        const brief = await res.json();
        if (brief?.stories?.length) {
          setStories(brief.stories);
          setPhase("ready");
          return;
        }
      }
      setPhase("error");
    } catch {
      setPhase("error");
    }
  }

  // ── Header (always visible) ──────────────────────────────────────────────
  const header = (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      marginBottom: 14,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        fontSize: 10.5, fontWeight: 500, letterSpacing: "0.18em",
        textTransform: "uppercase", color: "var(--ink-3)",
      }}>
        <span style={{
          width: 5, height: 5, borderRadius: "50%",
          background: "var(--violet)", boxShadow: "0 0 6px var(--violet)", flexShrink: 0,
        }} />
        Daily Brief
      </div>
      <Link href="/news" style={{ fontSize: 11, color: "var(--cyan)", textDecoration: "none", letterSpacing: "0.04em", opacity: 0.8 }}>
        See all →
      </Link>
    </div>
  );

  // ── Loading / generating state ───────────────────────────────────────────
  if (phase === "loading" || phase === "generating") {
    return (
      <div style={{ marginTop: 14 }}>
        {header}
        {phase === "generating" && (
          <p style={{ fontSize: 11, color: "var(--ink-4)", marginBottom: 10 }}>
            Generating today&apos;s brief — searching the web for the latest stories…
          </p>
        )}
        <SkeletonGrid />
        <style>{gridStyles}</style>
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────────
  if (phase === "error") {
    return (
      <div style={{ marginTop: 14 }}>
        {header}
        <div className="cc-card" style={{ padding: "24px 20px", textAlign: "center" }}>
          <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 0 12px" }}>
            Could not load today&apos;s brief.
          </p>
          <button onClick={retry} className="cc-btn cc-btn-primary" style={{ fontSize: 12, padding: "8px 18px" }}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  // ── Ready state — render stories ─────────────────────────────────────────
  const columns = COLUMNS.map(col => ({
    ...col,
    stories: stories.filter(s => col.categories.includes(s.category)),
  }));

  return (
    <div style={{ marginTop: 14 }}>
      {header}
      <div className="news-grid">
        {columns.map(col => (
          <div key={col.id} className="cc-card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{
              padding: "12px 16px",
              borderBottom: "1px solid var(--line)",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: "50%",
                background: col.color, boxShadow: `0 0 6px ${col.color}`,
                flexShrink: 0,
              }} />
              <span style={{
                fontSize: 10, fontWeight: 700,
                letterSpacing: "0.14em", textTransform: "uppercase",
                color: col.color, flex: 1,
              }}>
                {col.label}
              </span>
              <span style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "var(--f-mono)" }}>
                {col.stories.length}
              </span>
            </div>

            <div style={{ padding: "0 16px" }}>
              {col.stories.length === 0 ? (
                <div style={{ padding: "24px 0", textAlign: "center", fontSize: 11, color: "var(--ink-4)" }}>
                  No stories
                </div>
              ) : (
                col.stories.map((s, i) => (
                  <StoryCard key={i} story={s} accentColor={col.color} />
                ))
              )}
            </div>
          </div>
        ))}
      </div>
      <style>{gridStyles}</style>
    </div>
  );
}

const gridStyles = `
  .news-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }
  @media (max-width: 1024px) {
    .news-grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 600px) {
    .news-grid { grid-template-columns: 1fr; }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
`;
