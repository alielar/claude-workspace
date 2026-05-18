"use client";

/**
 * /workouts/history — Workout analytics & running log. V2 Ambient Futurism design.
 * Tabs: Sessions · PRs · Running
 */

import { useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { format, parseISO } from "date-fns";
import { formatWorkoutDuration, formatPace } from "@/lib/utils";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────────

type WorkoutLog = { id: number; sessionName: string; startedAt: number; durationSeconds: number | null; setCount: number };
type PR         = { exerciseName: string; muscleGroup: string | null; bestWeightKg: number | null; bestReps: number | null; estimated1rm: number | null; achievedAt: number };
type RunLog     = { id: number; date: string; distanceKm: number; durationSeconds: number; paceSecondsPerKm: number | null; notes: string | null };

// Session type → gradient mapping (from workouts page design)
const SESSION_GRAD: Record<string, string> = {
  Push:           "linear-gradient(135deg, rgba(179,136,255,0.50), rgba(126,231,255,0.20))",
  Pull:           "linear-gradient(135deg, rgba(126,231,255,0.50), rgba(179,136,255,0.20))",
  Legs:           "linear-gradient(135deg, rgba(111,212,154,0.50), rgba(126,231,255,0.20))",
  Core:           "linear-gradient(135deg, rgba(255,193,92,0.50), rgba(179,136,255,0.20))",
  "Push-Up Skill":"linear-gradient(135deg, rgba(179,136,255,0.50), rgba(111,212,154,0.20))",
};

// ── Log Run Form ───────────────────────────────────────────────────────────────

function LogRunForm({ onLogged }: { onLogged: (run: RunLog) => void }) {
  const [open, setOpen]         = useState(false);
  const [date, setDate]         = useState(new Date().toISOString().split("T")[0]);
  const [distanceKm, setDist]   = useState("");
  const [minutes, setMin]       = useState("");
  const [seconds, setSec]       = useState("0");
  const [notes, setNotes]       = useState("");
  const [loading, setLoading]   = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!distanceKm || !minutes) return;
    setLoading(true);
    const durationSeconds = Number(minutes) * 60 + Number(seconds);
    const res = await fetch("/api/workouts/run-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, distanceKm: parseFloat(distanceKm), durationSeconds, notes: notes || null }),
    });
    onLogged(await res.json());
    setDist(""); setMin(""); setSec("0"); setNotes("");
    setLoading(false);
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="cc-btn"
        style={{ width: "100%", justifyContent: "center", borderStyle: "dashed", padding: "12px 0" }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Log a Run
      </button>
    );
  }

  return (
    <div className="cc-card" style={{ padding: "20px 22px" }}>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 14 }}>Log Run</div>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={{ display: "block", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600, marginBottom: 6 }}>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="cc-input" style={{ width: "100%" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600, marginBottom: 6 }}>Distance (km)</label>
            <input required type="number" step="0.01" placeholder="5.0" value={distanceKm} onChange={(e) => setDist(e.target.value)} className="cc-input" style={{ width: "100%" }} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={{ display: "block", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600, marginBottom: 6 }}>Duration (min)</label>
            <input required type="number" placeholder="30" value={minutes} onChange={(e) => setMin(e.target.value)} className="cc-input" style={{ width: "100%" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600, marginBottom: 6 }}>Seconds</label>
            <input type="number" min="0" max="59" placeholder="0" value={seconds} onChange={(e) => setSec(e.target.value)} className="cc-input" style={{ width: "100%" }} />
          </div>
        </div>
        <input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} className="cc-input" />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="cc-btn" onClick={() => setOpen(false)}>Cancel</button>
          <button type="submit" disabled={loading} className="cc-btn cc-btn-primary" style={{ opacity: loading ? 0.5 : 1 }}>
            {loading ? "Saving…" : "Save Run"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function WorkoutHistoryPage() {
  const [tab, setTab]       = useState<"history" | "prs" | "running">("history");
  const [logs, setLogs]     = useState<WorkoutLog[]>([]);
  const [prs, setPRs]       = useState<PR[]>([]);
  const [runs, setRuns]     = useState<RunLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/workouts/history").then((r) => r.json()),
      fetch("/api/workouts/prs").then((r) => r.json()),
      fetch("/api/workouts/run-logs").then((r) => r.json()),
    ]).then(([h, p, r]) => { setLogs(h); setPRs(p); setRuns(r); setLoading(false); });
  }, []);

  const deleteRun = async (id: number) => {
    await fetch(`/api/workouts/run-logs?id=${id}`, { method: "DELETE" });
    setRuns((prev) => prev.filter((r) => r.id !== id));
  };

  const totalKm = runs.reduce((sum, r) => sum + r.distanceKm, 0);

  return (
    <div style={{ padding: "0 0 40px" }}>

      {/* Page title */}
      <div className="cc-pagetitle" style={{ marginBottom: 20 }}>
        <div>
          <h1>Workout <span className="grad-text">History</span>.</h1>
          <div className="sub">{logs.length} sessions logged · all time</div>
        </div>
        <Link href="/workouts" className="cc-btn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Back to workouts
        </Link>
      </div>

      {/* Tabs */}
      <div className="cc-tabs" style={{ marginBottom: 20 }}>
        {(["history","prs","running"] as const).map((t) => (
          <button
            key={t}
            className={`cc-tab${tab === t ? " cur" : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "history" ? "Sessions" : t === "prs" ? "Personal Records" : "Running"}
            {!loading && (
              <span className="count">
                {t === "history" ? logs.length : t === "prs" ? prs.length : runs.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && (
        <div className="cc-card" style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 12, color: "var(--ink-4)", letterSpacing: "0.10em", textTransform: "uppercase", fontFamily: "var(--f-mono)" }}>Loading…</div>
        </div>
      )}

      {/* ── Sessions tab ──────────────────────────────────────────── */}
      {!loading && tab === "history" && (
        <div className="cc-card">
          <div className="cc-card-head">
            <div className="title">Session log</div>
            <div className="tail">most recent first</div>
          </div>
          {logs.length === 0 ? (
            <div style={{ padding: "32px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>
              No sessions logged yet.{" "}
              <Link href="/workouts" style={{ color: "var(--violet)" }}>Start your first workout →</Link>
            </div>
          ) : (
            logs.map((log, i) => {
              const grad = SESSION_GRAD[log.sessionName];
              return (
                <div key={log.id} style={{
                  display: "grid", gridTemplateColumns: "32px 1fr auto", gap: 14, alignItems: "center",
                  padding: "13px 8px", borderBottom: i < logs.length - 1 ? "1px solid var(--line)" : "none",
                }}>
                  {/* Session color dot */}
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: grad ?? "var(--line)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.80)" strokeWidth="2"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/><line x1="16" y1="8" x2="2" y2="22"/><line x1="17.5" y1="15" x2="9" y2="15"/></svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: "-0.005em" }}>{log.sessionName}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2, letterSpacing: "0.04em", fontFamily: "var(--f-mono)" }}>
                      {format(new Date(log.startedAt), "EEE, MMM d yyyy")}
                      {log.durationSeconds ? ` · ${formatWorkoutDuration(log.durationSeconds)}` : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--f-mono)", letterSpacing: "0.04em" }}>
                    {log.setCount} sets
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── PRs tab ───────────────────────────────────────────────── */}
      {!loading && tab === "prs" && (
        <div className="cc-card">
          <div className="cc-card-head">
            <div className="title">Personal Records</div>
            <div className="tail">best set per exercise · all time</div>
          </div>
          {prs.length === 0 ? (
            <div style={{ padding: "32px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>
              Complete a workout to see your PRs.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Exercise","Muscle","Best set","Est. 1RM","Achieved"].map((h, i) => (
                    <th key={h} style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", textAlign: "left", padding: "10px 12px", borderBottom: "1px solid var(--line)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {prs.map((pr) => (
                  <tr key={pr.exerciseName}>
                    <td style={{ padding: "11px 12px", fontSize: 13, borderBottom: "1px solid var(--line)", color: "var(--ink)", fontWeight: 500 }}>{pr.exerciseName}</td>
                    <td style={{ padding: "11px 12px", fontSize: 11, borderBottom: "1px solid var(--line)", color: "var(--ink-3)", letterSpacing: "0.04em" }}>
                      {pr.muscleGroup ?? "—"}
                    </td>
                    <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--line)" }}>
                      <span className="grad-text" style={{ fontSize: 14, fontWeight: 500, letterSpacing: "-0.005em" }}>
                        {pr.bestWeightKg ?? "—"}kg × {pr.bestReps ?? "—"}
                      </span>
                    </td>
                    <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--line)", fontSize: 13, fontFamily: "var(--f-mono)", color: "var(--violet)" }}>
                      {pr.estimated1rm ? `${pr.estimated1rm}kg` : "—"}
                    </td>
                    <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--line)", fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--f-mono)" }}>
                      {format(new Date(pr.achievedAt), "MMM d, yyyy")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Running tab ───────────────────────────────────────────── */}
      {!loading && tab === "running" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Stats */}
          {runs.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
              {[
                { label: "Total distance", value: `${totalKm.toFixed(1)} km`, color: "var(--violet)" },
                { label: "Total runs",     value: runs.length,                color: "var(--cyan)"   },
                { label: "Avg distance",   value: `${(totalKm / runs.length).toFixed(1)} km`, color: "var(--pos)" },
              ].map((stat) => (
                <div key={stat.label} className="cc-card" style={{ padding: 18 }}>
                  <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>{stat.label}</div>
                  <div style={{ fontSize: 28, fontWeight: 300, letterSpacing: "-0.03em", marginTop: 6, color: stat.color }}>{stat.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Distance chart */}
          {runs.length >= 2 && (
            <div className="cc-card" style={{ padding: "20px 22px" }}>
              <div className="cc-card-head">
                <div className="title">Distance over time</div>
                <div className="tail">{runs.length} runs</div>
              </div>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={[...runs].reverse()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--ink-4)" }} tickFormatter={(v) => format(parseISO(v), "MMM d")} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--ink-4)" }} unit="km" width={42} />
                  <Tooltip
                    contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--line)", borderRadius: 10 }}
                    labelStyle={{ color: "var(--ink-3)", fontSize: 11 }}
                    itemStyle={{ color: "var(--violet)" }}
                    formatter={(v) => [`${v} km`, "Distance"]}
                    labelFormatter={(v) => format(parseISO(v), "EEEE, MMM d")}
                  />
                  <Line type="monotone" dataKey="distanceKm" stroke="url(#runGrad)" strokeWidth={2} dot={{ r: 3, fill: "var(--violet)" }} activeDot={{ r: 5 }} />
                  <defs>
                    <linearGradient id="runGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#B388FF" />
                      <stop offset="100%" stopColor="#7EE7FF" />
                    </linearGradient>
                  </defs>
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <LogRunForm onLogged={(run) => setRuns((prev) => [run, ...prev])} />

          {runs.length === 0 && (
            <div className="cc-card" style={{ padding: "32px 0", textAlign: "center" }}>
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
                display: "grid", gridTemplateColumns: "1fr auto auto", gap: 14, alignItems: "center",
                padding: "13px 8px", borderBottom: i < runs.length - 1 ? "1px solid var(--line)" : "none",
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
                <button onClick={() => deleteRun(run.id)} style={{ color: "var(--ink-4)", padding: "4px", cursor: "pointer" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
