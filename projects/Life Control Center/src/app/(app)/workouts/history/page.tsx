"use client";

/**
 * /workouts/history — Workout history, PRs, running log, and analytics.
 * Tabs: Sessions · PRs · Running · Analytics
 */

import { useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar, Legend,
} from "recharts";
import { format, parseISO } from "date-fns";
import { formatWorkoutDuration, formatPace } from "@/lib/utils";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────────

type WorkoutLog = {
  id: number;
  sessionName: string;
  workoutName: string;
  date: string;
  startedAt: number;
  durationSeconds: number | null;
  setCount: number;
  totalVolume: number;
};

type PR = {
  exerciseName: string;
  muscleGroup: string | null;
  bestWeightKg: number | null;
  bestReps: number | null;
  estimated1rm: number | null;
  achievedAt: string;
};

type RunLog = {
  id: number;
  date: string;
  distanceKm: number;
  durationSeconds: number;
  paceSecondsPerKm: number | null;
  notes: string | null;
};

type ExercisePoint = {
  date: string;
  bestWeightKg: number;
  repsLogged: number;
  rirLogged: number | null;
  estimated1rm: number;
};

type Exercise = { id: number; name: string; primaryMuscle: string | null };

// ── Helpers ────────────────────────────────────────────────────────────────────

const SESSION_GRAD: Record<string, string> = {
  Push:            "linear-gradient(135deg, rgba(179,136,255,0.50), rgba(126,231,255,0.20))",
  Pull:            "linear-gradient(135deg, rgba(126,231,255,0.50), rgba(179,136,255,0.20))",
  Legs:            "linear-gradient(135deg, rgba(111,212,154,0.50), rgba(126,231,255,0.20))",
  Core:            "linear-gradient(135deg, rgba(255,193,92,0.50), rgba(179,136,255,0.20))",
  "Push-Up SESH":  "linear-gradient(135deg, rgba(179,136,255,0.50), rgba(111,212,154,0.20))",
};

// ── Log Run Form ───────────────────────────────────────────────────────────────

function LogRunForm({ onLogged }: { onLogged: (run: RunLog) => void }) {
  const [open, setOpen]       = useState(false);
  const [date, setDate]       = useState(new Date().toISOString().split("T")[0]);
  const [distanceKm, setDist] = useState("");
  const [minutes, setMin]     = useState("");
  const [seconds, setSec]     = useState("0");
  const [notes, setNotes]     = useState("");
  const [saving, setSaving]   = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!distanceKm || !minutes) return;
    setSaving(true);
    const durationSeconds = Number(minutes) * 60 + Number(seconds);
    const res = await fetch("/api/workouts/run-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, distanceKm: parseFloat(distanceKm), durationSeconds, notes: notes || null }),
    });
    onLogged(await res.json());
    setDist(""); setMin(""); setSec("0"); setNotes("");
    setSaving(false);
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="cc-btn"
        style={{ width: "100%", justifyContent: "center", borderStyle: "dashed", padding: "12px 0" }}
      >
        + Log a Run
      </button>
    );
  }

  return (
    <div className="cc-card" style={{ padding: "20px 22px" }}>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 14 }}>Log Run</div>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={{ display: "block", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase" as const, color: "var(--ink-3)", fontWeight: 600, marginBottom: 6 }}>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--line)", borderRadius: 6, color: "var(--ink)", padding: "7px 10px", fontSize: 13 }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase" as const, color: "var(--ink-3)", fontWeight: 600, marginBottom: 6 }}>Distance (km)</label>
            <input required type="number" step="0.01" placeholder="5.0" value={distanceKm} onChange={(e) => setDist(e.target.value)}
              style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--line)", borderRadius: 6, color: "var(--ink)", padding: "7px 10px", fontSize: 13 }} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={{ display: "block", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase" as const, color: "var(--ink-3)", fontWeight: 600, marginBottom: 6 }}>Duration (min)</label>
            <input required type="number" placeholder="30" value={minutes} onChange={(e) => setMin(e.target.value)}
              style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--line)", borderRadius: 6, color: "var(--ink)", padding: "7px 10px", fontSize: 13 }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase" as const, color: "var(--ink-3)", fontWeight: 600, marginBottom: 6 }}>Seconds</label>
            <input type="number" min="0" max="59" placeholder="0" value={seconds} onChange={(e) => setSec(e.target.value)}
              style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--line)", borderRadius: 6, color: "var(--ink)", padding: "7px 10px", fontSize: 13 }} />
          </div>
        </div>
        <input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)}
          style={{ background: "var(--bg-input)", border: "1px solid var(--line)", borderRadius: 6, color: "var(--ink)", padding: "7px 10px", fontSize: 13 }} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="cc-btn" onClick={() => setOpen(false)}>Cancel</button>
          <button type="submit" disabled={saving} className="cc-btn-primary"
            style={{ opacity: saving ? 0.5 : 1, padding: "8px 18px", borderRadius: 8, background: "var(--grad)", color: "#0A0A14", fontWeight: 600, fontSize: 13, border: "none", cursor: "pointer" }}>
            {saving ? "Saving…" : "Save Run"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Analytics tab ──────────────────────────────────────────────────────────────

function AnalyticsTab({ logs }: { logs: WorkoutLog[] }) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [history, setHistory] = useState<ExercisePoint[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    fetch("/api/workouts/exercises")
      .then((r) => r.json())
      .then((data: Exercise[]) => {
        setExercises(data);
        if (data.length > 0) setSelectedId(data[0].id);
      });
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoadingHistory(true);
    fetch(`/api/workouts/exercise-history?exerciseId=${selectedId}`)
      .then((r) => r.json())
      .then((data: ExercisePoint[]) => { setHistory(data); setLoadingHistory(false); });
  }, [selectedId]);

  // Weekly volume from session logs (total kg moved per session, grouped by week)
  const weeklyVolume = (() => {
    const byWeek: Record<string, { week: string; volume: number; sessions: number }> = {};
    for (const log of logs) {
      const weekStart = format(parseISO(log.date), "yyyy-'W'ww");
      const weekLabel = format(parseISO(log.date), "MMM d");
      if (!byWeek[weekStart]) byWeek[weekStart] = { week: weekLabel, volume: 0, sessions: 0 };
      byWeek[weekStart].volume += log.totalVolume;
      byWeek[weekStart].sessions += 1;
    }
    return Object.values(byWeek).slice(0, 12).reverse();
  })();

  const selectedExercise = exercises.find((e) => e.id === selectedId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Weekly volume bar chart */}
      <div className="cc-card">
        <div className="cc-card-head">
          <div className="title">Weekly volume</div>
          <div className="tail">kg lifted · last 12 weeks</div>
        </div>
        <div className="cc-card-body">
          {weeklyVolume.length >= 2 ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={weeklyVolume} barSize={18}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: "var(--ink-4)" }} />
                <YAxis tick={{ fontSize: 10, fill: "var(--ink-4)" }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} width={36} />
                <Tooltip
                  contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--line)", borderRadius: 10 }}
                  labelStyle={{ color: "var(--ink-3)", fontSize: 11 }}
                  itemStyle={{ color: "var(--violet)" }}
                  formatter={(v) => [`${Math.round(Number(v)).toLocaleString()} kg`, "Volume"]}
                />
                <Bar dataKey="volume" fill="url(#volGrad)" radius={[3, 3, 0, 0]} />
                <defs>
                  <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#B388FF" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#B388FF" stopOpacity={0.2} />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 100, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-4)", fontSize: 13 }}>
              Log more sessions to see trends
            </div>
          )}
        </div>
      </div>

      {/* Exercise progression */}
      <div className="cc-card">
        <div className="cc-card-head">
          <div className="title">Exercise progression</div>
          <div className="tail">estimated 1RM over time</div>
        </div>
        <div className="cc-card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Exercise selector */}
          <select
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(Number(e.target.value))}
            style={{
              background: "var(--bg-input)", border: "1px solid var(--line)", borderRadius: 8,
              color: "var(--ink)", padding: "8px 12px", fontSize: 13, width: 280,
            }}
          >
            {exercises.map((ex) => (
              <option key={ex.id} value={ex.id}>{ex.name}</option>
            ))}
          </select>

          {loadingHistory ? (
            <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-4)", fontSize: 13 }}>
              Loading…
            </div>
          ) : history.length >= 2 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--ink-4)" }} tickFormatter={(v) => format(parseISO(v), "MMM d")} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--ink-4)" }} unit="kg" width={42} domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--line)", borderRadius: 10 }}
                    labelStyle={{ color: "var(--ink-3)", fontSize: 11 }}
                    formatter={(v, name) => [
                      name === "estimated1rm" ? `${Number(v).toFixed(1)} kg` : `${v} kg`,
                      name === "estimated1rm" ? "Est. 1RM" : "Best set",
                    ]}
                    labelFormatter={(v) => format(parseISO(v), "EEE, MMM d")}
                  />
                  <Line type="monotone" dataKey="estimated1rm" stroke="url(#progGrad)" strokeWidth={2.5}
                    dot={{ r: 3, fill: "var(--violet)" }} activeDot={{ r: 5 }} name="estimated1rm" />
                  <Line type="monotone" dataKey="bestWeightKg" stroke="rgba(126,231,255,0.50)" strokeWidth={1.5}
                    strokeDasharray="4 3" dot={false} name="bestWeightKg" />
                  <defs>
                    <linearGradient id="progGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#B388FF" />
                      <stop offset="100%" stopColor="#7EE7FF" />
                    </linearGradient>
                  </defs>
                </LineChart>
              </ResponsiveContainer>
              {/* Latest stat */}
              <div style={{ display: "flex", gap: 24, fontSize: 12, color: "var(--ink-3)" }}>
                <span>
                  <strong style={{ color: "var(--violet)", fontFamily: "var(--f-mono)" }}>
                    {history[history.length - 1]?.estimated1rm?.toFixed(1)} kg
                  </strong>{" "}est. 1RM (latest)
                </span>
                <span>
                  <strong style={{ color: "var(--ink)", fontFamily: "var(--f-mono)" }}>
                    {history[history.length - 1]?.bestWeightKg} × {history[history.length - 1]?.repsLogged}
                  </strong>{" "}last best set
                </span>
                <span style={{ color: "var(--ink-4)" }}>
                  {history.length} sessions logged
                </span>
              </div>
            </>
          ) : (
            <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-4)", fontSize: 13 }}>
              {selectedExercise?.name ? `No history yet for ${selectedExercise.name}` : "Select an exercise"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function WorkoutHistoryPage() {
  const [tab, setTab]         = useState<"history" | "prs" | "running" | "analytics">("history");
  const [logs, setLogs]       = useState<WorkoutLog[]>([]);
  const [prs, setPRs]         = useState<PR[]>([]);
  const [runs, setRuns]       = useState<RunLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/workouts/history").then((r) => r.json()),
      fetch("/api/workouts/prs").then((r) => r.json()),
      fetch("/api/workouts/run-logs").then((r) => r.json()),
    ]).then(([h, p, r]) => {
      setLogs(Array.isArray(h) ? h : []);
      setPRs(Array.isArray(p) ? p : []);
      setRuns(Array.isArray(r) ? r : []);
      setLoading(false);
    });
  }, []);

  const deleteRun = async (id: number) => {
    await fetch(`/api/workouts/run-logs?id=${id}`, { method: "DELETE" });
    setRuns((prev) => prev.filter((r) => r.id !== id));
  };

  const totalKm = runs.reduce((sum, r) => sum + r.distanceKm, 0);
  const maxDistance = Math.max(...runs.map((r) => r.distanceKm), 0);

  const TABS = [
    { id: "history", label: "Sessions", count: logs.length },
    { id: "prs", label: "Personal Records", count: prs.length },
    { id: "running", label: "Running", count: runs.length },
    { id: "analytics", label: "Analytics", count: null },
  ] as const;

  return (
    <div style={{ padding: "28px 32px 64px", maxWidth: 1100, margin: "0 auto" }}>

      {/* Page title */}
      <div className="cc-pagetitle" style={{ marginBottom: 24 }}>
        <div>
          <h1>Workout <span className="grad-text">History</span>.</h1>
          <div className="sub">{logs.length} sessions · all time</div>
        </div>
        <Link href="/workouts" className="cc-btn">← Workouts</Link>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 20, borderBottom: "1px solid var(--line)", paddingBottom: 0 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as typeof tab)}
            style={{
              padding: "8px 16px", fontSize: 13, fontWeight: tab === t.id ? 500 : 400,
              color: tab === t.id ? "var(--ink)" : "var(--ink-3)",
              background: "none", border: "none", cursor: "pointer",
              borderBottom: `2px solid ${tab === t.id ? "var(--violet)" : "transparent"}`,
              marginBottom: -1, transition: "all 0.1s",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {t.label}
            {t.count !== null && !loading && (
              <span style={{ fontSize: 10, fontFamily: "var(--f-mono)", color: "var(--ink-4)", background: "rgba(255,255,255,0.06)", padding: "2px 6px", borderRadius: 99 }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && (
        <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-4)", fontSize: 12, letterSpacing: "0.10em", textTransform: "uppercase", fontFamily: "var(--f-mono)" }}>
          Loading…
        </div>
      )}

      {/* ── Sessions tab ────────────────────────────────────────────── */}
      {!loading && tab === "history" && (
        <div className="cc-card">
          <div className="cc-card-head">
            <div className="title">Session log</div>
            <div className="tail">most recent first</div>
          </div>
          {logs.length === 0 ? (
            <div style={{ padding: "48px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>
              No sessions logged yet.{" "}
              <Link href="/workouts" style={{ color: "var(--violet)" }}>Start your first workout →</Link>
            </div>
          ) : (
            <div>
              {logs.map((log, i) => {
                const grad = SESSION_GRAD[log.sessionName];
                return (
                  <div key={log.id} style={{
                    display: "grid", gridTemplateColumns: "36px 1fr auto", gap: 14, alignItems: "center",
                    padding: "13px 16px", borderBottom: i < logs.length - 1 ? "1px solid var(--line)" : "none",
                  }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: grad ?? "var(--line)", flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{log.workoutName}</div>
                      <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2, fontFamily: "var(--f-mono)", letterSpacing: "0.04em" }}>
                        {format(parseISO(log.date), "EEE, MMM d yyyy")}
                        {log.durationSeconds ? ` · ${formatWorkoutDuration(log.durationSeconds)}` : ""}
                        {" · "}{log.setCount} sets
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, fontFamily: "var(--f-mono)", color: "var(--ink-2)" }}>
                        {log.totalVolume > 0 ? `${Math.round(log.totalVolume).toLocaleString()} kg` : "—"}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 2, letterSpacing: "0.04em" }}>volume</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── PRs tab ──────────────────────────────────────────────────── */}
      {!loading && tab === "prs" && (
        <div className="cc-card">
          <div className="cc-card-head">
            <div className="title">Personal Records</div>
            <div className="tail">best set per exercise · all time</div>
          </div>
          {prs.length === 0 ? (
            <div style={{ padding: "48px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>
              Complete a workout to see your PRs.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Exercise", "Muscle", "Best set", "Est. 1RM", "Achieved"].map((h) => (
                    <th key={h} style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase" as const, color: "var(--ink-3)", textAlign: "left", padding: "10px 16px", borderBottom: "1px solid var(--line)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {prs.map((pr) => (
                  <tr key={pr.exerciseName}>
                    <td style={{ padding: "12px 16px", fontSize: 13, borderBottom: "1px solid var(--line)", fontWeight: 500 }}>{pr.exerciseName}</td>
                    <td style={{ padding: "12px 16px", fontSize: 11, borderBottom: "1px solid var(--line)", color: "var(--ink-3)", letterSpacing: "0.04em" }}>{pr.muscleGroup ?? "—"}</td>
                    <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
                      <span className="grad-text" style={{ fontSize: 14, fontWeight: 500 }}>
                        {pr.bestWeightKg ?? "—"} kg × {pr.bestReps ?? "—"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)", fontSize: 13, fontFamily: "var(--f-mono)", color: "var(--violet)" }}>
                      {pr.estimated1rm ? `${Number(pr.estimated1rm).toFixed(1)} kg` : "—"}
                    </td>
                    <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)", fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--f-mono)" }}>
                      {pr.achievedAt ? format(parseISO(pr.achievedAt), "MMM d, yyyy") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Running tab ──────────────────────────────────────────────── */}
      {!loading && tab === "running" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Stats */}
          {runs.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {[
                { label: "Total distance", value: `${totalKm.toFixed(1)} km`, color: "var(--violet)" },
                { label: "Furthest run", value: `${maxDistance.toFixed(2)} km`, color: "var(--cyan)" },
                { label: "Total runs", value: runs.length, color: "var(--pos)" },
                { label: "Avg distance", value: `${(totalKm / runs.length).toFixed(1)} km`, color: "var(--ink-2)" },
              ].map((stat) => (
                <div key={stat.label} className="cc-card" style={{ padding: 18 }}>
                  <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase" as const, color: "var(--ink-3)", fontWeight: 600 }}>{stat.label}</div>
                  <div style={{ fontSize: 26, fontWeight: 300, letterSpacing: "-0.03em", marginTop: 6, color: stat.color, fontFamily: "var(--f-mono)" }}>{stat.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Distance chart */}
          {runs.length >= 3 && (
            <div className="cc-card">
              <div className="cc-card-head">
                <div className="title">Distance over time</div>
                <div className="tail">{runs.length} runs</div>
              </div>
              <div className="cc-card-body">
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart data={[...runs].reverse()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--ink-4)" }} tickFormatter={(v) => format(parseISO(v), "MMM d")} />
                    <YAxis tick={{ fontSize: 10, fill: "var(--ink-4)" }} unit="km" width={42} />
                    <Tooltip
                      contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--line)", borderRadius: 10 }}
                      labelStyle={{ color: "var(--ink-3)", fontSize: 11 }}
                      formatter={(v) => [`${v} km`, "Distance"]}
                      labelFormatter={(v) => format(parseISO(v), "EEEE, MMM d")}
                    />
                    <Line type="monotone" dataKey="distanceKm" stroke="url(#runGrad)" strokeWidth={2}
                      dot={{ r: 3, fill: "var(--violet)" }} activeDot={{ r: 5 }} />
                    <defs>
                      <linearGradient id="runGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#B388FF" />
                        <stop offset="100%" stopColor="#7EE7FF" />
                      </linearGradient>
                    </defs>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* 5K progress */}
          {runs.length > 0 && (
            <div className="cc-card">
              <div className="cc-card-head">
                <div className="title" style={{ color: "var(--cyan)" }}>5K Goal</div>
                <div className="tail">non-stop target</div>
              </div>
              <div className="cc-card-body">
                <div style={{ padding: 16, border: "1px solid rgba(126,231,255,0.20)", borderRadius: 12, background: "radial-gradient(60% 80% at 100% 0%, rgba(126,231,255,0.10), transparent 60%), rgba(255,255,255,0.018)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <div>
                      <div style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase" as const, color: "var(--cyan)", fontWeight: 600, marginBottom: 6 }}>Furthest non-stop</div>
                      <div style={{ fontSize: 32, fontWeight: 200, letterSpacing: "-0.03em", fontFamily: "var(--f-mono)" }}>
                        {maxDistance.toFixed(2)}<span style={{ color: "var(--ink-3)", fontSize: 16 }}> / 5.0 km</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 300, color: "var(--cyan)", fontFamily: "var(--f-mono)" }}>
                      {Math.min(100, Math.round((maxDistance / 5) * 100))}%
                    </div>
                  </div>
                  <div style={{ marginTop: 12, height: 5, background: "rgba(255,255,255,0.04)", borderRadius: 99 }}>
                    <div style={{ height: "100%", width: `${Math.min(100, (maxDistance / 5) * 100)}%`, background: "var(--grad)", borderRadius: 99, transition: "width 0.6s" }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          <LogRunForm onLogged={(run) => setRuns((prev) => [run, ...prev])} />

          {runs.length === 0 && (
            <div className="cc-card" style={{ padding: "48px 0", textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "var(--ink-3)" }}>No runs logged yet.</div>
            </div>
          )}

          {/* Run list */}
          <div className="cc-card">
            <div className="cc-card-head">
              <div className="title">Run log</div>
              <div className="tail">{runs.length} runs</div>
            </div>
            {runs.map((run, i) => (
              <div key={run.id} style={{
                display: "grid", gridTemplateColumns: "1fr auto", gap: 14, alignItems: "center",
                padding: "13px 16px", borderBottom: i < runs.length - 1 ? "1px solid var(--line)" : "none",
              }}>
                <div>
                  <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                    <span className="grad-text" style={{ fontSize: 18, fontWeight: 400, letterSpacing: "-0.02em" }}>{run.distanceKm} km</span>
                    {run.paceSecondsPerKm && (
                      <span style={{ fontSize: 12, color: "var(--ink-3)", fontFamily: "var(--f-mono)" }}>{formatPace(run.paceSecondsPerKm)}/km</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2, letterSpacing: "0.04em", fontFamily: "var(--f-mono)" }}>
                    {format(parseISO(run.date), "EEE, MMM d yyyy")} · {Math.floor(run.durationSeconds / 60)}m {run.durationSeconds % 60}s
                    {run.notes ? ` · ${run.notes}` : ""}
                  </div>
                </div>
                <button onClick={() => deleteRun(run.id)}
                  style={{ color: "var(--ink-4)", padding: "4px 8px", cursor: "pointer", background: "none", border: "none", fontSize: 18, lineHeight: 1 }}>
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Analytics tab ────────────────────────────────────────────── */}
      {!loading && tab === "analytics" && (
        <AnalyticsTab logs={logs} />
      )}
    </div>
  );
}
