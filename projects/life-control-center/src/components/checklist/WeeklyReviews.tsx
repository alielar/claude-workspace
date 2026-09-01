"use client";

/**
 * WeeklyReviews · collapsible card showing past AI-generated weekly pattern observations.
 * Fetches from /api/checklist/weekly-reviews on mount.
 */

import { useEffect, useState, useCallback } from "react";

type Review = {
  id: number;
  weekStart: string;
  patternObservation: string | null;
  createdAt: number;
};

function formatWeekLabel(weekStart: string): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const month = date.toLocaleString("en-US", { month: "short" });
  return `Week of ${month} ${d}`;
}

export default function WeeklyReviews() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/checklist/weekly-reviews");
      if (res.ok) {
        const data = await res.json();
        setReviews(data.reviews ?? []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading || reviews.length === 0) {
    if (loading) return null;
    return (
      <div className="cc-card">
        <div className="cc-card-head">
          <div className="title">Weekly reviews</div>
        </div>
        <div className="cc-card-body">
          <p style={{ fontSize: 12.5, color: "var(--ink-4)", margin: 0, lineHeight: 1.6 }}>
            Weekly reviews will appear here as patterns are detected.
          </p>
        </div>
      </div>
    );
  }

  const visible = expanded ? reviews : reviews.slice(0, 3);

  return (
    <div className="cc-card">
      <div className="cc-card-head" style={{ cursor: "pointer" }} onClick={() => setExpanded(!expanded)}>
        <div className="title">Weekly reviews</div>
        <div className="tail" style={{ color: "var(--cyan)", fontSize: 10, display: "flex", alignItems: "center", gap: 4 }}>
          <span>{reviews.length} weeks</span>
          <span style={{
            display: "inline-block",
            transition: "transform 0.2s var(--easeOut)",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            fontSize: 10,
          }}>
            ▾
          </span>
        </div>
      </div>
      <div style={{ padding: "4px 16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
        {visible.map((r) => (
          <div key={r.id} style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid var(--line)",
            background: "rgba(100,255,218,0.03)",
          }}>
            <div style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: "var(--cyan)",
              marginBottom: 5,
            }}>
              {formatWeekLabel(r.weekStart)}
            </div>
            <p style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.6, margin: 0 }}>
              {r.patternObservation}
            </p>
          </div>
        ))}
        {!expanded && reviews.length > 3 && (
          <button
            onClick={() => setExpanded(true)}
            style={{
              background: "none",
              border: "none",
              color: "var(--violet)",
              fontSize: 12,
              cursor: "pointer",
              padding: "4px 0",
              textAlign: "center",
            }}
          >
            Show {reviews.length - 3} more
          </button>
        )}
      </div>
    </div>
  );
}
