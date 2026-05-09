"use client";

/**
 * /workouts/history — Workout analytics & running log.
 *
 * Tabs:
 * 1. History   — log of all sessions (date, name, duration, set count)
 * 2. PRs       — personal records per exercise (best weight × reps + e1RM)
 * 3. Running   — run log with distance, duration, pace + log new run form
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { format, parseISO } from "date-fns";
import {
  Dumbbell,
  Trophy,
  Timer,
  Plus,
  Trash2,
  TrendingUp,
  ChevronLeft,
  Activity,
} from "lucide-react";
import { formatWorkoutDuration, formatPace } from "@/lib/utils";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

type WorkoutLog = {
  id: number;
  sessionName: string;
  startedAt: number;
  durationSeconds: number | null;
  setCount: number;
};

type PR = {
  exerciseName: string;
  muscleGroup: string | null;
  bestWeightKg: number | null;
  bestReps: number | null;
  estimated1rm: number | null;
  achievedAt: number;
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
  estimated1rm: number;
};

// ── Session color map ─────────────────────────────────────────────────────────

const SESSION_COLORS: Record<string, string> = {
  Push: "var(--workout-color)",
  Pull: "#60a5fa",
  Legs: "#4ade80",
  Core: "#f472b6",
  "Push-Up Skill": "#a78bfa",
};

// ── Run log form ──────────────────────────────────────────────────────────────

function LogRunForm({ onLogged }: { onLogged: (run: RunLog) => void }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [distanceKm, setDistanceKm] = useState("");
  const [minutes, setMinutes] = useState("");
  const [seconds, setSeconds] = useState("0");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!distanceKm || !minutes) return;
    setLoading(true);
    const durationSeconds = Number(minutes) * 60 + Number(seconds);
    const res = await fetch("/api/workouts/run-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        distanceKm: parseFloat(distanceKm),
        durationSeconds,
        notes: notes || null,
      }),
    });
    const run = await res.json();
    onLogged(run);
    setDistanceKm(""); setMinutes(""); setSeconds("0"); setNotes("");
    setLoading(false);
    setOpen(false);
  };

  return (
    <div>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full glass rounded-2xl p-4 flex items-center gap-2 text-sm font-medium transition-all hover:scale-[1.005]"
          style={{ color: "var(--workout-color)" }}
        >
          <Plus size={16} /> Log a Run
        </button>
      ) : (
        <form onSubmit={submit} className="glass rounded-2xl p-4 space-y-3">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Log Run</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                style={{ background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--glass-border)" }}
              />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>Distance (km)</label>
              <input
                required
                type="number"
                step="0.01"
                placeholder="5.0"
                value={distanceKm}
                onChange={(e) => setDistanceKm(e.target.value)}
                className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                style={{ background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--glass-border)" }}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>Duration (min)</label>
              <input
                required
                type="number"
                placeholder="30"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                style={{ background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--glass-border)" }}
              />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>Seconds</label>
              <input
                type="number"
                min="0"
                max="59"
                placeholder="0"
                value={seconds}
                onChange={(e) => setSeconds(e.target.value)}
                className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                style={{ background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--glass-border)" }}
              />
            </div>
          </div>
          <input
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-xl px-3 py-2 text-sm outline-none"
            style={{ background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--glass-border)" }}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-2 rounded-xl text-sm"
              style={{ color: "var(--text-muted)" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
              style={{ background: "var(--workout-color)", color: "#fff" }}
            >
              {loading ? "Saving…" : "Save Run"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function WorkoutHistoryPage() {
  const [tab, setTab] = useState<"history" | "prs" | "running">("history");
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [prs, setPRs] = useState<PR[]>([]);
  const [runs, setRuns] = useState<RunLog[]>([]);
  const [loading, setLoading] = useState(true);

  // For exercise chart drill-down
  const [selectedExercise, setSelectedExercise] = useState<{ id: number; name: string } | null>(null);
  const [chartData, setChartData] = useState<ExercisePoint[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/workouts/history").then((r) => r.json()),
      fetch("/api/workouts/prs").then((r) => r.json()),
      fetch("/api/workouts/run-logs").then((r) => r.json()),
    ]).then(([h, p, r]) => {
      setLogs(h);
      setPRs(p);
      setRuns(r);
      setLoading(false);
    });
  }, []);

  const loadExerciseChart = async (exerciseId: number, exerciseName: string) => {
    if (selectedExercise?.id === exerciseId) {
      setSelectedExercise(null);
      return;
    }
    setSelectedExercise({ id: exerciseId, name: exerciseName });
    setChartLoading(true);
    const data = await fetch(`/api/workouts/exercise-history?exerciseId=${exerciseId}`).then((r) => r.json());
    setChartData(data);
    setChartLoading(false);
  };

  const deleteRun = async (id: number) => {
    await fetch(`/api/workouts/run-logs?id=${id}`, { method: "DELETE" });
    setRuns((prev) => prev.filter((r) => r.id !== id));
  };

  // Running stats
  const totalKm = runs.reduce((sum, r) => sum + r.distanceKm, 0);
  const totalRuns = runs.length;

  return (
    <div className="page-enter p-5 md:p-10 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/workouts" className="p-1.5 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
          <ChevronLeft size={18} style={{ color: "var(--text-muted)" }} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>History</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            {logs.length} sessions logged
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl p-1 gap-1" style={{ background: "var(--bg-elevated)" }}>
        {(["history", "prs", "running"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: tab === t ? "var(--workout-color)" : "transparent",
              color: tab === t ? "#fff" : "var(--text-muted)",
            }}
          >
            {t === "history" ? "Sessions" : t === "prs" ? "PRs" : "Running"}
          </button>
        ))}
      </div>

      {loading && <div className="glass rounded-2xl h-40 animate-pulse" />}

      {/* ── Sessions tab ── */}
      {!loading && tab === "history" && (
        <div className="space-y-3">
          {logs.length === 0 && (
            <div className="glass rounded-2xl p-10 text-center">
              <Dumbbell size={32} className="mx-auto mb-3" style={{ color: "var(--text-muted)" }} />
              <p style={{ color: "var(--text-secondary)" }}>No sessions logged yet.</p>
              <Link href="/workouts" className="text-sm mt-1 inline-block" style={{ color: "var(--workout-color)" }}>
                Start your first workout →
              </Link>
            </div>
          )}

          {logs.map((log) => (
            <div key={log.id} className="glass rounded-xl p-4 flex items-center gap-4">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `${SESSION_COLORS[log.sessionName] ?? "var(--workout-color)"}20` }}
              >
                <Dumbbell size={16} style={{ color: SESSION_COLORS[log.sessionName] ?? "var(--workout-color)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                  {log.sessionName}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                  {format(new Date(log.startedAt), "EEE, MMM d yyyy")}
                  {log.durationSeconds && ` · ${formatWorkoutDuration(log.durationSeconds)}`}
                  {` · ${log.setCount} sets`}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── PRs tab ── */}
      {!loading && tab === "prs" && (
        <div className="space-y-3">
          {prs.length === 0 && (
            <div className="glass rounded-2xl p-10 text-center">
              <Trophy size={32} className="mx-auto mb-3" style={{ color: "var(--text-muted)" }} />
              <p style={{ color: "var(--text-secondary)" }}>Complete a workout to see your PRs.</p>
            </div>
          )}

          {prs.map((pr) => (
            <div key={pr.exerciseName} className="glass rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                      {pr.exerciseName}
                    </p>
                    {pr.muscleGroup && (
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                        style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
                      >
                        {pr.muscleGroup}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-2">
                    <div>
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>Best set</p>
                      <p className="text-sm font-bold" style={{ color: "var(--workout-color)" }}>
                        {pr.bestWeightKg}kg × {pr.bestReps}
                      </p>
                    </div>
                    {pr.estimated1rm && (
                      <div>
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>Est. 1RM</p>
                        <p className="text-sm font-bold" style={{ color: "var(--accent-bright)" }}>
                          {pr.estimated1rm}kg
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>Achieved</p>
                      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        {format(new Date(pr.achievedAt), "MMM d, yyyy")}
                      </p>
                    </div>
                  </div>
                </div>
                {/* Chart drill-down button removed since we don't have exerciseId in PR response */}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Running tab ── */}
      {!loading && tab === "running" && (
        <div className="space-y-4">
          {/* Summary */}
          {totalRuns > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div className="glass rounded-xl p-4">
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Total distance</p>
                <p className="text-xl font-bold mt-1" style={{ color: "var(--workout-color)" }}>
                  {totalKm.toFixed(1)} km
                </p>
              </div>
              <div className="glass rounded-xl p-4">
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Total runs</p>
                <p className="text-xl font-bold mt-1" style={{ color: "var(--workout-color)" }}>
                  {totalRuns}
                </p>
              </div>
            </div>
          )}

          {/* Distance chart */}
          {runs.length >= 2 && (
            <div className="glass rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Activity size={14} style={{ color: "var(--workout-color)" }} />
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--workout-color)" }}>
                  Distance over time
                </p>
              </div>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={[...runs].reverse()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                    tickFormatter={(v) => format(parseISO(v), "MMM d")}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                    unit="km"
                    width={42}
                  />
                  <Tooltip
                    contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--glass-border)", borderRadius: "12px" }}
                    labelStyle={{ color: "var(--text-muted)", fontSize: 11 }}
                    itemStyle={{ color: "var(--workout-color)" }}
                    formatter={(v) => [`${v} km`, "Distance"]}
                    labelFormatter={(v) => format(parseISO(v), "EEEE, MMM d")}
                  />
                  <Line
                    type="monotone"
                    dataKey="distanceKm"
                    stroke="var(--workout-color)"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "var(--workout-color)" }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <LogRunForm onLogged={(run) => setRuns((prev) => [run, ...prev])} />

          {runs.length === 0 && (
            <div className="glass rounded-2xl p-10 text-center">
              <Timer size={32} className="mx-auto mb-3" style={{ color: "var(--text-muted)" }} />
              <p style={{ color: "var(--text-secondary)" }}>No runs logged yet.</p>
            </div>
          )}

          <div className="space-y-3">
            {runs.map((run) => (
              <div key={run.id} className="glass rounded-xl p-4 flex items-center gap-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: "rgba(245,158,11,0.15)" }}
                >
                  <TrendingUp size={16} style={{ color: "var(--workout-color)" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <p className="font-bold text-sm" style={{ color: "var(--workout-color)" }}>
                      {run.distanceKm} km
                    </p>
                    {run.paceSecondsPerKm && (
                      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                        {formatPace(run.paceSecondsPerKm)}
                      </p>
                    )}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {format(parseISO(run.date), "EEE, MMM d yyyy")}
                    {` · ${Math.floor(run.durationSeconds / 60)}m ${run.durationSeconds % 60}s`}
                  </p>
                  {run.notes && (
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {run.notes}
                    </p>
                  )}
                </div>
                <button onClick={() => deleteRun(run.id)} className="shrink-0 p-1">
                  <Trash2 size={14} style={{ color: "var(--text-muted)" }} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
