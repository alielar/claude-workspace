"use client";

/**
 * Dashboard mood quick-log widget — 5 emoji buttons, one-tap save.
 * Shows current score if already logged (highlighted emoji).
 */

import { useState, useEffect, useCallback } from "react";

const MOODS = [
  { score: 1, emoji: "😞" },
  { score: 2, emoji: "😔" },
  { score: 3, emoji: "😐" },
  { score: 4, emoji: "😊" },
  { score: 5, emoji: "😄" },
];

function todayMadrid(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}

export function MoodQuickLog({ initialScore }: { initialScore: number | null }) {
  const [score, setScore] = useState<number | null>(initialScore);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setScore(initialScore); }, [initialScore]);

  const save = useCallback(async (s: number) => {
    const prev = score;
    setScore(s);
    setSaving(true);
    try {
      const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" }).format(new Date());
      const res = await fetch("/api/mood", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: todayMadrid(), score: s, note: "", time }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setScore(prev);
    }
    setSaving(false);
  }, [score]);

  return (
    <div className="cc-card" style={{ padding: "18px 20px", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          fontSize: 10.5, fontWeight: 500, letterSpacing: "0.18em",
          textTransform: "uppercase", color: "var(--ink-3)",
        }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--violet)", boxShadow: "0 0 6px var(--violet)", flexShrink: 0 }} />
          Mood
        </div>
        {score && (
          <span style={{ fontSize: 10, color: "var(--pos)", fontFamily: "var(--f-mono)", letterSpacing: "0.06em" }}>
            LOGGED
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
        {MOODS.map(({ score: s, emoji }) => (
          <button
            key={s}
            className="mood-btn"
            onClick={() => !saving && save(s)}
            disabled={saving}
            aria-label={`Mood ${s} of 5`}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 26, lineHeight: 1, padding: "10px 0",
              border: `1px solid ${score === s ? "rgba(124,77,255,0.40)" : "var(--line)"}`,
              borderRadius: 10, cursor: saving ? "wait" : "pointer",
              background: score === s
                ? "linear-gradient(160deg, rgba(124,77,255,0.15), rgba(100,255,218,0.08))"
                : "rgba(255,255,255,0.012)",
              boxShadow: score === s ? "0 0 14px rgba(124,77,255,0.18)" : "none",
              filter: score && score !== s ? "grayscale(60%) opacity(0.55)" : "none",
              transform: score === s ? "scale(1.06)" : "scale(1)",
              transition: "all 0.18s var(--easeOut)",
            }}
          >
            {emoji}
          </button>
        ))}
      </div>
      {!score && (
        <div style={{ fontSize: 11, color: "var(--ink-5)", marginTop: 10, textAlign: "center", letterSpacing: "0.02em" }}>
          How are you feeling?
        </div>
      )}
      <style>{`
        .mood-btn:hover:not(:disabled) { border-color: var(--line-hi) !important; background: rgba(255,255,255,0.03) !important; }
        .mood-btn:active:not(:disabled) { transform: scale(0.96) !important; }
        .mood-btn:focus-visible { outline: 2px solid var(--violet); outline-offset: 2px; }
      `}</style>
    </div>
  );
}
