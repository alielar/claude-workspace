"use client";

import { useEffect, useState } from "react";

interface CoachCard {
  id: number;
  weekStart: string;
  content: string;
  generatedAt: number;
}

export default function CoachCard() {
  const [card, setCard] = useState<CoachCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshed, setRefreshed] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);

  useEffect(() => {
    // Ensure table exists, then load card
    fetch("/api/admin/migrate", { method: "POST" })
      .catch(() => {})
      .finally(() => {
        fetch("/api/workouts/coach")
          .then(r => r.json())
          .then(d => { setCard(d); setLoading(false); })
          .catch(() => setLoading(false));
      });
  }, []);

  async function handleRefresh() {
    if (refreshing || rateLimited) return;
    setRefreshing(true);
    setRateLimited(false);
    try {
      const res = await fetch("/api/workouts/coach", { method: "POST" });
      if (res.status === 429) {
        setRateLimited(true);
        return;
      }
      if (res.ok) {
        const d = await res.json();
        setCard(d);
        setRefreshed(true);
        setTimeout(() => setRefreshed(false), 3000);
      }
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <div className="cc-card" style={{ marginBottom: 14 }}>
        <div className="cc-card-head">
          <div className="title">AI Coach</div>
        </div>
        <div className="cc-card-body">
          <div className="skeleton" style={{ height: 18, borderRadius: 6, marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 18, borderRadius: 6, marginBottom: 8, width: "80%" }} />
          <div className="skeleton" style={{ height: 18, borderRadius: 6, width: "60%" }} />
        </div>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="cc-card" style={{ marginBottom: 14 }}>
        <div className="cc-card-head">
          <div className="title">AI Coach</div>
        </div>
        <div className="cc-card-body">
          <div style={{ color: "var(--ink-4)", fontSize: 13, marginBottom: 14 }}>
            Get your first weekly coaching note — powered by your actual training data.
          </div>
          <button onClick={handleRefresh} disabled={refreshing} className="cc-btn-primary"
            style={{ padding: "8px 18px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: refreshing ? "wait" : "pointer" }}>
            {refreshing ? "Generating…" : "Generate coaching note"}
          </button>
        </div>
      </div>
    );
  }

  const generatedDate = new Date(card.generatedAt).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", timeZone: "Europe/Madrid",
  });

  return (
    <div className="cc-card" style={{ marginBottom: 14 }}>
      <div className="cc-card-head">
        <div className="title">AI Coach</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "var(--f-mono)" }}>
            {generatedDate}
          </span>
          <button
            onClick={handleRefresh}
            disabled={refreshing || rateLimited}
            title={rateLimited ? "Already refreshed today" : "Refresh coaching note"}
            aria-label="Refresh AI coaching note"
            style={{
              width: 28, height: 28, borderRadius: 7, border: "1px solid var(--line)",
              background: "transparent", color: refreshed ? "var(--pos)" : rateLimited ? "var(--ink-5)" : "var(--ink-3)",
              cursor: (refreshing || rateLimited) ? "default" : "pointer",
              fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
              transition: "color 0.2s",
              opacity: rateLimited ? 0.45 : 1,
            }}
          >
            {refreshing ? "…" : refreshed ? "✓" : "↻"}
          </button>
        </div>
      </div>
      <div className="cc-card-body">
        {rateLimited && (
          <div style={{ fontSize: 10, color: "var(--warn)", marginBottom: 10, letterSpacing: "0.04em" }}>
            Already refreshed today — try again tomorrow.
          </div>
        )}
        <p style={{
          fontSize: 13, color: "var(--ink-2)", lineHeight: 1.7,
          margin: 0, fontStyle: "italic",
        }}>
          &ldquo;{card.content}&rdquo;
        </p>
      </div>
    </div>
  );
}
