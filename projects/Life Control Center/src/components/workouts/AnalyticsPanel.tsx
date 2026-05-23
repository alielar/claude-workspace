"use client";
/**
 * /workouts/analytics — 5 sections:
 *  1. Volume per muscle group (sets/week vs MEV/MAV/MRV zones)
 *  2. Weekly volume trend (tonnage, 12 weeks)
 *  3. Exercise progression (best weight / est 1RM over time)
 *  4. PR timeline (reverse-chrono, filter by push/pull/legs)
 *  5. Consistency heatmap (year view)
 */

import { useEffect, useState, useCallback } from "react";
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { format, parseISO } from "date-fns";

// ── Types ────────────────────────────────────────────────────────────────────

interface AnalyticsData {
  muscleVolume: {
    thisWeek:      Record<string, number>;
    lastWeek:      Record<string, number>;
    last4WeeksAvg: Record<string, number>;
  };
  weeklyTrend: Array<{ weekStart: string; tonnage: number; sessions: number }>;
  exercises:   Array<{ id: number; name: string; primaryMuscle: string | null }>;
  prTimeline:  Array<{
    id: number;
    exerciseName: string;
    muscleGroup: string | null;
    bestWeightKg: number | null;
    bestReps: number | null;
    estimated1rm: number | null;
    achievedAt: string;
  }>;
  heatmap: Array<{ date: string; workoutName: string | null; durationSeconds: number | null }>;
  stats: { totalThisYear: number; currentStreak: number; longestStreak: number };
}

interface ExercisePoint {
  date: string;
  bestWeightKg: number;
  repsLogged: number;
  estimated1rm: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const MEV = 10;
const MAV_HIGH = 20;
const MRV = 22;

const MUSCLE_ORDER = [
  "chest", "front_delts", "side_delts", "rear_delts", "triceps",
  "lats", "upper_back", "upper_traps", "biceps", "forearms",
  "quads", "hamstrings", "glutes", "calves",
  "abs", "obliques",
];

const MUSCLE_LABELS: Record<string, string> = {
  chest: "Chest", front_delts: "Front Delts", side_delts: "Side Delts",
  rear_delts: "Rear Delts", triceps: "Triceps", biceps: "Biceps",
  lats: "Lats", upper_back: "Upper Back", upper_traps: "Traps",
  quads: "Quads", hamstrings: "Hams", glutes: "Glutes",
  calves: "Calves", abs: "Abs", obliques: "Obliques",
  forearms: "Forearms",
};

// push/pull/legs classification by primary_muscle
const PUSH_MUSCLES  = new Set(["chest", "front_delts", "side_delts", "triceps"]);
const PULL_MUSCLES  = new Set(["lats", "upper_back", "upper_traps", "rear_delts", "biceps", "forearms"]);
const LEGS_MUSCLES  = new Set(["quads", "hamstrings", "glutes", "calves"]);

function muscleZoneColor(sets: number): string {
  if (sets === 0) return "var(--line)";
  if (sets < MEV) return "var(--warn)";
  if (sets <= MAV_HIGH) return "var(--pos)";
  if (sets <= MRV) return "rgba(255,193,92,0.70)"; // amber
  return "var(--neg)";
}

function formatDuration(s: number | null): string {
  if (!s) return "-";
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

function daysAgo(dateStr: string): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
  const diff = Math.round((new Date(today).getTime() - new Date(dateStr).getTime()) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "yesterday";
  return `${diff}d ago`;
}

// ── Section 1: Muscle Volume ─────────────────────────────────────────────────

function MuscleVolumeSection({ data }: { data: AnalyticsData["muscleVolume"] }) {
  const [view, setView] = useState<"thisWeek" | "last4">( "thisWeek");

  const current  = view === "thisWeek" ? data.thisWeek : data.last4WeeksAvg;
  const maxSets  = Math.max(MRV + 2, ...Object.values(current));
  const allMuscles = MUSCLE_ORDER.filter(
    (m) => (current[m] ?? 0) > 0 || (data.thisWeek[m] ?? 0) > 0
  );

  const thisWeekTotal  = Object.values(data.thisWeek).reduce((a, b) => a + b, 0);
  const lastWeekTotal  = Object.values(data.lastWeek).reduce((a, b) => a + b, 0);
  const delta = thisWeekTotal - lastWeekTotal;

  return (
    <div className="cc-card" style={{ marginBottom: 14 }}>
      <div className="cc-card-head">
        <div className="title">Volume per Muscle Group</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--ink-4)" }}>
            {thisWeekTotal} sets this week
            {delta !== 0 && (
              <span style={{ color: delta > 0 ? "var(--pos)" : "var(--neg)", marginLeft: 6 }}>
                {delta > 0 ? "+" : ""}{delta} vs last
              </span>
            )}
          </span>
          {(["thisWeek", "last4"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: "3px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                border: `1px solid ${view === v ? "var(--violet)" : "var(--line)"}`,
                background: view === v ? "rgba(179,136,255,0.15)" : "transparent",
                color: view === v ? "var(--violet)" : "var(--ink-4)",
              }}
            >
              {v === "thisWeek" ? "This week" : "4-week avg"}
            </button>
          ))}
        </div>
      </div>
      <div className="cc-card-body">
        {allMuscles.length === 0 ? (
          <div style={{ color: "var(--ink-4)", fontSize: 13, fontFamily: "var(--f-mono)", padding: "24px 0" }}>
            No sets logged this week yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Zone legend */}
            <div style={{ display: "flex", gap: 16, marginBottom: 4, fontSize: 10, color: "var(--ink-4)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--warn)", display: "inline-block" }} />
                Below MEV (&lt;{MEV})
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--pos)", display: "inline-block" }} />
                MAV zone ({MEV}–{MAV_HIGH})
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: "rgba(255,193,92,0.70)", display: "inline-block" }} />
                Near MRV ({MAV_HIGH + 1}–{MRV})
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--neg)", display: "inline-block" }} />
                Exceeds MRV (&gt;{MRV})
              </span>
            </div>
            {allMuscles.map((muscle) => {
              const sets = current[muscle] ?? 0;
              const lastWk = data.lastWeek[muscle] ?? 0;
              const diff = view === "thisWeek" ? sets - lastWk : 0;
              const pct = Math.min(sets / maxSets, 1);
              const zoneColor = muscleZoneColor(sets);
              return (
                <div key={muscle} style={{ display: "grid", gridTemplateColumns: "100px 1fr 40px 48px", alignItems: "center", gap: 10 }}>
                  <div style={{ fontSize: 11.5, color: "var(--ink-2)", textAlign: "right", letterSpacing: "0.01em" }}>
                    {MUSCLE_LABELS[muscle] ?? muscle}
                  </div>
                  <div style={{ position: "relative", height: 22, background: "rgba(255,255,255,0.04)", borderRadius: 4, overflow: "hidden" }}>
                    {/* Zone bands */}
                    <div style={{ position: "absolute", left: `${MEV / maxSets * 100}%`, top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.10)" }} />
                    <div style={{ position: "absolute", left: `${MAV_HIGH / maxSets * 100}%`, top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.10)" }} />
                    <div style={{ position: "absolute", left: `${MRV / maxSets * 100}%`, top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.10)" }} />
                    {/* Filled bar */}
                    <div style={{
                      position: "absolute", left: 0, top: 0, bottom: 0,
                      width: `${pct * 100}%`,
                      background: zoneColor,
                      borderRadius: 4,
                      transition: "width 0.4s ease",
                    }} />
                  </div>
                  <div style={{ fontSize: 12, fontFamily: "var(--f-mono)", color: "var(--ink)", textAlign: "right" }}>
                    {sets}
                  </div>
                  <div style={{ fontSize: 10.5, fontFamily: "var(--f-mono)", color: diff > 0 ? "var(--pos)" : diff < 0 ? "var(--neg)" : "var(--ink-4)", textAlign: "right" }}>
                    {view === "thisWeek" && diff !== 0 ? (diff > 0 ? `+${diff}` : `${diff}`) : ""}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Section 2: Weekly Volume Trend ───────────────────────────────────────────

function WeeklyTrendSection({ data }: { data: AnalyticsData["weeklyTrend"] }) {
  const nonZero = data.filter((w) => w.tonnage > 0);
  const avgTonnage = nonZero.length > 0
    ? Math.round(nonZero.reduce((s, w) => s + w.tonnage, 0) / nonZero.length)
    : 0;
  const thisWeek = data[data.length - 1];
  const pctVsAvg = avgTonnage > 0
    ? Math.round(((thisWeek.tonnage - avgTonnage) / avgTonnage) * 100)
    : 0;

  const chartData = data.map((w) => ({
    week: format(parseISO(w.weekStart), "MMM d"),
    tonnage: w.tonnage,
    sessions: w.sessions,
  }));

  return (
    <div className="cc-card" style={{ marginBottom: 14 }}>
      <div className="cc-card-head">
        <div className="title">Weekly Volume Trend</div>
        <div style={{ fontSize: 11, color: "var(--ink-4)" }}>
          This week: <span style={{ color: "var(--ink)", fontFamily: "var(--f-mono)" }}>
            {thisWeek.tonnage.toLocaleString()} kg
          </span>
          {pctVsAvg !== 0 && (
            <span style={{ color: pctVsAvg > 0 ? "var(--pos)" : "var(--neg)", marginLeft: 6 }}>
              {pctVsAvg > 0 ? "+" : ""}{pctVsAvg}% vs avg
            </span>
          )}
        </div>
      </div>
      <div className="cc-card-body">
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData} margin={{ top: 8, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#B388FF" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#7EE7FF" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="week" tick={{ fill: "var(--ink-4)", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "var(--ink-4)", fontSize: 10 }} axisLine={false} tickLine={false}
              tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
            <Tooltip
              contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "var(--ink-3)" }}
              formatter={(v) => [`${Number(v).toLocaleString()} kg`, "Tonnage"]}
            />
            <Area type="monotone" dataKey="tonnage" stroke="#B388FF" strokeWidth={2}
              fill="url(#volGrad)" dot={{ fill: "#B388FF", r: 3 }} activeDot={{ r: 5 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Section 3: Exercise Progression ─────────────────────────────────────────

function ExerciseProgressionSection({
  exercises,
}: {
  exercises: AnalyticsData["exercises"];
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [metric, setMetric] = useState<"weight" | "1rm">("weight");
  const [points, setPoints] = useState<ExercisePoint[] | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchHistory = useCallback(async (id: number) => {
    setLoading(true);
    setPoints(null);
    try {
      const r = await fetch(`/api/workouts/exercise-history?exerciseId=${id}`);
      const data = await r.json();
      setPoints(Array.isArray(data) ? data : []);
    } catch {
      setPoints([]);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = parseInt(e.target.value);
    if (!isNaN(id)) {
      setSelectedId(id);
      fetchHistory(id);
    } else {
      setSelectedId(null);
      setPoints(null);
    }
  }

  const chartData = points?.map((p) => ({
    date: format(parseISO(p.date), "MMM d"),
    value: metric === "weight" ? p.bestWeightKg : Math.round(p.estimated1rm * 10) / 10,
  })) ?? [];

  const latestValue = chartData.length > 0 ? chartData[chartData.length - 1].value : null;
  const firstValue  = chartData.length > 1 ? chartData[0].value : null;
  const gain = latestValue != null && firstValue != null ? Math.round((latestValue - firstValue) * 10) / 10 : null;

  return (
    <div className="cc-card" style={{ marginBottom: 14 }}>
      <div className="cc-card-head">
        <div className="title">Exercise Progression</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {(["weight", "1rm"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              style={{
                padding: "3px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                border: `1px solid ${metric === m ? "var(--cyan)" : "var(--line)"}`,
                background: metric === m ? "rgba(126,231,255,0.12)" : "transparent",
                color: metric === m ? "var(--cyan)" : "var(--ink-4)",
              }}
            >
              {m === "weight" ? "Best weight" : "Est 1RM"}
            </button>
          ))}
        </div>
      </div>
      <div className="cc-card-body">
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
          <select
            value={selectedId ?? ""}
            onChange={handleSelect}
            style={{
              background: "var(--bg-input)", border: "1px solid var(--line)",
              color: "var(--ink)", padding: "8px 12px", borderRadius: 8,
              fontSize: 13, flex: 1, maxWidth: 320,
            }}
          >
            <option value="">Select exercise...</option>
            {exercises.map((ex) => (
              <option key={ex.id} value={ex.id}>{ex.name}</option>
            ))}
          </select>
          {gain != null && (
            <span style={{
              fontSize: 12, fontFamily: "var(--f-mono)",
              color: gain >= 0 ? "var(--pos)" : "var(--neg)",
            }}>
              {gain >= 0 ? "+" : ""}{gain} kg since start
            </span>
          )}
        </div>

        {loading && (
          <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-4)", fontSize: 12, fontFamily: "var(--f-mono)" }}>
            Loading…
          </div>
        )}

        {!selectedId && !loading && (
          <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-4)", fontSize: 12, fontFamily: "var(--f-mono)" }}>
            Select an exercise to see its progression
          </div>
        )}

        {points && points.length === 0 && (
          <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-4)", fontSize: 12, fontFamily: "var(--f-mono)" }}>
            No sessions logged for this exercise yet
          </div>
        )}

        {points && points.length > 0 && !loading && (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 8, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: "var(--ink-4)", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "var(--ink-4)", fontSize: 10 }} axisLine={false} tickLine={false}
                domain={["auto", "auto"]}
                tickFormatter={(v: number) => `${v}kg`} />
              <Tooltip
                contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "var(--ink-3)" }}
                formatter={(v) => [`${Number(v)} kg`, metric === "weight" ? "Best weight" : "Est 1RM"]}
              />
              <Line type="monotone" dataKey="value" stroke="#7EE7FF" strokeWidth={2}
                dot={{ fill: "#7EE7FF", r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ── Section 4: PR Timeline ───────────────────────────────────────────────────

function PRTimelineSection({ prs }: { prs: AnalyticsData["prTimeline"] }) {
  const [filter, setFilter] = useState<"all" | "push" | "pull" | "legs">("all");

  const filtered = prs.filter((pr) => {
    if (filter === "all") return true;
    const m = pr.muscleGroup ?? "";
    if (filter === "push") return PUSH_MUSCLES.has(m);
    if (filter === "pull") return PULL_MUSCLES.has(m);
    if (filter === "legs") return LEGS_MUSCLES.has(m);
    return true;
  });

  return (
    <div className="cc-card" style={{ marginBottom: 14 }}>
      <div className="cc-card-head">
        <div className="title">PR Timeline</div>
        <div style={{ display: "flex", gap: 6 }}>
          {(["all", "push", "pull", "legs"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: "3px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                border: `1px solid ${filter === f ? "var(--violet)" : "var(--line)"}`,
                background: filter === f ? "rgba(179,136,255,0.15)" : "transparent",
                color: filter === f ? "var(--violet)" : "var(--ink-4)",
                textTransform: "capitalize" as const,
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      <div className="cc-card-body">
        {filtered.length === 0 ? (
          <div style={{ color: "var(--ink-4)", fontSize: 13, fontFamily: "var(--f-mono)", padding: "12px 0" }}>
            No PRs recorded yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {filtered.map((pr, i) => (
              <div
                key={pr.id}
                style={{
                  display: "grid", gridTemplateColumns: "80px 1fr auto",
                  alignItems: "center", gap: 16,
                  padding: "12px 0",
                  borderBottom: i < filtered.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                }}
              >
                <div>
                  <div style={{ fontSize: 11, fontFamily: "var(--f-mono)", color: "var(--ink-4)", letterSpacing: "0.04em" }}>
                    {pr.achievedAt}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 2 }}>
                    {daysAgo(pr.achievedAt)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{pr.exerciseName}</div>
                  {pr.muscleGroup && (
                    <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 2 }}>
                      {MUSCLE_LABELS[pr.muscleGroup] ?? pr.muscleGroup}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 15, fontFamily: "var(--f-mono)", color: "var(--warn)", fontWeight: 500 }}>
                    {pr.bestWeightKg != null ? `${pr.bestWeightKg}kg` : "BW"}
                    {pr.bestReps != null && (
                      <span style={{ color: "var(--ink-3)", fontWeight: 300 }}> × {pr.bestReps}</span>
                    )}
                  </div>
                  {pr.estimated1rm != null && (
                    <div style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "var(--f-mono)", marginTop: 2 }}>
                      est. 1RM {Math.round(pr.estimated1rm)}kg
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Section 5: Consistency Heatmap ───────────────────────────────────────────

const HEATMAP_WORKOUT_COLOR: Record<string, string> = {
  Push:           "rgba(179,136,255,0.85)",
  Pull:           "rgba(126,231,255,0.85)",
  Legs:           "rgba(111,212,154,0.85)",
  "Push-Up SESH": "rgba(255,193,92,0.85)",
};

function ConsistencyHeatmapSection({
  heatmap,
  stats,
}: {
  heatmap: AnalyticsData["heatmap"];
  stats: AnalyticsData["stats"];
}) {
  const sessionMap = new Map(heatmap.map((s) => [s.date, s]));
  const [tooltip, setTooltip] = useState<{ date: string; name: string | null; dur: number | null } | null>(null);

  // Build year grid starting from Jan 1
  const year = new Date().getFullYear();
  const jan1 = new Date(`${year}-01-01T12:00:00Z`);
  const startDay = jan1.getUTCDay(); // 0=Sun … need to pad to Monday start
  const padDays = startDay === 0 ? 6 : startDay - 1; // days to prepend as empty

  // Total days to show (pad + days in year)
  const daysInYear = (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365;
  const totalCells = padDays + daysInYear;
  const weeks = Math.ceil(totalCells / 7);

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());

  return (
    <div className="cc-card" style={{ marginBottom: 14 }}>
      <div className="cc-card-head">
        <div className="title">Consistency · {year}</div>
        <div style={{ display: "flex", gap: 20, fontSize: 11, color: "var(--ink-4)" }}>
          <span>
            <span style={{ color: "var(--ink)", fontFamily: "var(--f-mono)", fontWeight: 500 }}>{stats.totalThisYear}</span> workouts
          </span>
          <span>
            <span style={{ color: "var(--ink)", fontFamily: "var(--f-mono)", fontWeight: 500 }}>{stats.currentStreak}</span> current streak
          </span>
          <span>
            <span style={{ color: "var(--ink)", fontFamily: "var(--f-mono)", fontWeight: 500 }}>{stats.longestStreak}</span> longest
          </span>
        </div>
      </div>
      <div className="cc-card-body" style={{ overflowX: "auto" }}>
        {/* Month labels */}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${weeks}, 12px)`, gap: 3, marginBottom: 4, paddingLeft: 0 }}>
          {Array.from({ length: weeks }, (_, wi) => {
            const cellIndex = wi * 7;
            if (cellIndex < padDays) return <div key={wi} />;
            const dayIndex = cellIndex - padDays;
            const d = new Date(jan1);
            d.setUTCDate(d.getUTCDate() + dayIndex);
            const dom = d.getUTCDate();
            // Show month label on first occurrence
            if (dom <= 7) {
              return (
                <div key={wi} style={{ fontSize: 9, color: "var(--ink-4)", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
                  {d.toLocaleString("en", { month: "short" })}
                </div>
              );
            }
            return <div key={wi} />;
          })}
        </div>

        {/* Grid */}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${weeks}, 12px)`, gridTemplateRows: "repeat(7, 12px)", gap: 3 }}>
          {Array.from({ length: weeks * 7 }, (_, i) => {
            const col = Math.floor(i / 7);
            const row = i % 7;
            const cellIndex = col * 7 + row;
            if (cellIndex < padDays || cellIndex >= padDays + daysInYear) {
              return <div key={i} style={{ width: 12, height: 12 }} />;
            }
            const dayIndex = cellIndex - padDays;
            const d = new Date(jan1);
            d.setUTCDate(d.getUTCDate() + dayIndex);
            const dateStr = d.toISOString().slice(0, 10);
            const session = sessionMap.get(dateStr);
            const isFuture = dateStr > today;
            const isToday = dateStr === today;

            // Short name (strip legacy "ProgramName (Plan)" prefix)
            const rawName = session?.workoutName ?? null;
            const shortName = rawName ? (rawName.match(/\((.+)\)/)?.[1] ?? rawName) : null;
            const color = shortName ? (HEATMAP_WORKOUT_COLOR[shortName] ?? "rgba(179,136,255,0.80)") : null;

            return (
              <div
                key={i}
                onMouseEnter={() => session && setTooltip({ date: dateStr, name: shortName, dur: session.durationSeconds })}
                onMouseLeave={() => setTooltip(null)}
                title={session ? `${dateStr} · ${shortName ?? "Workout"} · ${formatDuration(session.durationSeconds)}` : dateStr}
                style={{
                  width: 12, height: 12, borderRadius: 2,
                  background: color ?? (isFuture ? "transparent" : "rgba(255,255,255,0.04)"),
                  border: isToday ? "1px solid var(--violet)" : color ? "none" : "1px solid rgba(255,255,255,0.06)",
                  cursor: session ? "default" : "default",
                  transition: "opacity 0.1s",
                }}
              />
            );
          })}
        </div>

        {/* Tooltip */}
        {tooltip && (
          <div style={{
            marginTop: 10, padding: "6px 12px", borderRadius: 8,
            background: "rgba(255,255,255,0.06)", border: "1px solid var(--line)",
            fontSize: 12, color: "var(--ink-2)", display: "inline-block",
          }}>
            <strong>{tooltip.name ?? "Workout"}</strong> · {tooltip.date} · {formatDuration(tooltip.dur)}
          </div>
        )}

        {/* Legend */}
        <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "var(--ink-4)" }}>Less</span>
          {["rgba(255,255,255,0.04)", "rgba(179,136,255,0.30)", "rgba(179,136,255,0.55)", "rgba(179,136,255,0.85)"].map((c, i) => (
            <div key={i} style={{ width: 12, height: 12, borderRadius: 2, background: c, border: "1px solid rgba(255,255,255,0.06)" }} />
          ))}
          <span style={{ fontSize: 10, color: "var(--ink-4)" }}>More</span>
          <span style={{ marginLeft: 12, display: "flex", gap: 8 }}>
            {Object.entries(HEATMAP_WORKOUT_COLOR).map(([name, color]) => (
              <span key={name} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--ink-4)" }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                {name}
              </span>
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Panel ────────────────────────────────────────────────────────────────────

export default function AnalyticsPanel() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/workouts/analytics")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d: AnalyticsData) => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  return (
    <div style={{ padding: "0 24px 40px" }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>
          Analytics<span className="grad-text">.</span>
        </h2>
        <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>Volume · Progression · PRs · Consistency</div>
      </div>

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[240, 240, 280, 320, 200].map((h, i) => (
            <div key={i} className="cc-card" style={{ height: h, opacity: 0.4 }}>
              <div className="cc-card-head"><div className="title">—</div></div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="cc-card" style={{ padding: 48, textAlign: "center" }}>
          <div style={{ color: "var(--neg)", fontSize: 13 }}>Failed to load analytics data.</div>
        </div>
      )}

      {data && (
        <>
          <MuscleVolumeSection    data={data.muscleVolume} />
          <WeeklyTrendSection     data={data.weeklyTrend} />
          <ExerciseProgressionSection exercises={data.exercises} />
          <PRTimelineSection      prs={data.prTimeline} />
          <ConsistencyHeatmapSection  heatmap={data.heatmap} stats={data.stats} />
        </>
      )}
    </div>
  );
}
