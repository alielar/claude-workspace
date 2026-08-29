"use client";

/**
 * /train/w2 — Workout 2: straight sets, a checklist.
 *
 *   - every exercise shows its sets as big bubbles; tap a bubble = set done
 *   - a set done starts the rest timer (sticky bar at the bottom, skip anytime)
 *   - tap the "12 × 3" numbers on an exercise to change reps / sets / weight inline
 *   - progress is saved on the phone at every tap; finish → saved (offline-safe)
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOverview, useWorkouts, readActiveSession, writeActiveSession, saveSession, workoutByKey } from "@/lib/train/useTrain";
import { fmtClock, newClientId, type TrainExercise, type TrainSession } from "@/lib/train/types";
import { checklistToday } from "@/lib/checklist/day";
import { cues } from "@/lib/routine/cues";
import { RepEditor } from "@/components/train/RepEditor";

type SetsLog = Record<string, boolean[]>;

/** Absolute time the rest ends (kept outside the component so render stays pure). */
function restEndTime(seconds: number): number { return Date.now() + seconds * 1000; }

export default function SetsPage() {
  const router = useRouter();
  const { workouts, saveWorkout } = useWorkouts();
  const { data: ov, refresh } = useOverview();
  const w = workoutByKey(workouts, "w2");
  const kg = ov?.kettlebellKg ?? 12;

  const [session, setSession] = useState<TrainSession | null>(null);
  const [summary, setSummary] = useState<TrainSession | null>(null);
  const [editing, setEditing] = useState<TrainExercise | null>(null);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const restDone = useRef(false);

  // Resume
  useEffect(() => {
    const a = readActiveSession();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring from localStorage after mount
    if (a && a.workoutKey === "w2" && a.finishedAt === null) setSession(a);
  }, []);

  // Rest ticker
  useEffect(() => {
    if (restEndsAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [restEndsAt]);
  const restLeft = restEndsAt !== null ? Math.max(0, restEndsAt - now) : null;
  useEffect(() => {
    if (restLeft === null) return;
    if (restLeft <= 0 && !restDone.current) {
      restDone.current = true;
      cues.work("Go");
      setTimeout(() => setRestEndsAt(null), 800);
    }
  }, [restLeft]);

  const sets: SetsLog = (session && "sets" in session.log && session.log.sets) || {};
  const totalSets = w.exercises.reduce((s, e) => s + e.sets, 0);
  const doneSets = w.exercises.reduce((s, e) => s + (sets[e.id] ?? []).filter(Boolean).length, 0);

  const start = () => {
    cues.arm();
    const s: TrainSession = {
      clientId: newClientId(), workoutKey: "w2", date: checklistToday(),
      startedAt: Date.now(), finishedAt: null, durationSeconds: null,
      rounds: null, weightKg: kg, log: { sets: {} }, notes: null,
    };
    writeActiveSession(s);
    setSession(s);
  };

  const toggleSet = (e: TrainExercise, idx: number) => {
    if (!session) return;
    cues.arm();
    const cur = [...(sets[e.id] ?? Array(e.sets).fill(false))];
    while (cur.length < e.sets) cur.push(false);
    const wasDone = cur[idx];
    cur[idx] = !wasDone;
    const s = { ...session, log: { sets: { ...sets, [e.id]: cur } } };
    writeActiveSession(s);
    setSession(s);
    try { navigator.vibrate?.(30); } catch { /* ignore */ }
    if (!wasDone && w.restSeconds > 0) {
      const remainingAfter = totalSets - (doneSets + 1);
      if (remainingAfter > 0) { restDone.current = false; setRestEndsAt(restEndTime(w.restSeconds)); }
    }
  };

  const finish = () => {
    if (!session) return;
    const t = Date.now();
    const done: TrainSession = { ...session, finishedAt: t, durationSeconds: Math.round((t - session.startedAt) / 1000) };
    setRestEndsAt(null);
    setSummary(done);
    setSession(null);
    cues.done();
    saveSession(done).then(() => refresh());
  };
  const discard = () => {
    if (!confirm("Discard this workout? Nothing will be saved.")) return;
    writeActiveSession(null);
    setSession(null);
    setRestEndsAt(null);
  };

  const saveExercise = (e: TrainExercise) => saveWorkout({ ...w, exercises: w.exercises.map((x) => (x.id === e.id ? e : x)) });
  const changeRest = (delta: number) => saveWorkout({ ...w, restSeconds: Math.max(0, Math.min(600, w.restSeconds + delta)) });

  // ── Summary ───────────────────────────────────────────────────────────────
  if (summary) {
    const n = "sets" in summary.log && summary.log.sets ? Object.values(summary.log.sets).flat().filter(Boolean).length : 0;
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "var(--bg-deep)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 12, fontFamily: "var(--f-mono)", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--pos)" }}>Workout 2 done</div>
        <div className="tabular-nums" style={{ fontSize: 110, fontWeight: 200, lineHeight: 1, letterSpacing: "-0.04em" }}>{n}<span style={{ fontSize: 28, color: "var(--ink-3)" }}>/{totalSets}</span></div>
        <div style={{ fontSize: 16, color: "var(--ink-2)" }}>sets in {fmtClock(summary.durationSeconds ?? 0)} · {summary.weightKg} kg</div>
        <button className="cc-btn cc-btn-primary" onClick={() => router.push("/train")} style={{ minHeight: 56, fontSize: 17, borderRadius: 14, width: "min(320px, 100%)", marginTop: 16 }}>Done</button>
      </div>
    );
  }

  const running = session !== null;

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 560, paddingBottom: restLeft !== null ? 90 : 0 }}>
      <div className="cc-pagetitle" style={{ marginBottom: 0 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600 }}>{w.name}</h1>
          <div className="sub">{w.exercises.length} exercises · {totalSets} sets · {kg} kg kettlebell</div>
        </div>
        {running && <span className="cc-pill cc-pill-cyan tabular-nums" style={{ fontSize: 13, padding: "6px 10px" }}>{doneSets}/{totalSets}</span>}
      </div>

      {!running && (
        <button className="cc-btn cc-btn-primary" onClick={start} style={{ minHeight: 60, fontSize: 18, borderRadius: 16 }}>▶ Start</button>
      )}

      {/* Exercises */}
      <section className="cc-card">
        <div className="cc-card-head">
          <span className="title">{running ? "Tap a set when it's done" : "Plan · tap numbers to change"}</span>
          <span className="tail" style={{ display: "flex", gap: 6, alignItems: "center" }}>
            rest
            <button className="cc-btn cc-btn-ghost" onClick={() => changeRest(-15)} style={{ minHeight: 32, minWidth: 32, padding: 0, borderRadius: 8 }} aria-label="less rest">−</button>
            <span className="tabular-nums" style={{ minWidth: 34, textAlign: "center" }}>{w.restSeconds}s</span>
            <button className="cc-btn cc-btn-ghost" onClick={() => changeRest(15)} style={{ minHeight: 32, minWidth: 32, padding: 0, borderRadius: 8 }} aria-label="more rest">+</button>
          </span>
        </div>
        <div style={{ padding: "0 14px" }}>
          {w.exercises.map((e, i) => {
            const flags = sets[e.id] ?? [];
            const allDone = running && flags.filter(Boolean).length >= e.sets;
            return (
              <div key={e.id} style={{ padding: "12px 0", borderBottom: i < w.exercises.length - 1 ? "1px solid var(--line)" : "none", opacity: allDone ? 0.55 : 1 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 15.5, fontWeight: 500, textDecoration: allDone ? "line-through" : "none" }}>{e.name}</span>
                  <button onClick={() => setEditing(e)} className="cc-pill cc-pill-violet" style={{ fontSize: 13, fontFamily: "var(--f-mono)", minHeight: 36, cursor: "pointer", border: "1px solid rgba(179,136,255,0.3)" }}>
                    {e.reps}{e.perSide ? "/arm" : ""} × {e.sets}{e.kettlebell ? ` · ${kg} kg` : e.weightKg ? ` · ${e.weightKg} kg` : ""}
                  </button>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  {Array.from({ length: e.sets }).map((_, idx) => {
                    const on = !!flags[idx];
                    return (
                      <button
                        key={idx}
                        onClick={() => toggleSet(e, idx)}
                        disabled={!running}
                        aria-pressed={on}
                        aria-label={`${e.name} set ${idx + 1}`}
                        style={{
                          flex: 1, minHeight: 52, borderRadius: 14, fontSize: 15, fontWeight: 600, font: "inherit",
                          border: `2px solid ${on ? "transparent" : running ? "var(--line-strong)" : "var(--line)"}`,
                          background: on ? "var(--violet)" : "var(--fill-1)", color: on ? "#fff" : running ? "var(--ink-2)" : "var(--ink-4)",
                          cursor: running ? "pointer" : "default", WebkitTapHighlightColor: "transparent", touchAction: "manipulation",
                        }}
                      >
                        {on ? "✓" : `Set ${idx + 1}`}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {running && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
          <button className="cc-btn cc-btn-primary" onClick={finish} style={{ minHeight: 56, fontSize: 17, borderRadius: 14 }}>
            {doneSets >= totalSets ? "Finish ✓" : `Finish (${doneSets}/${totalSets})`}
          </button>
          <button className="cc-btn cc-btn-ghost" onClick={discard} style={{ minHeight: 56, minWidth: 56, borderRadius: 14, color: "var(--neg)", padding: 0 }} aria-label="Discard">✕</button>
        </div>
      )}

      {!running && <Link href="/train" style={{ fontSize: 14, color: "var(--ink-3)", textDecoration: "none" }}>← Back</Link>}

      {/* Rest bar */}
      {restLeft !== null && (
        <div style={{ position: "fixed", left: 12, right: 12, bottom: "calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 12px)", zIndex: 45, background: "var(--bg-chrome)", border: "1px solid var(--line-hi)", borderRadius: 18, padding: "12px 16px", display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 14, alignItems: "center", boxShadow: "0 8px 32px rgba(0,0,0,0.35)" }}>
          <span style={{ fontSize: 12, fontFamily: "var(--f-mono)", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--cyan)" }}>Rest</span>
          <span>
            <span className="tabular-nums" style={{ fontSize: 28, fontWeight: 300 }}>{fmtClock(restLeft / 1000)}</span>
            <span className="cc-progress-track" style={{ display: "block", height: 3, marginTop: 4 }}>
              <span className="cc-progress-fill" style={{ display: "block", width: `${100 - (restLeft / (w.restSeconds * 1000)) * 100}%`, transition: "width 0.25s linear" }} />
            </span>
          </span>
          <button className="cc-btn cc-btn-ghost" onClick={() => setRestEndsAt(null)} style={{ minHeight: 44, borderRadius: 12 }}>Skip</button>
        </div>
      )}

      {editing && <RepEditor exercise={editing} showSets kettlebellKg={kg} onSave={saveExercise} onClose={() => setEditing(null)} />}
    </div>
  );
}
