"use client";

/**
 * Dashboard News Grid — 4-column layout matching the /news page.
 * Renders all 20 stories grouped by category with expandable cards.
 */

import { useState } from "react";
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

export function DashboardNewsGrid({ stories }: { stories: Story[] }) {
  if (stories.length === 0) return null;

  const columns = COLUMNS.map(col => ({
    ...col,
    stories: stories.filter(s => col.categories.includes(s.category)),
  }));

  return (
    <div style={{ marginTop: 14 }}>
      {/* Section header */}
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

      {/* 4-column grid */}
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

      <style>{`
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
      `}</style>
    </div>
  );
}
