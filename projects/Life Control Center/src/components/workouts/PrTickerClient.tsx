"use client";

import { useState } from "react";

interface PR {
  id: number;
  exerciseId: number | null;
  exerciseName: string;
  muscleGroup: string | null;
  bestWeightKg: number | null;
  bestReps: number | null;
  estimated1rm: number | null;
  achievedAt: string;
}

function daysAgo(dateStr: string): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
  const diff = Math.round(
    (new Date(today).getTime() - new Date(dateStr).getTime()) / 86400000
  );
  if (diff === 0) return "today";
  if (diff === 1) return "yesterday";
  return `${diff}d ago`;
}

const MUSCLE_LABELS: Record<string, string> = {
  chest: "Chest", front_delts: "Front Delts", side_delts: "Side Delts",
  rear_delts: "Rear Delts", triceps: "Triceps", biceps: "Biceps",
  lats: "Lats", upper_back: "Upper Back", upper_traps: "Traps",
  quads: "Quads", hamstrings: "Hams", glutes: "Glutes",
  calves: "Calves", abs: "Abs", obliques: "Obliques",
  forearms: "Forearms", serratus: "Serratus",
};

export default function PrTickerClient({ initialPrs }: { initialPrs: PR[] }) {
  const [showAll, setShowAll] = useState(false);
  const [allPrs, setAllPrs] = useState<PR[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function openAll() {
    setShowAll(true);
    if (allPrs) return;
    setLoading(true);
    try {
      const r = await fetch("/api/workouts/prs");
      const data = await r.json();
      setAllPrs(Array.isArray(data) ? data : []);
    } catch {
      setAllPrs([]);
    } finally {
      setLoading(false);
    }
  }

  if (initialPrs.length === 0) return null;

  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <div className="cc-sechead">
          Recent PRs
          <button
            onClick={openAll}
            style={{
              marginLeft: "auto", fontSize: 11, color: "var(--ink-4)",
              background: "none", border: "none", cursor: "pointer",
              letterSpacing: "0.04em", fontFamily: "var(--f-sans)", padding: 0,
            }}
          >
            View all →
          </button>
        </div>
        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6, scrollbarWidth: "thin" as const }}>
          {initialPrs.map((pr) => (
            <div
              key={pr.id}
              onClick={openAll}
              style={{
                flexShrink: 0, padding: "14px 18px",
                border: "1px solid var(--line)", borderRadius: 12,
                background: "rgba(255,255,255,0.018)", minWidth: 220,
                cursor: "pointer", transition: "border-color 0.15s",
              }}
            >
              <div style={{ fontSize: 9.5, letterSpacing: "0.20em", textTransform: "uppercase" as const, color: "var(--warn)", fontWeight: 600 }}>
                ↑ {pr.exerciseName}
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 3 }}>
                {MUSCLE_LABELS[pr.muscleGroup ?? ""] ?? ""}
              </div>
              <div style={{ fontSize: 22, fontWeight: 300, letterSpacing: "-0.02em", marginTop: 4, fontFamily: "var(--f-mono)", color: "var(--ink)" }}>
                {pr.bestWeightKg != null ? `${pr.bestWeightKg}` : "BW"}
                <span style={{ color: "var(--ink-3)", fontSize: 13 }}>
                  {pr.bestWeightKg != null ? " kg" : ""}
                  {pr.bestReps != null ? ` × ${pr.bestReps}` : ""}
                </span>
              </div>
              {pr.estimated1rm != null && (
                <div style={{ fontSize: 10, color: "var(--ink-4)", letterSpacing: "0.04em", marginTop: 2, fontFamily: "var(--f-mono)" }}>
                  est. 1RM {Math.round(pr.estimated1rm)}kg · {daysAgo(pr.achievedAt)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Full PRs drawer */}
      {showAll && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 200 }}
          onClick={() => setShowAll(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed", top: 0, right: 0, bottom: 0, width: 500,
              background: "var(--bg-card)", borderLeft: "1px solid var(--line)",
              overflowY: "auto", padding: "24px 24px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 500 }}>Personal Records</div>
                <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 3 }}>best set per exercise · all time</div>
              </div>
              <button
                onClick={() => setShowAll(false)}
                style={{ background: "none", border: "none", color: "var(--ink-4)", fontSize: 20, cursor: "pointer", lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {loading && <div style={{ color: "var(--ink-4)", fontSize: 13, fontFamily: "var(--f-mono)" }}>Loading…</div>}

            {allPrs && (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Exercise", "Best Set", "Est 1RM", "Achieved"].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: h === "Exercise" ? "left" : "right",
                          padding: "0 0 10px",
                          paddingRight: h !== "Achieved" ? 12 : 0,
                          color: "var(--ink-3)", fontSize: 9.5,
                          letterSpacing: "0.16em", textTransform: "uppercase" as const,
                          fontWeight: 500, borderBottom: "1px solid var(--line)",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allPrs.map((pr) => (
                    <tr key={pr.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "10px 12px 10px 0", fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>
                        <div>{pr.exerciseName}</div>
                        {pr.muscleGroup && (
                          <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 2 }}>
                            {MUSCLE_LABELS[pr.muscleGroup] ?? pr.muscleGroup}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "10px 12px 10px 0", fontSize: 13, color: "var(--ink-2)", textAlign: "right", fontFamily: "var(--f-mono)" }}>
                        {pr.bestWeightKg != null ? `${pr.bestWeightKg}kg` : "BW"}
                        {pr.bestReps != null ? ` × ${pr.bestReps}` : ""}
                      </td>
                      <td style={{ padding: "10px 12px 10px 0", fontSize: 13, color: "var(--warn)", textAlign: "right", fontFamily: "var(--f-mono)" }}>
                        {pr.estimated1rm != null ? `${Math.round(pr.estimated1rm)}kg` : "—"}
                      </td>
                      <td style={{ padding: "10px 0", fontSize: 11, color: "var(--ink-4)", textAlign: "right" }}>
                        {pr.achievedAt}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </>
  );
}
