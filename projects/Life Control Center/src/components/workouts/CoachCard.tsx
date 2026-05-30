"use client";

/**
 * Coach Notes card — shows progressive overload suggestions
 * from the most recent completed workout session.
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

export default function CoachCard() {
  const [session, setSession] = useState<LastSession | null>(null);
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // Fetch last completed session
        const res = await fetch("/api/workouts/last-session");
        if (!res.ok) { setLoading(false); return; }
        const data = await res.json();
        if (!data?.id) { setLoading(false); return; }
        setSession(data);

        // Fetch suggestions for that session's plan
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

  if (!session || entries.length === 0) {
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

  const dateLabel = new Date(session.date + "T12:00:00").toLocaleDateString("en-GB", {
    day: "numeric", month: "short",
  });

  return (
    <div className="cc-card" style={{ marginBottom: 14 }}>
      <div className="cc-card-head">
        <div className="title">Coach Notes</div>
        <span style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "var(--f-mono)" }}>
          {session.workoutName} · {dateLabel}
        </span>
      </div>
      <div className="cc-card-body">
        <div style={{ fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--ink-4)", fontWeight: 600, marginBottom: 10 }}>
          From your last session
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
      </div>
    </div>
  );
}
