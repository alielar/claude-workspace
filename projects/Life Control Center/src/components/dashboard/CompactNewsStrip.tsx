"use client";

/**
 * Compact scrolling news ticker for the dashboard.
 * Shows headlines from all categories scrolling right-to-left.
 * Auto-generates brief if none exists. Links to /news for full view.
 */

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

type Story = {
  headline: string;
  summary?: string;
  category: string;
};

const CATS = [
  { id: "football",    label: "Football",    color: "#F97316" },
  { id: "geopolitics", label: "Geopolitics", color: "#FF8A8A" },
  { id: "business",    label: "Business",    color: "#6FD49A" },
  { id: "tech",        label: "Tech & AI",   color: "#64FFDA", match: ["tech", "ai"] },
];

function catColor(category: string): string {
  const cat = CATS.find(c => c.id === category || (c.match ?? [c.id]).includes(category));
  return cat?.color ?? "var(--ink-4)";
}

function catLabel(category: string): string {
  const cat = CATS.find(c => c.id === category || (c.match ?? [c.id]).includes(category));
  return cat?.label ?? category;
}

export function CompactNewsStrip({ stories: initial }: { stories: Story[] }) {
  const [stories, setStories] = useState<Story[]>(initial);
  const [generating, setGenerating] = useState(false);
  const [paused, setPaused] = useState(false);
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

  // Pick top headlines — one per category, include summary for context
  const headlines: { headline: string; summary: string; category: string; color: string; label: string }[] = [];
  for (const cat of CATS) {
    const match = cat.match || [cat.id];
    const story = stories.find(s => match.includes(s.category));
    if (story) {
      headlines.push({
        headline: story.headline,
        summary: story.summary ?? "",
        category: story.category,
        color: cat.color,
        label: cat.label,
      });
    }
  }

  if (generating || (stories.length === 0 && !attempted.current)) {
    return (
      <div style={{ height: 28, display: "flex", alignItems: "center", gap: 12 }}>
        {CATS.map(cat => (
          <div key={cat.id} style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: cat.color, opacity: 0.35, flexShrink: 0 }} />
            <div className="cc-skeleton" style={{ height: 12, borderRadius: 4, width: 120 }} />
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

  // Build ticker items — duplicate for seamless loop
  const tickerItems = headlines.length > 0 ? headlines : [{ headline: "No stories yet", summary: "", category: "", color: "var(--ink-4)", label: "" }];

  return (
    <Link href="/news" style={{ textDecoration: "none", display: "block" }}>
      <div
        className="news-ticker-wrap"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        style={{
          overflow: "hidden",
          position: "relative",
          height: 28,
          display: "flex",
          alignItems: "center",
          maskImage: "linear-gradient(90deg, transparent, black 40px, black calc(100% - 40px), transparent)",
          WebkitMaskImage: "linear-gradient(90deg, transparent, black 40px, black calc(100% - 40px), transparent)",
        }}
      >
        <div
          className="news-ticker-track"
          style={{
            display: "flex",
            gap: 0,
            whiteSpace: "nowrap",
            animationPlayState: paused ? "paused" : "running",
          }}
        >
          {/* Render twice for seamless loop */}
          {[0, 1].map(copy => (
            <div key={copy} style={{ display: "flex", gap: 0, flexShrink: 0 }}>
              {tickerItems.map((item, i) => (
                <span key={`${copy}-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 7, paddingRight: 32 }}>
                  <span style={{
                    width: 5, height: 5, borderRadius: "50%", background: item.color,
                    boxShadow: `0 0 6px ${item.color}40`, flexShrink: 0,
                  }} />
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase",
                    color: item.color, fontFamily: "var(--f-mono)",
                  }}>
                    {item.label}
                  </span>
                  <span style={{
                    fontSize: 12, fontWeight: 600, color: "var(--ink-2)", letterSpacing: "-0.005em",
                  }}>
                    {item.headline}
                    {item.summary && (
                      <span style={{ fontWeight: 400, color: "var(--ink-4)", marginLeft: 6 }}>
                        — {item.summary.length > 100 ? item.summary.slice(0, 100) + "…" : item.summary}
                      </span>
                    )}
                  </span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
      <style>{`
        @keyframes ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .news-ticker-track {
          animation: ticker-scroll 55s linear infinite;
        }
        .news-ticker-wrap:hover .news-ticker-track {
          animation-play-state: paused;
        }
      `}</style>
    </Link>
  );
}
