"use client";

/**
 * Coach Notes ticker — a tight, auto-rolling strip (same motion as the
 * dashboard news ticker). Rolls the weekly AI insight (WINS / FOCUS / WATCH)
 * plus per-exercise progressive-overload calls. Hover to pause and read.
 */

import { useEffect, useRef, useState } from "react";

type Suggestion = { action: string; suggestedWeightKg: number | null; message: string };
type CoachNote = { content: string; weekStart: string; generatedAt: number };
type Item = { label: string; color: string; text: string };

const SECTION_META: Record<string, { label: string; color: string }> = {
  wins:  { label: "Wins",  color: "var(--pos)" },
  focus: { label: "Focus", color: "var(--violet)" },
  watch: { label: "Watch", color: "var(--warn)" },
};

const ACTION_META: Record<string, { label: string; color: string }> = {
  increase: { label: "Up",     color: "var(--pos)" },
  maintain: { label: "Hold",   color: "var(--ink-3)" },
  deload:   { label: "Deload", color: "var(--warn)" },
};

function trim(text: string, max = 170): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max).trimEnd() + "…" : t;
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="cc-card"
      style={{ display: "flex", alignItems: "center", gap: 14, padding: "9px 14px", marginBottom: 14, overflow: "hidden" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--violet)", boxShadow: "0 0 6px var(--violet)" }} />
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--violet)", fontFamily: "var(--f-mono)" }}>
          Coach
        </span>
      </div>
      {children}
    </div>
  );
}

function parseNote(content: string): Item[] {
  const matches = [...content.matchAll(/\b(WINS|FOCUS|WATCH)\b/g)];
  if (matches.length >= 2) {
    const items: Item[] = [];
    for (let i = 0; i < matches.length; i++) {
      const start = (matches[i].index ?? 0) + matches[i][0].length;
      const end = i + 1 < matches.length ? matches[i + 1].index : content.length;
      const text = content.slice(start, end).replace(/^[\s:—\-]+/, "").trim();
      if (!text) continue;
      const meta = SECTION_META[matches[i][0].toLowerCase()] ?? { label: matches[i][0], color: "var(--ink-3)" };
      items.push({ label: meta.label, color: meta.color, text: trim(text) });
    }
    return items;
  }
  return [{ label: "Insight", color: "var(--violet)", text: trim(content) }];
}

export default function CoachTicker() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [paused, setPaused] = useState(false);
  const fetched = useRef(false);

  const load = async () => {
    try {
      const [coachRes, sessionRes] = await Promise.all([
        fetch("/api/workouts/coach"),
        fetch("/api/workouts/last-session"),
      ]);

      const next: Item[] = [];
      if (coachRes.ok) {
        const note: CoachNote = await coachRes.json();
        if (note?.content) next.push(...parseNote(note.content));
      }
      if (sessionRes.ok) {
        const session = await sessionRes.json();
        if (session?.planId) {
          const sugRes = await fetch(`/api/workouts/suggestions?planId=${session.planId}`);
          if (sugRes.ok) {
            const sug: Record<string, Suggestion> = await sugRes.json();
            for (const [name, s] of Object.entries(sug ?? {})) {
              const meta = ACTION_META[s.action] ?? { label: s.action, color: "var(--ink-3)" };
              next.push({ label: meta.label, color: meta.color, text: `${name} — ${s.message}` });
            }
          }
        }
      }
      setItems(next);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    load();
  }, []);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/workouts/coach", { method: "POST" });
      if (res.ok) await load();
    } catch { /* ignore */ }
    setGenerating(false);
  };

  if (loading) {
    return (
      <Frame>
        <div className="cc-skeleton" style={{ flex: 1, height: 12, borderRadius: 4 }} />
      </Frame>
    );
  }

  if (items.length === 0) {
    return (
      <Frame>
        <button
          onClick={generate}
          disabled={generating}
          style={{
            background: "transparent", border: "none", cursor: generating ? "wait" : "pointer",
            fontSize: 12, color: "var(--ink-3)", fontFamily: "var(--f-mono)", letterSpacing: "0.02em", padding: 0,
          }}
        >
          {generating ? "Generating weekly note…" : "Generate this week's coach note →"}
        </button>
      </Frame>
    );
  }

  const duration = `${Math.max(28, items.length * 13)}s`;

  return (
    <Frame>
      <div
        className="coach-ticker-wrap"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        style={{
          flex: 1, minWidth: 0, overflow: "hidden", position: "relative", height: 20, display: "flex", alignItems: "center",
          maskImage: "linear-gradient(90deg, transparent, black 24px, black calc(100% - 40px), transparent)",
          WebkitMaskImage: "linear-gradient(90deg, transparent, black 24px, black calc(100% - 40px), transparent)",
        }}
      >
        <div
          className="coach-ticker-track"
          style={{ display: "flex", whiteSpace: "nowrap", animationDuration: duration, animationPlayState: paused ? "paused" : "running" }}
        >
          {[0, 1].map((copy) => (
            <div key={copy} style={{ display: "flex", flexShrink: 0 }}>
              {items.map((item, i) => (
                <span key={`${copy}-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 7, paddingRight: 30 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: item.color, fontFamily: "var(--f-mono)" }}>
                    {item.label}
                  </span>
                  <span style={{ fontSize: 12.5, color: "var(--ink-2)", letterSpacing: "-0.005em" }}>
                    {item.text}
                  </span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
      <button
        onClick={generate}
        disabled={generating}
        title="Regenerate weekly note"
        style={{
          flexShrink: 0, background: "transparent", border: "none", cursor: generating ? "wait" : "pointer",
          fontSize: 12, color: "var(--ink-4)", fontFamily: "var(--f-mono)", padding: "2px 4px",
        }}
      >
        {generating ? "…" : "↻"}
      </button>
      <style>{`
        @keyframes coach-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .coach-ticker-track { animation: coach-scroll linear infinite; }
        .coach-ticker-wrap:hover .coach-ticker-track { animation-play-state: paused; }
      `}</style>
    </Frame>
  );
}
