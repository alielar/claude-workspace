"use client";

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";

const MUSCLE_LABELS: Record<string, string> = {
  chest: "Chest", lats: "Back", upper_back: "Upper Back", traps: "Traps",
  front_delts: "Front Delts", side_delts: "Side Delts", rear_delts: "Rear Delts",
  biceps: "Biceps", triceps: "Triceps", forearms: "Forearms",
  quads: "Quads", hamstrings: "Hamstrings", glutes: "Glutes", calves: "Calves",
  abs: "Abs", obliques: "Obliques", serratus: "Serratus",
};

const TARGET_SETS = 10; // Default MEV target per muscle group per week

interface WeeklyData {
  weekStart: string;
  weekEnd: string;
  volume: Record<string, number>;
}

export default function WeeklyVolume() {
  const [data, setData] = useState<WeeklyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/workouts/weekly-volume")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="cc-card" style={{ marginBottom: 14 }}>
        <div className="cc-card-head">
          <div className="title">This Week</div>
        </div>
        <div className="cc-card-body">
          <div className="skeleton" style={{ height: 32, borderRadius: 6, marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 32, borderRadius: 6, marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 32, borderRadius: 6 }} />
        </div>
      </div>
    );
  }

  if (!data || Object.keys(data.volume).length === 0) return null;

  // Sort muscles by volume descending, show top 5
  const sorted = Object.entries(data.volume)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const totalSets = Object.values(data.volume).reduce((a, b) => a + b, 0);

  return (
    <div className="cc-card" style={{ marginBottom: 14 }}>
      <div className="cc-card-head">
        <div className="title">This Week</div>
        <div className="tail" style={{ fontFamily: "var(--f-mono)", fontSize: 10 }}>
          {format(parseISO(data.weekStart), "MMM d")} - {format(parseISO(data.weekEnd), "MMM d")}
        </div>
      </div>
      <div className="cc-card-body">
        {/* Total sets hero */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 32, fontWeight: 200, fontFamily: "var(--f-mono)", color: "var(--ink)" }}>
            {totalSets}
          </span>
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>total sets</span>
        </div>

        {/* Muscle bars */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sorted.map(([muscle, sets]) => {
            const pct = Math.min(100, (sets / TARGET_SETS) * 100);
            const isOver = sets >= TARGET_SETS;
            return (
              <div key={muscle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: "var(--ink-2)" }}>
                    {MUSCLE_LABELS[muscle] ?? muscle}
                  </span>
                  <span style={{
                    fontSize: 11, fontFamily: "var(--f-mono)",
                    color: isOver ? "var(--pos)" : "var(--ink-3)",
                  }}>
                    {sets} / {TARGET_SETS}
                  </span>
                </div>
                <div style={{ height: 4, background: "var(--line)", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", width: `${pct}%`, borderRadius: 99,
                    background: isOver ? "var(--pos)" : "var(--grad)",
                    transition: "width 0.4s",
                  }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Remaining muscles count */}
        {Object.keys(data.volume).length > 5 && (
          <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 12, textAlign: "center" }}>
            +{Object.keys(data.volume).length - 5} more muscle groups
          </div>
        )}
      </div>
    </div>
  );
}
