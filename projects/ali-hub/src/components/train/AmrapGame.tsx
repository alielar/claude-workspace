"use client";

/**
 * AmrapGame · the AMRAP race screen (the KB Hour lives at /train/kb1).
 *
 *   - 30:00 counts down from the moment you press Start (no pause: it's a race)
 *   - the whole middle of the screen is the +1 ROUND button · one thumb, sweaty hands,
 *     mid-set; a 700 ms guard stops accidental double taps; small undo bottom-left
 *   - the number to beat (last week's best) is always visible
 *   - pace: "on pace for N" from your average round time; colour says ahead / tight / behind
 *   - every round: a burst from the number (glow, rings, "+1"), a bell-landing sound, a short buzz ·
 *     violet, then green once you are past the record (and the lift in the sound sits higher)
 *   - the moment you pass the number to beat: the record moment · dark overlay, violet burst and
 *     rings, the number slams in green, a four-note rise (cues.record) · 2.6 s, taps still count
 *   - the recipe line at the bottom: a move with a how-to reel (videoUrl) is a tap away, mid-set
 *   - time up: alarm → summary → saved (offline-safe)
 * The live session is stored on the phone every tap, so nothing is lost if the phone locks.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOverview, useWorkouts, readActiveSession, writeActiveSession, saveSession, workoutByKey } from "@/lib/train/useTrain";
import { newExerciseId, fmtClock, newClientId, type TrainSession, PRIMARY_KEY } from "@/lib/train/types";
import { checklistToday } from "@/lib/checklist/day";
import { cues } from "@/lib/routine/cues";
import { RepEditor } from "@/components/train/RepEditor";
import type { TrainExercise, WorkoutKey } from "@/lib/train/types";
import { weeklyBests, numberToBeat, isoWeekKey } from "@/lib/train/types";

type Status = "idle" | "running" | "summary";

export function AmrapGame({ workoutKey, details }: { workoutKey: WorkoutKey; details?: React.ReactNode }) {
  const router = useRouter();
  const { workouts, saveWorkout } = useWorkouts();
  const { data: ov, refresh } = useOverview();
  const w = workoutByKey(workouts, workoutKey);
  const minutes = w.amrapMinutes ?? 30;
  const totalMs = minutes * 60_000;
  const kg = ov?.kettlebellKg ?? 12;
  // W1's number to beat comes precomputed from the server; other AMRAP workouts
  // compute theirs from the same session history, filtered to their own key.
  const today = checklistToday();
  const ownBests = useMemo(
    () => (ov && workoutKey !== PRIMARY_KEY ? weeklyBests(ov.sessions, today, workoutKey) : null),
    [ov, workoutKey, today]);
  const toBeatObj = workoutKey === PRIMARY_KEY ? ov?.toBeat ?? null : ownBests ? numberToBeat(ownBests, today) : null;
  const toBeat = toBeatObj?.rounds ?? null;
  const thisWeekBest = workoutKey === PRIMARY_KEY
    ? ov?.thisWeekBest ?? null
    : ownBests?.find((b) => b.week === isoWeekKey(today))?.best ?? null;

  const [status, setStatus] = useState<Status>("idle");
  const [session, setSession] = useState<TrainSession | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Round celebration (2026-09-20, Ali: "make it feel like I really did something"):
  // every tap fires a burst from the number (glow + rings + a floating "+1", violet ·
  // green once you're past the record); the tap that beats the number to beat gets
  // the full-screen record moment instead of the old flat flash. `burst.id` re-mounts
  // the elements so the animation restarts on every round.
  const [burst, setBurst] = useState<{ id: number; above: boolean } | null>(null);
  const [record, setRecord] = useState(false);
  const [editing, setEditing] = useState<TrainExercise | null>(null);
  const lastTap = useRef(0);
  const recordShown = useRef(false);
  const wakeLock = useRef<WakeLockSentinel | null>(null);

  // Resume an unfinished session from the phone.
  useEffect(() => {
    const a = readActiveSession();
    if (a && a.workoutKey === workoutKey && a.finishedAt === null) {
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

  // Leaving the page must never leave a spoken cue playing.
  useEffect(() => () => cues.silence(), []);

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
      workoutKey,
      date: today,
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
    const above = toBeat !== null && nextRounds > toBeat;
    if (above && !recordShown.current) {
      recordShown.current = true;
      setRecord(true);
      cues.record();
      setTimeout(() => setRecord(false), 2600);
    } else {
      cues.round(above);
    }
    setBurst({ id: t, above });
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
              <div style={{ fontSize: 14, color: "var(--ink-4)" }}>{toBeatObj?.label ?? "first week · set the bar"}</div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontFamily: "var(--f-mono)", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-3)" }}>This week</div>
              <div className="tabular-nums" style={{ fontSize: 40, fontWeight: 200, lineHeight: 1.1 }}>{thisWeekBest ?? "…"}</div>
              <div style={{ fontSize: 14, color: "var(--ink-4)" }}>best so far</div>
            </div>
          </div>
        </div>

        <button className="cc-btn cc-btn-primary" onClick={start} style={{ minHeight: 64, fontSize: 19, borderRadius: 14 }}>▶ Start {minutes}:00</button>

        {details}

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
          {beat ? "New weekly record" : tied ? "Matched your best" : `${w.name} done`}
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
  const aboveBar = toBeat !== null && rounds > toBeat;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "var(--bg-deep)", display: "flex", flexDirection: "column", padding: "calc(env(safe-area-inset-top) + 12px) 16px calc(env(safe-area-inset-bottom) + 12px)" }}>
      {/* The record moment · a burst and three rings out of the centre, the number slams in
          green, "new record" tracks in. Taps still land underneath (pointer-events none). */}
      {record && (
        <div className="amrap-record" aria-live="polite">
          <div className="amrap-record-burst" />
          <div className="amrap-record-ring" />
          <div className="amrap-record-ring" style={{ animationDelay: "0.18s" }} />
          <div className="amrap-record-ring" style={{ animationDelay: "0.36s" }} />
          <div className="amrap-record-label">New record</div>
          <div className="tabular-nums amrap-record-num">{rounds}</div>
          <div className="amrap-record-sub">{toBeatObj ? `past ${toBeatObj.label.toLowerCase()}'s ${toBeat}` : "a new best"} · keep going</div>
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
          flex: 1, margin: "12px 0", borderRadius: 28, border: `2px solid ${aboveBar ? "var(--pos)" : "var(--line-hi)"}`,
          background: "var(--fill-1)", color: "inherit", cursor: "pointer", position: "relative", overflow: "hidden",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
          WebkitTapHighlightColor: "transparent", touchAction: "manipulation",
          transition: "border-color 0.4s var(--easeOut)",
          ["--c" as string]: aboveBar ? "var(--pos)" : "var(--violet)",
        }}
        className="amrap-tap"
      >
        {burst && (
          <span key={burst.id} aria-hidden className="amrap-burst">
            <span className="amrap-burst-glow" />
            <span className="amrap-burst-ring" />
            <span className="amrap-burst-ring" style={{ animationDelay: "0.1s" }} />
            <span className="amrap-plus">+1</span>
          </span>
        )}
        <div style={{ fontSize: 14, fontFamily: "var(--f-mono)", letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--ink-3)", position: "relative" }}>rounds{aboveBar ? " · above the bar" : ""}</div>
        <div key={rounds} className="tabular-nums amrap-num" style={{ position: "relative", fontSize: "clamp(120px, 42vw, 220px)", fontWeight: 200, lineHeight: 1, letterSpacing: "-0.05em", color: aboveBar ? "var(--pos)" : "var(--ink)" }}>{rounds}</div>
        <div style={{ fontSize: 15, color: "var(--ink-3)", marginTop: 6, position: "relative" }}>tap anywhere here after each round</div>
        {pace && (
          <div style={{ fontSize: 15, color: paceColor, marginTop: 2 }}>
            {fmtClock(pace.avg / 1000)} per round · on pace for {pace.projected}
            {toBeat !== null && (pace.projected > toBeat ? " · ahead" : pace.projected === toBeat ? " · tight" : " · behind")}
          </div>
        )}
      </button>

      {/* Round recipe · a move with a how-to reel is a tap away (opens Instagram / YouTube), the rest is plain text */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0 2px", justifyContent: "center", marginBottom: 8 }}>
        {w.exercises.map((e) => e.videoUrl ? (
          <a key={e.id} href={e.videoUrl} target="_blank" rel="noopener noreferrer" aria-label={`How to do ${e.name}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, minHeight: 44, padding: "0 8px", borderRadius: 10, fontSize: 14, color: "var(--ink-2)", fontFamily: "var(--f-mono)", textDecoration: "none", WebkitTapHighlightColor: "transparent" }}>
            {e.reps} {e.name.toLowerCase()}<span aria-hidden style={{ color: "var(--violet)", fontSize: 11 }}>▶</span>
          </a>
        ) : (
          <span key={e.id} style={{ display: "inline-flex", alignItems: "center", minHeight: 44, padding: "0 8px", fontSize: 14, color: "var(--ink-3)", fontFamily: "var(--f-mono)" }}>{e.reps} {e.name.toLowerCase()}</span>
        ))}
      </div>

      {/* Bottom controls */}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, alignItems: "center" }}>
        <button onClick={undoRound} className="cc-btn cc-btn-ghost" style={{ minHeight: 52, minWidth: 80, borderRadius: 14 }} disabled={rounds === 0}>− undo</button>
        <button onClick={endEarly} className="cc-btn cc-btn-ghost" style={{ minHeight: 52, borderRadius: 14 }}>Finish early</button>
        <button onClick={discard} className="cc-btn cc-btn-ghost" style={{ minHeight: 52, minWidth: 52, borderRadius: 14, padding: 0, color: "var(--neg)" }} aria-label="Discard">✕</button>
      </div>

      <style>{`
        .amrap-tap:active { background: var(--fill-2) !important; }

        /* the number lands: scale + glow settle */
        @keyframes amrap-pop {
          0% { transform: scale(1.22); filter: drop-shadow(0 0 28px var(--c)); }
          100% { transform: scale(1); filter: drop-shadow(0 0 0 transparent); }
        }
        .amrap-num { animation: amrap-pop 0.55s var(--easeOut); }

        /* every round: a glow bloom, two rings and a "+1" lifting off */
        .amrap-burst { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
        .amrap-burst-glow {
          position: absolute; width: 70vmin; height: 70vmin; border-radius: 50%;
          background: radial-gradient(circle, color-mix(in srgb, var(--c) 42%, transparent) 0%, transparent 62%);
          animation: amrap-glow 0.9s var(--easeOut) forwards;
        }
        @keyframes amrap-glow { 0% { transform: scale(0.3); opacity: 1; } 100% { transform: scale(1.7); opacity: 0; } }
        .amrap-burst-ring {
          position: absolute; width: 40vmin; height: 40vmin; border-radius: 50%;
          border: 2px solid var(--c); animation: amrap-ring 0.85s var(--easeOut) forwards;
        }
        @keyframes amrap-ring { 0% { transform: scale(0.45); opacity: 0.9; } 100% { transform: scale(2.3); opacity: 0; } }
        .amrap-plus {
          position: absolute; right: 10%; top: 42%; font-family: var(--f-mono); font-size: 30px; font-weight: 600; color: var(--c);
          animation: amrap-plus 1s var(--easeOut) forwards;
        }
        @keyframes amrap-plus { 0% { transform: translateY(0) scale(0.8); opacity: 0; } 15% { opacity: 1; transform: translateY(-8px) scale(1); } 100% { transform: translateY(-96px) scale(1); opacity: 0; } }

        /* the record moment */
        .amrap-record {
          position: absolute; inset: 0; z-index: 5; pointer-events: none; overflow: hidden;
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6; text-align: center;
          background: color-mix(in srgb, var(--bg-deep) 96%, transparent);
          animation: amrap-record-fade 2.6s var(--easeOut) forwards;
        }
        @keyframes amrap-record-fade { 0% { opacity: 0; } 6% { opacity: 1; } 82% { opacity: 1; } 100% { opacity: 0; } }
        .amrap-record-burst {
          position: absolute; width: 90vmin; height: 90vmin; border-radius: 50%;
          background: radial-gradient(circle, color-mix(in srgb, var(--violet) 55%, transparent) 0%, transparent 68%);
          animation: amrap-record-burst 1.5s var(--easeOut) forwards;
        }
        @keyframes amrap-record-burst { 0% { transform: scale(0); opacity: 1; } 100% { transform: scale(2.6); opacity: 0; } }
        .amrap-record-ring {
          position: absolute; width: 50vmin; height: 50vmin; border-radius: 50%; border: 2px solid var(--violet);
          animation: amrap-record-ring 1.7s var(--easeOut) forwards;
        }
        @keyframes amrap-record-ring { 0% { transform: scale(0.15); opacity: 1; } 100% { transform: scale(3.2); opacity: 0; } }
        .amrap-record-label {
          position: relative; font-family: var(--f-mono); font-size: 15px; text-transform: uppercase; color: var(--violet);
          animation: amrap-track 1.1s var(--easeOut) forwards;
        }
        @keyframes amrap-track { 0% { letter-spacing: 0.75em; opacity: 0; } 100% { letter-spacing: 0.24em; opacity: 1; } }
        .amrap-record-num {
          position: relative; font-size: clamp(150px, 50vw, 280px); font-weight: 200; line-height: 1; letter-spacing: -0.05em; color: var(--pos);
          animation: amrap-slam 0.75s cubic-bezier(.34,1.56,.64,1) 0.08s both;
        }
        @keyframes amrap-slam { 0% { transform: scale(0.35); opacity: 0; filter: drop-shadow(0 0 0 transparent); } 60% { filter: drop-shadow(0 0 40px var(--pos)); } 100% { transform: scale(1); opacity: 1; filter: drop-shadow(0 0 14px color-mix(in srgb, var(--pos) 50%, transparent)); } }
        .amrap-record-sub { position: relative; font-size: 15px; color: var(--ink-2); animation: amrap-rise 0.6s var(--easeOut) 0.55s both; }
        @keyframes amrap-rise { 0% { transform: translateY(10px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }

        @media (prefers-reduced-motion: reduce) {
          .amrap-num, .amrap-burst-glow, .amrap-burst-ring, .amrap-plus, .amrap-record-burst, .amrap-record-ring,
          .amrap-record-label, .amrap-record-num, .amrap-record-sub { animation-duration: 0.01s !important; animation-delay: 0s !important; }
        }
      `}</style>
    </div>
  );
}
