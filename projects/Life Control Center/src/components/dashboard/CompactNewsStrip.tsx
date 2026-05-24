"use client";

/**
 * Compact 4-headline news strip for the dashboard.
 * Shows one headline per category (Football, Geopolitics, Business, Tech/AI).
 * Auto-generates brief if none exists. Links to /news for full view.
 */

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

type Story = {
  headline: string;
  category: string;
};

const CATS = [
  { id: "football",    label: "Football",    color: "#F97316" },
  { id: "geopolitics", label: "Geopolitics", color: "#FF8A8A" },
  { id: "business",    label: "Business",    color: "#6FD49A" },
  { id: "tech",        label: "Tech & AI",   color: "#64FFDA", match: ["tech", "ai"] },
];

export function CompactNewsStrip({ stories: initial }: { stories: Story[] }) {
  const [stories, setStories] = useState<Story[]>(initial);
  const [generating, setGenerating] = useState(false);
  const attempted = useRef(false);

  useEffect(() => {
    if (initial.length > 0) { setStories(initial); return; }
    if (attempted.current) return;
    attempted.current = true;

    (async () => {
      try {
        const cached = await fetch("/api/news/generate");
        if (cached.ok) {
          const data = await cached.json();
          if (data?.stories?.length) { setStories(data.stories); return; }
        }
        setGenerating(true);
        const gen = await fetch("/api/news/generate", { method: "POST" });
        if (gen.ok) {
          const brief = await gen.json();
          if (brief?.stories?.length) { setStories(brief.stories); setGenerating(false); return; }
        }
        setGenerating(false);
      } catch { setGenerating(false); }
    })();
  }, [initial]);

  // Pick first headline per category
  const headlines = CATS.map(cat => {
    const match = cat.match || [cat.id];
    const story = stories.find(s => match.includes(s.category));
    return { ...cat, headline: story?.headline ?? null };
  });

  if (generating || (stories.length === 0 && !attempted.current)) {
    return (
      <div className="news-strip-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {CATS.map(cat => (
          <div key={cat.id} style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: cat.color, opacity: 0.35, flexShrink: 0 }} />
            <div className="cc-skeleton" style={{ height: 12, borderRadius: 4, width: "85%" }} />
          </div>
        ))}
      </div>
    );
  }

  if (stories.length === 0) {
    return (
      <div style={{ fontSize: 12, color: "var(--ink-5)", fontFamily: "var(--f-mono)", letterSpacing: "0.04em" }}>
        Your daily brief generates at 8 AM ·{" "}
        <Link href="/news" style={{ color: "var(--cyan)", textDecoration: "none" }}>See news →</Link>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div className="news-strip-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {headlines.map(h => (
          <Link key={h.id} href="/news" className="news-strip-item" style={{
            textDecoration: "none", display: "flex", alignItems: "flex-start", gap: 7, minWidth: 0,
            padding: "6px 8px", borderRadius: 8, margin: "-6px -8px",
            transition: "background 0.15s var(--easeOut)",
          }}>
            <span style={{
              width: 5, height: 5, borderRadius: "50%", background: h.color,
              boxShadow: `0 0 6px ${h.color}40`, flexShrink: 0, marginTop: 5,
            }} />
            <span style={{
              fontSize: 12, color: "var(--ink-2)", lineHeight: 1.4, letterSpacing: "-0.005em",
              overflow: "hidden", textOverflow: "ellipsis",
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
            }}>
              {h.headline ?? "—"}
            </span>
          </Link>
        ))}
      </div>
      <style>{`
        .news-strip-item:hover { background: rgba(255,255,255,0.03); }
        @media (max-width: 768px) {
          .news-strip-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 480px) {
          .news-strip-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
