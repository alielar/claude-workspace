"use client";

/**
 * Coach Notes card — shows:
 * 1. Weekly AI coaching note (from /api/workouts/coach)
 * 2. Per-exercise progressive overload suggestions
 */

import { useEffect, useState } from "react";

const ACTION_COLOR: Record<string, string> = {
  increase: "var(--pos)",
  maintain: "var(--ink-3)",
  deload: "var(--warn)",
};

type Suggestion = {
  action: string;
  suggestedWeightKg: number | null;
  message: string;
};

type LastSession = {
  id: number;
  date: string;
  workoutName: string;
  planId: number | null;
};

type CoachNote = {
  content: string;
  weekStart: string;
  generatedAt: number;
};

export default function CoachCard() {
  const [session, setSession] = useState<LastSession | null>(null);
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion>>({});
  const [coachNote, setCoachNote] = useState<CoachNote | null>(null);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // Fetch last completed session + AI coach note in parallel
        const [sessionRes, coachRes] = await Promise.all([
          fetch("/api/workouts/last-session"),
          fetch("/api/workouts/coach"),
        ]);

        // Coach note
        if (coachRes.ok) {
          const note = await coachRes.json();
          if (note?.content) setCoachNote(note);
        }

        // Session + suggestions
        if (!sessionRes.ok) { setLoading(false); return; }
        const data = await sessionRes.json();
        if (!data?.id) { setLoading(false); return; }
        setSession(data);

        if (data.planId) {
          const sugRes = await fetch(`/api/workouts/suggestions?planId=${data.planId}`);
          if (sugRes.ok) {
            const sug = await sugRes.json();
            setSuggestions(sug ?? {});
          }
        }
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  const handleRefreshCoach = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/workouts/coach", { method: "POST" });
      if (res.ok) {
        const note = await res.json();
        if (note?.content) setCoachNote(note);
      }
    } catch { /* ignore */ }
    setGenerating(false);
  };

  if (loading) {
    return (
      <div className="cc-card" style={{ marginBottom: 14 }}>
        <div className="cc-card-head">
          <div className="title">Coach Notes</div>
        </div>
        <div className="cc-card-body">
          <div className="cc-skeleton" style={{ height: 18, borderRadius: 6, marginBottom: 8 }} />
          <div className="cc-skeleton" style={{ height: 18, borderRadius: 6, marginBottom: 8, width: "80%" }} />
          <div className="cc-skeleton" style={{ height: 18, borderRadius: 6, width: "60%" }} />
        </div>
      </div>
    );
  }

  const entries = Object.entries(suggestions);
  const hasContent = session || coachNote;

  if (!hasContent && entries.length === 0) {
    return (
      <div className="cc-card" style={{ marginBottom: 14 }}>
        <div className="cc-card-head">
          <div className="title">Coach Notes</div>
        </div>
        <div className="cc-card-body">
          <div style={{ color: "var(--ink-4)", fontSize: 13, lineHeight: 1.5 }}>
            Complete your first session to see coaching notes here.
          </div>
        </div>
      </div>
    );
  }

  const dateLabel = session
    ? new Date(session.date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : null;

  return (
    <div className="cc-card" style={{ marginBottom: 14 }}>
      <div className="cc-card-head">
        <div className="title">Coach Notes</div>
        {dateLabel && session && (
          <span style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "var(--f-mono)" }}>
            {session.workoutName} · {dateLabel}
          </span>
        )}
      </div>
      <div className="cc-card-body">
        {/* ── Weekly AI coach note ──────────────────────────────── */}
        {coachNote ? (
          <div style={{ marginBottom: entries.length > 0 ? 16 : 0 }}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              marginBottom: 8,
            }}>
              <div style={{ fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--violet)", fontWeight: 600 }}>
                Weekly insight
              </div>
              <button
                onClick={handleRefreshCoach}
                disabled={generating}
                style={{
                  background: "transparent", border: "none", cursor: generating ? "wait" : "pointer",
                  fontSize: 10, color: "var(--ink-4)", fontFamily: "var(--f-mono)",
                  padding: "2px 6px", borderRadius: 4,
                }}
              >
                {generating ? "…" : "↻"}
              </button>
            </div>
            <div style={{
              fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.6,
              padding: "10px 12px", borderRadius: 10,
              background: "rgba(124,77,255,0.04)",
              border: "1px solid rgba(124,77,255,0.10)",
            }}>
              {coachNote.content}
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: entries.length > 0 ? 16 : 0 }}>
            <button
              onClick={handleRefreshCoach}
              disabled={generating}
              className="cc-btn-primary"
              style={{
                width: "100%", padding: "10px 16px", borderRadius: 8,
                fontSize: 12, fontWeight: 600, cursor: generating ? "wait" : "pointer",
              }}
            >
              {generating ? "Generating…" : "Generate weekly coach note"}
            </button>
          </div>
        )}

        {/* ── Per-exercise suggestions ─────────────────────────── */}
        {entries.length > 0 && (
          <>
            <div style={{ fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--ink-4)", fontWeight: 600, marginBottom: 10 }}>
              Progressive overload
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {entries.map(([name, s]) => (
                <div key={name} style={{
                  display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px",
                  background: "rgba(255,255,255,0.02)", borderRadius: 8,
                  border: `1px solid ${(ACTION_COLOR[s.action] ?? "var(--line)") + "33"}`,
                }}>
                  <span style={{
                    fontSize: 8, fontFamily: "var(--f-mono)", fontWeight: 700,
                    letterSpacing: "0.1em", flexShrink: 0, marginTop: 3,
                    color: ACTION_COLOR[s.action] ?? "var(--ink-3)",
                  }}>
                    {s.action === "increase" ? "↑ UP" : s.action === "deload" ? "↓ DELOAD" : "= HOLD"}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 500, color: "var(--ink)" }}>{name}</div>
                    <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 1, lineHeight: 1.4 }}>{s.message}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
