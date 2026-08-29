"use client";

import { useEffect, useState, useRef } from "react";
import { format, parseISO } from "date-fns";

const MUSCLE_LABELS: Record<string, string> = {
  chest: "Chest", lats: "Back", upper_back: "Upper Back", traps: "Traps",
  front_delts: "Front Delts", side_delts: "Side Delts", rear_delts: "Rear Delts",
  biceps: "Biceps", triceps: "Triceps", forearms: "Forearms",
  quads: "Quads", hamstrings: "Hamstrings", glutes: "Glutes", calves: "Calves",
  abs: "Abs", obliques: "Obliques", serratus: "Serratus",
};

const TARGET_SETS = 10;
const PAGE_SIZE = 5;

interface WeeklyData {
  weekStart: string;
  weekEnd: string;
  volume: Record<string, number>;
}

export default function WeeklyVolume() {
  const [data, setData] = useState<WeeklyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const touchStartX = useRef(0);

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

  const sorted = Object.entries(data.volume).sort((a, b) => b[1] - a[1]);
  const totalSets = sorted.reduce((a, b) => a + b[1], 0);
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const visible = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 40) {
      if (dx < 0 && page < totalPages - 1) setPage(p => p + 1);
      if (dx > 0 && page > 0) setPage(p => p - 1);
    }
  }

  return (
    <div className="cc-card" style={{ marginBottom: 14 }}>
      <div className="cc-card-head">
        <div className="title">This Week</div>
        <div className="tail" style={{ fontFamily: "var(--f-mono)", fontSize: 10 }}>
          {format(parseISO(data.weekStart), "MMM d")} - {format(parseISO(data.weekEnd), "MMM d")}
        </div>
      </div>
      <div
        className="cc-card-body"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Total sets hero */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 32, fontWeight: 200, fontFamily: "var(--f-mono)", color: "var(--ink)" }}>
            {totalSets}
          </span>
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>total sets</span>
        </div>

        {/* Muscle bars */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {visible.map(([muscle, sets]) => {
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
                    background: isOver ? "var(--pos)" : "var(--violet)",
                    transition: "width 0.4s",
                  }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination dots */}
        {totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 14 }}>
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                style={{
                  width: i === page ? 16 : 6, height: 6, borderRadius: 99,
                  background: i === page ? "var(--violet)" : "var(--ink-5)",
                  border: "none", cursor: "pointer", padding: 0,
                  transition: "all 0.2s",
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
