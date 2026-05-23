"use client";

/**
 * RunningCard — shows 5K goal progress + recent run stats.
 * Includes a "Log run" modal.
 * Embeds in the (server-rendered) workouts page.
 */

import { useEffect, useState } from "react";
import Link from "next/link";

interface RunLog {
  id: number;
  date: string;
  distanceKm: number;
  durationSeconds: number;
  paceSecondsPerKm: number | null;
  notes: string | null;
}

function formatPaceSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function todayStr(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}

export default function RunningCard() {
  const [runs, setRuns] = useState<RunLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Form state
  const [date, setDate] = useState(todayStr());
  const [distKm, setDistKm] = useState("");
  const [minutes, setMinutes] = useState("");
  const [seconds, setSeconds] = useState("0");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/workouts/run-logs")
      .then((r) => r.json())
      .then((data) => { setRuns(Array.isArray(data) ? data : []); setLoading(false); });
  }, []);

  const maxDistance = Math.max(...runs.map((r) => r.distanceKm), 0);
  const GOAL_KM = 5;
  const pct = Math.min(100, (maxDistance / GOAL_KM) * 100);

  // This week's runs
  const today = todayStr();
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Mon
  const weekStartStr = weekStart.toISOString().split("T")[0];
  const thisWeekRuns = runs.filter((r) => r.date >= weekStartStr);
  const thisWeekKm = thisWeekRuns.reduce((sum, r) => sum + r.distanceKm, 0);

  const avgPace = runs.length > 0
    ? Math.round(runs.slice(0, 5).reduce((sum, r) => sum + (r.paceSecondsPerKm ?? 0), 0) / Math.min(runs.length, 5))
    : null;

  async function logRun(e: React.FormEvent) {
    e.preventDefault();
    if (!distKm || !minutes) return;
    setSaving(true);
    const durationSeconds = Number(minutes) * 60 + Number(seconds);
    const res = await fetch("/api/workouts/run-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, distanceKm: parseFloat(distKm), durationSeconds, notes: notes || null }),
    });
    const run = await res.json();
    setRuns((prev) => [run, ...prev]);
    setDistKm(""); setMinutes(""); setSeconds("0"); setNotes("");
    setSaving(false);
    setShowModal(false);
  }

  return (
    <>
      <div className="cc-card">
        <div className="cc-card-head">
          <div className="title" style={{ color: "var(--cyan)" }}>Running · 5K Goal</div>
          <div className="tail">non-stop target</div>
        </div>
        <div className="cc-card-body">
          {/* Progress bar */}
          <div style={{ padding: "14px 16px", border: "1px solid rgba(126,231,255,0.20)", borderRadius: 12, background: "radial-gradient(60% 80% at 100% 0%, rgba(126,231,255,0.10), transparent 60%), rgba(255,255,255,0.018)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase" as const, color: "var(--cyan)", fontWeight: 600 }}>
                Furthest non-stop
              </span>
              {maxDistance > 0 && (
                <span style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: "0.04em" }}>
                  {Math.round(pct)}% of goal
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 6 }}>
              <span style={{ fontSize: 30, fontWeight: 200, letterSpacing: "-0.03em", fontFamily: "var(--f-mono)" }}>
                {loading ? "-" : maxDistance > 0 ? maxDistance.toFixed(2) : "-"}
              </span>
              <span style={{ color: "var(--ink-3)", fontSize: 14 }}> / {GOAL_KM}.0 km</span>
            </div>
            <div style={{ marginTop: 10, height: 5, background: "rgba(255,255,255,0.04)", borderRadius: 99 }}>
              <div style={{ height: "100%", width: `${pct}%`, background: "var(--grad)", borderRadius: 99, transition: "width 0.6s" }} />
            </div>
          </div>

          {/* Stats grid */}
          {runs.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0, borderTop: "1px solid var(--line)", marginTop: 14, paddingTop: 14 }}>
              <div style={{ paddingRight: 12, borderRight: "1px solid var(--line)" }}>
                <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase" as const, color: "var(--ink-3)" }}>This wk</div>
                <div style={{ fontSize: 18, fontWeight: 300, fontFamily: "var(--f-mono)", marginTop: 4 }}>
                  {thisWeekKm.toFixed(1)} <span style={{ fontSize: 11, color: "var(--ink-3)" }}>km</span>
                </div>
              </div>
              <div style={{ padding: "0 12px", borderRight: "1px solid var(--line)" }}>
                <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase" as const, color: "var(--ink-3)" }}>Avg pace</div>
                <div style={{ fontSize: 18, fontWeight: 300, fontFamily: "var(--f-mono)", marginTop: 4 }}>
                  {avgPace ? formatPaceSec(avgPace) : "-"} <span style={{ fontSize: 11, color: "var(--ink-3)" }}>/km</span>
                </div>
              </div>
              <div style={{ paddingLeft: 12 }}>
                <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase" as const, color: "var(--ink-3)" }}>Sessions</div>
                <div style={{ fontSize: 18, fontWeight: 300, fontFamily: "var(--f-mono)", marginTop: 4 }}>
                  {thisWeekRuns.length} <span style={{ fontSize: 11, color: "var(--ink-3)" }}>/ wk</span>
                </div>
              </div>
            </div>
          )}

          {/* Log run button */}
          <button
            onClick={() => setShowModal(true)}
            style={{
              marginTop: 14, width: "100%", padding: "10px 0", borderRadius: 8,
              border: "1px solid rgba(126,231,255,0.30)", background: "rgba(126,231,255,0.06)",
              color: "var(--cyan)", fontSize: 13, fontWeight: 500, cursor: "pointer",
              letterSpacing: "0.02em",
            }}
          >
            + Log run
          </button>
        </div>
      </div>

      {/* Log run modal */}
      {showModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
        }}>
          <div className="cc-card" style={{ width: 360 }}>
            <div className="cc-card-head">
              <div className="title">Log Run</div>
              <button onClick={() => setShowModal(false)} style={{ color: "var(--ink-4)", background: "none", border: "none", cursor: "pointer", fontSize: 18 }}>×</button>
            </div>
            <div className="cc-card-body">
              <form onSubmit={logRun} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase" as const, color: "var(--ink-3)", marginBottom: 6 }}>Date</label>
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                      style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--line)", borderRadius: 6, color: "var(--ink)", padding: "7px 10px", fontSize: 13 }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase" as const, color: "var(--ink-3)", marginBottom: 6 }}>Distance (km)</label>
                    <input required type="number" step="0.01" placeholder="5.0" value={distKm} onChange={(e) => setDistKm(e.target.value)}
                      style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--line)", borderRadius: 6, color: "var(--ink)", padding: "7px 10px", fontSize: 13 }} />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase" as const, color: "var(--ink-3)", marginBottom: 6 }}>Minutes</label>
                    <input required type="number" placeholder="30" value={minutes} onChange={(e) => setMinutes(e.target.value)}
                      style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--line)", borderRadius: 6, color: "var(--ink)", padding: "7px 10px", fontSize: 13 }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase" as const, color: "var(--ink-3)", marginBottom: 6 }}>Seconds</label>
                    <input type="number" min="0" max="59" placeholder="0" value={seconds} onChange={(e) => setSeconds(e.target.value)}
                      style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--line)", borderRadius: 6, color: "var(--ink)", padding: "7px 10px", fontSize: 13 }} />
                  </div>
                </div>
                <input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)}
                  style={{ background: "var(--bg-input)", border: "1px solid var(--line)", borderRadius: 6, color: "var(--ink)", padding: "7px 10px", fontSize: 13 }} />
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button type="button" className="cc-btn" onClick={() => setShowModal(false)}>Cancel</button>
                  <button type="submit" disabled={saving}
                    style={{ opacity: saving ? 0.5 : 1, padding: "8px 18px", borderRadius: 8, background: "var(--grad)", color: "#0A0A14", fontWeight: 600, fontSize: 13, border: "none", cursor: "pointer" }}>
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
