"use client";

import { useEffect, useState } from "react";

const MUSCLE_LABELS: Record<string, string> = {
  chest: "Chest", lats: "Lats", upper_back: "Upper Back", traps: "Traps",
  front_delts: "Front Delts", side_delts: "Side Delts", rear_delts: "Rear Delts",
  biceps: "Biceps", triceps: "Triceps", forearms: "Forearms",
  quads: "Quads", hamstrings: "Hams", glutes: "Glutes", calves: "Calves",
  abs: "Abs", obliques: "Obliques",
};

const DAY_LABELS: Record<string, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

interface Plan {
  id: number;
  name: string;
  assignedDays: string | null;
  targetMuscles: string | null;
  exerciseCount: number;
}

interface Props {
  plans: Plan[];
  exerciseCount: number;
}

function parseDays(raw: string | null): string {
  if (!raw) return "No days set";
  try {
    const arr: string[] = JSON.parse(raw);
    return arr.length > 0 ? arr.map(d => DAY_LABELS[d] ?? d).join(", ") : "No days set";
  } catch { return "No days set"; }
}

function openDrawer(key: string) {
  window.dispatchEvent(new CustomEvent("open-workout-drawer", { detail: key }));
}

function formatTonnage(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}t`;
  return `${Math.round(kg)}kg`;
}

export default function InfoTiles({ plans, exerciseCount }: Props) {
  const [topExercises, setTopExercises] = useState<{ name: string; count: number }[]>([]);
  const [weeklyTrend, setWeeklyTrend] = useState<{ tonnage: number }[]>([]);
  const [thisWeekTonnage, setThisWeekTonnage] = useState(0);
  const [lastWeekTonnage, setLastWeekTonnage] = useState(0);

  useEffect(() => {
    // Fetch analytics for sparkline and tonnage
    fetch("/api/workouts/analytics")
      .then(r => r.json())
      .then(data => {
        if (data.weeklyTrend) {
          const last4 = data.weeklyTrend.slice(-4);
          setWeeklyTrend(last4);
          if (last4.length >= 1) setThisWeekTonnage(last4[last4.length - 1].tonnage);
          if (last4.length >= 2) setLastWeekTonnage(last4[last4.length - 2].tonnage);
        }
      })
      .catch(() => {});

    // Fetch recent history to compute top exercises
    fetch("/api/workouts/history?limit=50&detail=true")
      .then(r => r.json())
      .then((sessions: { sets?: { exerciseName: string }[] }[]) => {
        const counts = new Map<string, number>();
        for (const s of sessions) {
          if (!s.sets) continue;
          const seen = new Set<string>();
          for (const set of s.sets) {
            if (!seen.has(set.exerciseName)) {
              seen.add(set.exerciseName);
              counts.set(set.exerciseName, (counts.get(set.exerciseName) ?? 0) + 1);
            }
          }
        }
        const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
        setTopExercises(sorted.map(([name, count]) => ({ name, count })));
      })
      .catch(() => {});
  }, []);

  const pctChange = lastWeekTonnage > 0
    ? Math.round(((thisWeekTonnage - lastWeekTonnage) / lastWeekTonnage) * 100)
    : 0;

  const maxTonnage = Math.max(...weeklyTrend.map(w => w.tonnage), 1);

  return (
    <div className="info-tiles-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 14 }}>
      {/* Workouts tile */}
      <button
        onClick={() => openDrawer("workouts")}
        className="cc-card"
        style={{ padding: 0, cursor: "pointer", textAlign: "left", border: "1px solid var(--line)", background: "var(--bg-card)" }}
      >
        <div className="cc-card-head">
          <div className="title">Workouts</div>
          <div className="tail">{plans.length}</div>
        </div>
        <div className="cc-card-body" style={{ minHeight: 120 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {plans.map(p => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>{p.name}</span>
                <span style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "var(--f-mono)" }}>{parseDays(p.assignedDays)}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: "auto", paddingTop: 16, fontSize: 10, color: "var(--cyan)", letterSpacing: "0.04em" }}>
            Manage \u2192
          </div>
        </div>
      </button>

      {/* Exercises tile */}
      <button
        onClick={() => openDrawer("exercises")}
        className="cc-card"
        style={{ padding: 0, cursor: "pointer", textAlign: "left", border: "1px solid var(--line)", background: "var(--bg-card)" }}
      >
        <div className="cc-card-head">
          <div className="title">Exercises</div>
          <div className="tail">{exerciseCount} in library</div>
        </div>
        <div className="cc-card-body" style={{ minHeight: 120 }}>
          {topExercises.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 10, color: "var(--ink-4)", letterSpacing: "0.06em", marginBottom: 2 }}>MOST USED</div>
              {topExercises.map(ex => (
                <div key={ex.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{ex.name}</span>
                  <span style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "var(--f-mono)" }}>{ex.count}x</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "var(--ink-4)" }}>Loading...</div>
          )}
          <div style={{ marginTop: "auto", paddingTop: 16, fontSize: 10, color: "var(--cyan)", letterSpacing: "0.04em" }}>
            Manage \u2192
          </div>
        </div>
      </button>

      {/* Analytics tile */}
      <button
        onClick={() => openDrawer("analytics")}
        className="cc-card"
        style={{ padding: 0, cursor: "pointer", textAlign: "left", border: "1px solid var(--line)", background: "var(--bg-card)" }}
      >
        <div className="cc-card-head">
          <div className="title">Analytics</div>
          <div className="tail" style={{ fontSize: 9, color: "var(--ink-4)" }}>Volume, trends, PRs</div>
        </div>
        <div className="cc-card-body" style={{ minHeight: 120 }}>
          {/* Mini 4-week bar chart */}
          {weeklyTrend.length > 0 && (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 40, marginBottom: 12 }}>
              {weeklyTrend.map((w, i) => (
                <div key={i} style={{
                  flex: 1, borderRadius: 3,
                  height: `${Math.max(8, (w.tonnage / maxTonnage) * 100)}%`,
                  background: i === weeklyTrend.length - 1 ? "var(--violet)" : "rgba(124,77,255,0.25)",
                  transition: "height 0.4s",
                }} />
              ))}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 18, fontWeight: 300, fontFamily: "var(--f-mono)", color: "var(--ink)" }}>
              {formatTonnage(thisWeekTonnage)}
            </span>
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>this week</span>
          </div>
          {pctChange !== 0 && (
            <div style={{ fontSize: 10, fontFamily: "var(--f-mono)", color: pctChange > 0 ? "var(--pos)" : "var(--neg)", marginTop: 2 }}>
              {pctChange > 0 ? "+" : ""}{pctChange}% vs last week
            </div>
          )}
          <div style={{ marginTop: "auto", paddingTop: 12, fontSize: 10, color: "var(--cyan)", letterSpacing: "0.04em" }}>
            Manage \u2192
          </div>
        </div>
      </button>
    </div>
  );
}
