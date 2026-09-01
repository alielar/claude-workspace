"use client";

/**
 * /train/w1 · Workout 1: AMRAP, the game.
 *
 *   - 30:00 counts down from the moment you press Start (no pause: it's a race)
 *   - the whole middle of the screen is the +1 ROUND button · one thumb, sweaty hands,
 *     mid-set; a 700 ms guard stops accidental double taps; small undo bottom-left
 *   - the number to beat (last week's best) is always visible
 *   - pace: "on pace for N" from your average round time; colour says ahead / tight / behind
 *   - the moment you pass the number to beat: full-screen flash, sound, vibration
 *   - time up: alarm → summary → saved (offline-safe)
 * The live session is stored on the phone every tap, so nothing is lost if the phone locks.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOverview, useWorkouts, readActiveSession, writeActiveSession, saveSession, workoutByKey } from "@/lib/train/useTrain";
import { newExerciseId, fmtClock, newClientId, type TrainSession } from "@/lib/train/types";
import { checklistToday } from "@/lib/checklist/day";
import { cues } from "@/lib/routine/cues";
import { RepEditor } from "@/components/train/RepEditor";
import type { TrainExercise } from "@/lib/train/types";

type Status = "idle" | "running" | "summary";

export default function AmrapPage() {
  const router = useRouter();
  const { workouts, saveWorkout } = useWorkouts();
  const { data: ov, refresh } = useOverview();
  const w = workoutByKey(workouts, "w1");
  const minutes = w.amrapMinutes ?? 30;
  const totalMs = minutes * 60_000;
  const kg = ov?.kettlebellKg ?? 12;
  const toBeat = ov?.toBeat?.rounds ?? null;

  const [status, setStatus] = useState<Status>("idle");
  const [session, setSession] = useState<TrainSession | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [flash, setFlash] = useState(false);
  const [editing, setEditing] = useState<TrainExercise | null>(null);
  const lastTap = useRef(0);
  const recordShown = useRef(false);
  const wakeLock = useRef<WakeLockSentinel | null>(null);

  // Resume an unfinished session from the phone.
  useEffect(() => {
    const a = readActiveSession();
    if (a && a.workoutKey === "w1" && a.finishedAt === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring from localStorage after mount
      setSession(a);
      setStatus("running");
      recordShown.current = toBeat !== null && (a.rounds ?? 0) > toBeat;
    }
  }, [toBeat]);

  // Wake lock
  useEffect(() => {
    if (status !== "running") { wakeLock.current?.release().catch(() => {}); wakeLock.current = null; return; }
    const req = async () => { try { if ("wakeLock" in navigator) wakeLock.current = await navigator.wakeLock.request("screen"); } catch { /* later */ } };
    req();
    const onVis = () => { if (document.visibilityState === "visible") req(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [status]);

  const elapsedMs = session ? Math.min(totalMs, now - session.startedAt) : 0;
  const remainingMs = Math.max(0, totalMs - elapsedMs);
  const rounds = session?.rounds ?? 0;

  const finish = useCallback((s: TrainSession, endedAt: number) => {
    const done: TrainSession = {
      ...s,
      finishedAt: endedAt,
      durationSeconds: Math.round((endedAt - s.startedAt) / 1000),
    };
    setSession(done);
    setStatus("summary");
    cues.done();
    saveSession(done).then(() => refresh());
  }, [refresh]);

  // Clock · also where "time up" is detected (inside the tick, not in render).
  useEffect(() => {
    if (status !== "running" || !session) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t - session.startedAt >= totalMs) finish(session, session.startedAt + totalMs);
    }, 250);
    return () => clearInterval(id);
  }, [status, session, totalMs, finish]);

  // Last 10 seconds: a soft tick each second
  const lastTick = useRef(-1);
  useEffect(() => {
    if (status !== "running") return;
    const sec = Math.ceil(remainingMs / 1000);
    if (sec <= 10 && sec >= 1 && sec !== lastTick.current) { lastTick.current = sec; cues.tick(); }
  }, [remainingMs, status]);

  const start = () => {
    cues.arm();
    const s: TrainSession = {
      clientId: newClientId(),
      workoutKey: "w1",
      date: checklistToday(),
      startedAt: Date.now(),
      finishedAt: null,
      durationSeconds: null,
      rounds: 0,
      weightKg: kg,
      log: { roundsAt: [] },
      notes: null,
    };
    writeActiveSession(s);
    setSession(s);
    setNow(Date.now());
    recordShown.current = false;
    setStatus("running");
    cues.work("Go");
  };

  const addRound = () => {
    if (!session) return;
    const t = Date.now();
    if (t - lastTap.current < 700) return; // double-tap guard
    lastTap.current = t;
    const nextRounds = (session.rounds ?? 0) + 1;
    const roundsAt = [...(("roundsAt" in session.log && session.log.roundsAt) || []), t - session.startedAt];
    const s = { ...session, rounds: nextRounds, log: { roundsAt } };
    writeActiveSession(s);
    setSession(s);
    try { navigator.vibrate?.(40); } catch { /* ignore */ }
    if (toBeat !== null && nextRounds > toBeat && !recordShown.current) {
      recordShown.current = true;
      setFlash(true);
      cues.done();
      setTimeout(() => setFlash(false), 1800);
    }
  };

  const undoRound = () => {
    if (!session || (session.rounds ?? 0) === 0) return;
    const roundsAt = (("roundsAt" in session.log && session.log.roundsAt) || []).slice(0, -1);
    const s = { ...session, rounds: (session.rounds ?? 0) - 1, log: { roundsAt } };
    writeActiveSession(s);
    setSession(s);
  };

  const endEarly = () => { if (session && confirm("End the workout now and save it?")) finish(session, Date.now()); };
  const discard = () => {
    if (!confirm("Discard this workout? Nothing will be saved.")) return;
    writeActiveSession(null);
    setSession(null);
    setStatus("idle");
  };

  // Pace
  const pace = useMemo(() => {
    if (!session || rounds === 0 || elapsedMs < 10_000) return null;
    const avg = elapsedMs / rounds;
    const projected = Math.floor(rounds + remainingMs / avg);
    return { avg, projected };
  }, [session, rounds, elapsedMs, remainingMs]);
  const paceColor = pace && toBeat !== null
    ? pace.projected > toBeat ? "var(--pos)" : pace.projected === toBeat ? "var(--warn)" : "var(--neg)"
    : "var(--ink-3)";

  const saveExercise = (e: TrainExercise) => {
    const exists = w.exercises.some((x) => x.id === e.id);
    saveWorkout({ ...w, exercises: exists ? w.exercises.map((x) => (x.id === e.id ? e : x)) : [...w.exercises, e] });
  };
  const removeExercise = (id: string) => saveWorkout({ ...w, exercises: w.exercises.filter((x) => x.id !== id) });
  const blankExercise = (): TrainExercise => ({ id: newExerciseId("new"), name: "", reps: 5, sets: 1, perSide: true, kettlebell: true, weightKg: null, videoUrl: null });
  const [addingNew, setAddingNew] = useState(false);

  // ── Idle ──────────────────────────────────────────────────────────────────
  if (status === "idle") {
    return (
      <div style={{ display: "grid", gap: 18, maxWidth: 560 }}>
        <div className="cc-pagetitle" style={{ marginBottom: 0 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 600 }}>{w.name}</h1>
            <div className="sub">AMRAP {minutes} min · {kg} kg kettlebell · as many rounds as possible</div>
          </div>
        </div>

        <div className="cc-card">
          <div className="cc-card-body" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, textAlign: "center" }}>
            <div>
              <div style={{ fontSize: 13, fontFamily: "var(--f-mono)", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-3)" }}>To beat</div>
              <div className="tabular-nums" style={{ fontSize: 40, fontWeight: 200, lineHeight: 1.1 }}>{toBeat ?? "…"}</div>
              <div style={{ fontSize: 14, color: "var(--ink-4)" }}>{ov?.toBeat?.label ?? "first week · set the bar"}</div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontFamily: "var(--f-mono)", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-3)" }}>This week</div>
              <div className="tabular-nums" style={{ fontSize: 40, fontWeight: 200, lineHeight: 1.1 }}>{ov?.thisWeekBest ?? "…"}</div>
              <div style={{ fontSize: 14, color: "var(--ink-4)" }}>best so far</div>
            </div>
          </div>
        </div>

        <button className="cc-btn cc-btn-primary" onClick={start} style={{ minHeight: 64, fontSize: 19, borderRadius: 16 }}>▶ Start {minutes}:00</button>

        <section className="cc-card">
          <div className="cc-card-head"><span className="title">One round</span><span className="tail">tap a number to change it</span></div>
          <div style={{ padding: "0 14px" }}>
            {w.exercises.map((e) => (
              <div key={e.id} style={{ display: "grid", gridTemplateColumns: e.videoUrl ? "1fr auto auto" : "1fr auto", alignItems: "center", borderBottom: "1px solid var(--line)", gap: 8 }}>
                <button onClick={() => setEditing(e)} style={{ display: "grid", gridTemplateColumns: "1fr auto", minHeight: 48, alignItems: "center", background: "transparent", border: "none", color: "inherit", font: "inherit", textAlign: "left", cursor: "pointer", padding: "0 2px", gap: 8 }}>
                  <span style={{ fontSize: 16 }}>{e.name}</span>
                  <span className="cc-pill cc-pill-violet" style={{ fontSize: 15, fontFamily: "var(--f-mono)" }}>{e.reps}{e.perSide ? " / side" : ""}</span>
                </button>
                {e.videoUrl && (
                  <a href={e.videoUrl} target="_blank" rel="noopener noreferrer" aria-label={`How to do ${e.name}`}
                    style={{ minHeight: 44, minWidth: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--violet)", textDecoration: "none", fontSize: 15 }}>▶</a>
                )}
              </div>
            ))}
            <button onClick={() => setAddingNew(true)} style={{ width: "100%", minHeight: 48, background: "transparent", border: "none", color: "var(--ink-3)", font: "inherit", fontSize: 15, cursor: "pointer", textAlign: "left", padding: "0 2px" }}>+ Add exercise</button>
          </div>
        </section>

        <Link href="/train" style={{ fontSize: 15, color: "var(--ink-3)", textDecoration: "none" }}>← Back</Link>
        {editing && <RepEditor exercise={editing} showSets={false} kettlebellKg={kg} onSave={saveExercise} onRemove={() => removeExercise(editing.id)} onClose={() => setEditing(null)} />}
        {addingNew && <RepEditor exercise={blankExercise()} showSets={false} kettlebellKg={kg} isNew onSave={saveExercise} onClose={() => setAddingNew(false)} />}
      </div>
    );
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  if (status === "summary" && session) {
    const beat = toBeat !== null && (session.rounds ?? 0) > toBeat;
    const tied = toBeat !== null && (session.rounds ?? 0) === toBeat;
    const avg = session.rounds ? (session.durationSeconds ?? 0) / session.rounds : 0;
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "var(--bg-deep)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 14, fontFamily: "var(--f-mono)", letterSpacing: "0.16em", textTransform: "uppercase", color: beat ? "var(--pos)" : "var(--ink-3)" }}>
          {beat ? "New weekly record" : tied ? "Matched your best" : "Workout 1 done"}
        </div>
        <div className="tabular-nums" style={{ fontSize: 120, fontWeight: 200, lineHeight: 1, letterSpacing: "-0.04em" }}>{session.rounds}</div>
        <div style={{ fontSize: 17, color: "var(--ink-2)" }}>rounds in {fmtClock(session.durationSeconds ?? 0)}</div>
        <div style={{ fontSize: 15, color: "var(--ink-3)" }}>
          {toBeat !== null ? `to beat was ${toBeat}` : "first score on the board"}{avg ? ` · ${fmtClock(avg)} per round` : ""} · {session.weightKg} kg
        </div>
        <button className="cc-btn cc-btn-primary" onClick={() => router.push("/train")} style={{ minHeight: 56, fontSize: 18, borderRadius: 14, width: "min(320px, 100%)", marginTop: 16 }}>Done</button>
      </div>
    );
  }

  // ── Running ───────────────────────────────────────────────────────────────
  const urgent = remainingMs < 60_000;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "var(--bg-deep)", display: "flex", flexDirection: "column", padding: "calc(env(safe-area-inset-top) + 12px) 16px calc(env(safe-area-inset-bottom) + 12px)" }}>
      {/* Record flash */}
      {flash && (
        <div style={{ position: "absolute", inset: 0, zIndex: 5, background: "var(--violet)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", color: "#06060B", animation: "cc-flash 1.8s var(--easeOut) forwards", pointerEvents: "none" }}>
          <div style={{ fontSize: 15, fontFamily: "var(--f-mono)", letterSpacing: "0.2em", textTransform: "uppercase" }}>New record</div>
          <div style={{ fontSize: 96, fontWeight: 700, lineHeight: 1 }}>{rounds}</div>
        </div>
      )}

      {/* Top bar: clock + to-beat */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 8 }}>
        <div style={{ fontSize: 14, color: "var(--ink-3)", fontFamily: "var(--f-mono)" }}>
          TO BEAT <span style={{ fontSize: 19, color: "var(--ink)", fontWeight: 600 }}>{toBeat ?? "…"}</span>
        </div>
        <div className="tabular-nums" style={{ fontSize: 34, fontWeight: 300, fontVariantNumeric: "tabular-nums", color: urgent ? "var(--neg)" : "var(--ink)" }}>{fmtClock(remainingMs / 1000)}</div>
        <div style={{ textAlign: "right", fontSize: 14, color: paceColor, fontFamily: "var(--f-mono)" }}>
          {pace ? <>PACE <span style={{ fontSize: 19, fontWeight: 600 }}>{pace.projected}</span></> : <span style={{ color: "var(--ink-4)" }}>PACE …</span>}
        </div>
      </div>
      <div className="cc-progress-track" style={{ height: 3, marginTop: 8 }}>
        <div className="cc-progress-fill" style={{ width: `${(elapsedMs / totalMs) * 100}%`, transition: "width 0.25s linear" }} />
      </div>

      {/* Tap zone */}
      <button
        onClick={addRound}
        aria-label="Add one round"
        style={{
          flex: 1, margin: "12px 0", borderRadius: 28, border: "2px solid var(--line-hi)",
          background: "var(--fill-1)", color: "inherit", cursor: "pointer",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
          WebkitTapHighlightColor: "transparent", touchAction: "manipulation",
        }}
        className="amrap-tap"
      >
        <div style={{ fontSize: 14, fontFamily: "var(--f-mono)", letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--ink-3)" }}>rounds</div>
        <div key={rounds} className="tabular-nums amrap-num" style={{ fontSize: "clamp(120px, 42vw, 220px)", fontWeight: 200, lineHeight: 1, letterSpacing: "-0.05em", color: toBeat !== null && rounds > toBeat ? "var(--pos)" : "var(--ink)" }}>{rounds}</div>
        <div style={{ fontSize: 15, color: "var(--ink-3)", marginTop: 6 }}>tap anywhere here after each round</div>
        {pace && (
          <div style={{ fontSize: 15, color: paceColor, marginTop: 2 }}>
            {fmtClock(pace.avg / 1000)} per round · on pace for {pace.projected}
            {toBeat !== null && (pace.projected > toBeat ? " · ahead" : pace.projected === toBeat ? " · tight" : " · behind")}
          </div>
        )}
      </button>

      {/* Round recipe, compact */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginBottom: 12 }}>
        {w.exercises.map((e) => (
          <span key={e.id} style={{ fontSize: 14, color: "var(--ink-3)", fontFamily: "var(--f-mono)" }}>{e.reps} {e.name.toLowerCase()}</span>
        ))}
      </div>

      {/* Bottom controls */}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, alignItems: "center" }}>
        <button onClick={undoRound} className="cc-btn cc-btn-ghost" style={{ minHeight: 52, minWidth: 80, borderRadius: 14 }} disabled={rounds === 0}>− undo</button>
        <button onClick={endEarly} className="cc-btn cc-btn-ghost" style={{ minHeight: 52, borderRadius: 14 }}>Finish early</button>
        <button onClick={discard} className="cc-btn cc-btn-ghost" style={{ minHeight: 52, minWidth: 52, borderRadius: 14, padding: 0, color: "var(--neg)" }} aria-label="Discard">✕</button>
      </div>

      <style>{`
        .amrap-tap:active { background: var(--fill-2) !important; border-color: var(--violet) !important; }
        @keyframes amrap-pop { 0% { transform: scale(1.12); } 100% { transform: scale(1); } }
        .amrap-num { animation: amrap-pop 0.25s var(--easeOut); }
        @keyframes cc-flash { 0% { opacity: 1; } 70% { opacity: 1; } 100% { opacity: 0; } }
      `}</style>
    </div>
  );
}
