"use client";

/**
 * AmrapGame · the Kettlebell 30 player (/train/kb1). Rebuilt 2026-09-24 (Ali: "fewer taps").
 *
 * The session
 *   - 30:00 counts down from Start (w.amrapMinutes) · no pause: it's a race
 *   - the screen shows the MOVEMENT SEQUENCE in order (one card, every move with its reps, a
 *     how-to ▶ where a move has one), a running work timer for the current round, and two
 *     buttons: REST (pauses the work timer, counts the rest up, amber · "Back to it" resumes)
 *     and ROUND DONE (counts the round). No tap per movement any more · the per-move times of
 *     the 2026-09-20 player are gone with it; per-ROUND work time still comes from the Round
 *     Done taps, so the weekly work-only pace keeps working.
 *   - there is no automatic rest between rounds: rest is the button, whenever you want it
 *   - time up (or End) → the bench block: 3 × 20 incline bench with a 90 s rest countdown between
 *     sets, dumbbells (20 kg = his max pair) or machine, remembered
 *   - summary: rounds, WORK-ONLY average round time against last week's, rest total, the bench
 *   The score you see big is still rounds; the weekly comparison uses work-only round time
 *   (see types.ts, "Work-only metrics").
 *
 * The phone keeps the session AND the live cursor (round timer, rest) on every tap, so a locked
 * phone or a crash loses nothing. Sessions from the tap-per-move era keep their per-move logs in
 * the DB; nothing here reads them.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOverview, useWorkouts, readActiveSession, writeActiveSession, saveSession, workoutByKey } from "@/lib/train/useTrain";
import { readCache, writeCache } from "@/lib/local/store";
import {
  BENCH_DEFAULT, PRIMARY_KEY, fmtClock, isoWeekKey, newClientId, newExerciseId, numberToBeat, paceToBeat, repsLabel,
  weeklyBests, weeklyPaces, workStats,
  type AmrapLog, type BenchLog, type TrainExercise, type TrainSession, type WorkoutKey,
} from "@/lib/train/types";
import { TRAIN_TRACKS, TRAIN_TRACK_KEY, trackUrl } from "@/lib/train/music";
import { checklistToday } from "@/lib/checklist/day";
import { cues } from "@/lib/routine/cues";
import { RepEditor } from "@/components/train/RepEditor";

type Status = "idle" | "running" | "bench" | "summary";

/** Where you are inside the running session · persisted with the session on every tap. */
type Live = {
  roundStartedAt: number;   // wall clock · start of the current WORK segment of this round
  roundWorkMs: number;      // work already banked on this round before the current segment (after a rest)
  roundRestMs: number;      // rest taken so far in this round
  rest: { startedAt: number } | null;
};

const LIVE_KEY = "train-live";
const BENCH_KEY = "cc-bench-last";
/** A cursor saved by the tap-per-move player (before 2026-09-24) has `moveIdx` · start the round afresh. */
const readLive = (): Live | null => {
  const l = readCache<Live & { moveIdx?: number }>(LIVE_KEY)?.data ?? null;
  if (!l || typeof l.roundStartedAt !== "number") return null;
  return { roundStartedAt: l.roundStartedAt, roundWorkMs: l.roundWorkMs ?? 0, roundRestMs: l.roundRestMs ?? 0, rest: l.rest ? { startedAt: l.rest.startedAt } : null };
};
const writeLive = (l: Live | null) => { if (l) writeCache(LIVE_KEY, l); else { try { localStorage.removeItem("cc:v1:" + LIVE_KEY); } catch { /* ignore */ } } };
const freshLive = (t: number): Live => ({ roundStartedAt: t, roundWorkMs: 0, roundRestMs: 0, rest: null });

/** Wall clock for tap handlers · read here so a handler's timestamp is never mistaken for render-time state. */
const nowMs = () => Date.now();

const mono: React.CSSProperties = { fontFamily: "var(--f-mono)", letterSpacing: "0.14em", textTransform: "uppercase", fontSize: 13, color: "var(--ink-3)" };

export function AmrapGame({ workoutKey, details }: { workoutKey: WorkoutKey; details?: React.ReactNode }) {
  const router = useRouter();
  const { workouts, saveWorkout } = useWorkouts();
  const { data: ov, refresh } = useOverview();
  const w = workoutByKey(workouts, workoutKey);
  const minutes = w.amrapMinutes ?? 30;
  const totalMs = minutes * 60_000;
  const kg = ov?.kettlebellKg ?? 12;
  const today = checklistToday();

  // Numbers to beat · rounds (the score) and work-only pace (the honest weekly comparison).
  const ownBests = useMemo(() => (ov && workoutKey !== PRIMARY_KEY ? weeklyBests(ov.sessions, today, workoutKey) : null), [ov, workoutKey, today]);
  const toBeatObj = workoutKey === PRIMARY_KEY ? ov?.toBeat ?? null : ownBests ? numberToBeat(ownBests, today) : null;
  const toBeat = toBeatObj?.rounds ?? null;
  const thisWeekBest = workoutKey === PRIMARY_KEY ? ov?.thisWeekBest ?? null : ownBests?.find((b) => b.week === isoWeekKey(today))?.best ?? null;
  const pace = useMemo(() => (ov ? paceToBeat(weeklyPaces(ov.sessions, today, workoutKey), today) : null), [ov, today, workoutKey]);

  const [status, setStatus] = useState<Status>("idle");
  const [session, setSession] = useState<TrainSession | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [burst, setBurst] = useState<{ id: number; above: boolean } | null>(null);
  const [record, setRecord] = useState(false);
  const [editing, setEditing] = useState<TrainExercise | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const lastTap = useRef(0);
  const recordShown = useRef(false);
  const wakeLock = useRef<WakeLockSentinel | null>(null);

  // ── Music ─────────────────────────────────────────────────────────────────
  const [track, setTrack] = useState<string>("off");
  const [previewing, setPreviewing] = useState<string | null>(null);
  const music = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    try {
      const t = localStorage.getItem(TRAIN_TRACK_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the phone's choice after mount
      if (t && (t === "off" || TRAIN_TRACKS.some((x) => x.slug === t))) setTrack(t);
    } catch { /* ignore */ }
  }, []);
  const pickTrack = (slug: string) => { setTrack(slug); try { localStorage.setItem(TRAIN_TRACK_KEY, slug); } catch { /* ignore */ } };
  const haltAudio = useCallback(() => { music.current?.pause(); if (music.current) music.current.currentTime = 0; }, []);
  const stopMusic = useCallback(() => { haltAudio(); setPreviewing(null); }, [haltAudio]);
  const playTrack = useCallback((slug: string, volume: number) => {
    if (!music.current) music.current = new Audio();
    const el = music.current;
    if (!el.src.endsWith(trackUrl(slug))) el.src = trackUrl(slug);
    el.loop = true; el.volume = volume;
    el.play().catch(() => { /* autoplay refused · cues still work */ });
  }, []);
  const preview = (slug: string) => { if (previewing === slug) { stopMusic(); return; } playTrack(slug, 0.5); setPreviewing(slug); };
  // Music follows the session · full during work, ducked during rest and the bench, off at the summary.
  const resting = !!live?.rest;
  useEffect(() => {
    if (track === "off") { haltAudio(); return; }
    if (status === "running") playTrack(track, resting ? 0.18 : 0.4);
    else if (status === "bench") { if (music.current) music.current.volume = 0.25; }
    else haltAudio();
  }, [status, track, resting, playTrack, haltAudio]);
  useEffect(() => () => { haltAudio(); cues.silence(); }, [haltAudio]);

  // ── Resume an unfinished session from the phone ───────────────────────────
  useEffect(() => {
    const a = readActiveSession();
    if (a && a.workoutKey === workoutKey && a.finishedAt === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring from localStorage after mount
      setSession(a);
      setLive(readLive() ?? freshLive(Date.now()));
      setStatus((a.log as AmrapLog).bench !== undefined ? "bench" : Date.now() - a.startedAt >= totalMs ? "bench" : "running");
      recordShown.current = toBeat !== null && (a.rounds ?? 0) > toBeat;
    }
  }, [toBeat, workoutKey, totalMs]);

  // Wake lock while the clock or the bench is on screen
  useEffect(() => {
    if (status !== "running" && status !== "bench") { wakeLock.current?.release().catch(() => {}); wakeLock.current = null; return; }
    const req = async () => { try { if ("wakeLock" in navigator) wakeLock.current = await navigator.wakeLock.request("screen"); } catch { /* later */ } };
    req();
    const onVis = () => { if (document.visibilityState === "visible") req(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [status]);

  const elapsedMs = session ? Math.min(totalMs, now - session.startedAt) : 0;
  const remainingMs = Math.max(0, totalMs - elapsedMs);
  const rounds = session?.rounds ?? 0;
  const log = (session?.log ?? {}) as AmrapLog;
  const exercises = w.exercises;

  const persist = (s: TrainSession, l: Live | null) => { writeActiveSession(s); writeLive(l); setSession(s); setLive(l); };

  // ── Clock ends → the bench block (the AMRAP part is closed here, saved after the bench)
  const timeUp = useCallback((s: TrainSession) => {
    cues.done();
    const closed: TrainSession = { ...s, durationSeconds: Math.round(Math.min(totalMs, Date.now() - s.startedAt) / 1000), log: { ...(s.log as AmrapLog), bench: readBenchDefault() } };
    writeActiveSession(closed); writeLive(null);
    setSession(closed); setLive(null);
    setStatus("bench");
  }, [totalMs]);

  // The 250 ms tick · also where "time up" is detected (inside the tick callback, never in render).
  useEffect(() => {
    if (status !== "running" && status !== "bench") return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (status === "running" && session && t - session.startedAt >= totalMs) timeUp(session);
    }, 250);
    return () => clearInterval(id);
  }, [status, session, totalMs, timeUp]);

  // Last 10 seconds of the clock: soft ticks
  const lastTick = useRef(-1);
  useEffect(() => {
    if (status !== "running") return;
    const sec = Math.ceil(remainingMs / 1000);
    if (sec <= 10 && sec >= 1 && sec !== lastTick.current) { lastTick.current = sec; cues.tick(); }
  }, [remainingMs, status]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const start = () => {
    cues.arm();
    const t = Date.now();
    const s: TrainSession = {
      clientId: newClientId(), workoutKey, date: today, startedAt: t, finishedAt: null, durationSeconds: null,
      rounds: 0, weightKg: kg, log: { roundsAt: [], v: 2, roundLogs: [], roundRestMs: [] }, notes: null,
    };
    persist(s, freshLive(t));
    setNow(t);
    setPreviewing(null);
    recordShown.current = false;
    setStatus("running");
    cues.work("Go");
  };

  /** Round Done · the one counting tap. A rest still running is closed into this round first. */
  const roundDone = () => {
    if (!session || !live) return;
    const t = nowMs();
    if (t - lastTap.current < 700) return;
    lastTap.current = t;
    const restMs = live.roundRestMs + (live.rest ? t - live.rest.startedAt : 0);
    const workMs = live.rest ? live.roundWorkMs : live.roundWorkMs + (t - live.roundStartedAt);
    const nextRounds = rounds + 1;
    const s: TrainSession = {
      ...session, rounds: nextRounds,
      log: { ...log, roundsAt: [...(log.roundsAt ?? []), t - session.startedAt], roundLogs: [...(log.roundLogs ?? []), { moves: [], restMs, ms: workMs }] },
    };
    persist(s, freshLive(t));
    const above = toBeat !== null && nextRounds > toBeat;
    if (above && !recordShown.current) { recordShown.current = true; setRecord(true); cues.record(); setTimeout(() => setRecord(false), 2600); }
    else cues.round(above);
    setBurst({ id: t, above });
    if (live.rest) cues.work();
  };

  const toggleRest = () => {
    if (!session || !live) return;
    const t = nowMs();
    if (live.rest) {
      persist(session, { ...live, rest: null, roundRestMs: live.roundRestMs + (t - live.rest.startedAt), roundStartedAt: t });
      cues.work();
    } else {
      persist(session, { ...live, rest: { startedAt: t }, roundWorkMs: live.roundWorkMs + (t - live.roundStartedAt) });
      try { navigator.vibrate?.(30); } catch { /* ignore */ }
    }
  };

  /** Take back the last Round Done · the round continues where it was. */
  const undo = () => {
    if (!session || !live || rounds === 0) return;
    const t = Date.now();
    const rl = log.roundLogs ?? [];
    const last = rl[rl.length - 1];
    const s: TrainSession = { ...session, rounds: rounds - 1, log: { ...log, roundsAt: (log.roundsAt ?? []).slice(0, -1), roundLogs: rl.slice(0, -1) } };
    persist(s, { roundStartedAt: t, roundWorkMs: (last?.ms ?? 0) + live.roundWorkMs + (live.rest ? 0 : t - live.roundStartedAt), roundRestMs: (last?.restMs ?? 0) + live.roundRestMs, rest: null });
    recordShown.current = toBeat !== null && rounds - 1 > toBeat;
  };

  const endEarly = () => { if (session && confirm("End the clock now and go to the bench?")) timeUp(session); };
  /** End: a false start (nothing done yet) is discarded, anything else goes to the bench and is saved. */
  const onEnd = () => { if (rounds === 0) discard(); else endEarly(); };
  const discard = () => {
    if (!confirm("Discard this workout? Nothing will be saved.")) return;
    writeActiveSession(null); writeLive(null);
    setSession(null); setLive(null);
    setStatus("idle");
  };

  const finish = useCallback((s: TrainSession, bench: BenchLog | null) => {
    const done: TrainSession = { ...s, finishedAt: Date.now(), log: { ...(s.log as AmrapLog), ...(bench ? { bench } : {}) } };
    if (!bench) delete (done.log as AmrapLog).bench;
    setSession(done); setStatus("summary");
    writeLive(null);
    saveSession(done).then(() => refresh());
  }, [refresh]);

  // ── Exercise editing (idle screen) ────────────────────────────────────────
  const saveExercise = (e: TrainExercise) => {
    const exists = w.exercises.some((x) => x.id === e.id);
    saveWorkout({ ...w, exercises: exists ? w.exercises.map((x) => (x.id === e.id ? e : x)) : [...w.exercises, e] });
  };
  const removeExercise = (id: string) => saveWorkout({ ...w, exercises: w.exercises.filter((x) => x.id !== id) });
  const blankExercise = (): TrainExercise => ({ id: newExerciseId("new"), name: "", reps: 5, sets: 1, perSide: true, kettlebell: true, weightKg: null, videoUrl: null });

  // ═════════════════════════════════════════════════════════════════════════
  // Idle
  // ═════════════════════════════════════════════════════════════════════════
  if (status === "idle") {
    const chosen = TRAIN_TRACKS.find((t) => t.slug === track);
    return (
      <div style={{ display: "grid", gap: 18, maxWidth: 560 }}>
        <div className="cc-pagetitle" style={{ marginBottom: 0 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 600 }}>{w.name}</h1>
            <div className="sub">AMRAP {minutes} min · {kg} kg · then 3 × {BENCH_DEFAULT.reps} incline bench</div>
          </div>
        </div>

        <div className="cc-card">
          <div className="cc-card-body" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, textAlign: "center" }}>
            <div>
              <div style={mono}>To beat</div>
              <div className="tabular-nums" style={{ fontSize: 38, fontWeight: 200, lineHeight: 1.1 }}>{toBeat ?? "…"}</div>
              <div style={{ fontSize: 13, color: "var(--ink-4)" }}>{toBeatObj ? `rounds · ${toBeatObj.label.toLowerCase()}` : "first week"}</div>
            </div>
            <div>
              <div style={mono}>Pace</div>
              <div className="tabular-nums" style={{ fontSize: 38, fontWeight: 200, lineHeight: 1.1 }}>{pace ? fmtClock(pace.avgRoundMs / 1000) : "…"}</div>
              <div style={{ fontSize: 13, color: "var(--ink-4)" }}>{pace ? "per round · work only" : "set the bar"}</div>
            </div>
            <div>
              <div style={mono}>This week</div>
              <div className="tabular-nums" style={{ fontSize: 38, fontWeight: 200, lineHeight: 1.1 }}>{thisWeekBest ?? "…"}</div>
              <div style={{ fontSize: 13, color: "var(--ink-4)" }}>best so far</div>
            </div>
          </div>
        </div>

        <button className="cc-btn cc-btn-primary" onClick={start} style={{ minHeight: 64, fontSize: 19, borderRadius: 14 }}>▶ Start {minutes}:00</button>

        {details}

        {/* Music · two shelves */}
        <section className="cc-card">
          <div className="cc-card-head"><span className="title">Music</span><span className="tail">{chosen ? chosen.title : "off"}</span></div>
          <div style={{ padding: "0 14px 6px" }}>
            {[{ slug: "off", title: "No music", by: "", shelf: "drive" as const }, ...TRAIN_TRACKS].map((m, i, arr) => {
              const on = track === m.slug;
              const shelfHead = m.slug !== "off" && (i === 1 || arr[i - 1].shelf !== m.shelf);
              return (
                <div key={m.slug}>
                  {shelfHead && <div style={{ ...mono, padding: "12px 2px 4px" }}>{m.shelf === "drive" ? "Drive · for the bell" : "From your mornings"}</div>}
                  <div style={{ display: "grid", gridTemplateColumns: m.by ? "1fr auto" : "1fr", alignItems: "center", borderBottom: "1px solid var(--line)" }}>
                    <button onClick={() => { pickTrack(m.slug); if (m.slug === "off") stopMusic(); }}
                      style={{ display: "grid", minHeight: 50, alignContent: "center", background: "transparent", border: "none", color: "inherit", font: "inherit", textAlign: "left", cursor: "pointer", padding: "6px 2px", gap: 1 }}>
                      <span style={{ fontSize: 16, fontWeight: on ? 600 : 400, color: on ? "var(--violet)" : "var(--ink)" }}>{on ? "● " : ""}{m.title}</span>
                      {m.by && <span style={{ fontSize: 12.5, color: "var(--ink-4)" }}>{m.by}</span>}
                    </button>
                    {m.by && (
                      <button onClick={() => preview(m.slug)} aria-label={previewing === m.slug ? "Stop preview" : `Preview ${m.title}`}
                        style={{ minWidth: 44, minHeight: 44, background: "transparent", border: "none", color: previewing === m.slug ? "var(--violet)" : "var(--ink-3)", fontSize: 15, cursor: "pointer" }}>
                        {previewing === m.slug ? "■" : "▶"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="cc-card">
          <div className="cc-card-head"><span className="title">One round</span><span className="tail">tap a move to change it</span></div>
          <div style={{ padding: "0 14px" }}>
            {w.exercises.map((e, i) => (
              <div key={e.id} style={{ display: "grid", gridTemplateColumns: e.videoUrl ? "1fr auto auto" : "1fr auto", alignItems: "center", borderBottom: "1px solid var(--line)", gap: 8 }}>
                <button onClick={() => setEditing(e)} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", minHeight: 48, alignItems: "center", background: "transparent", border: "none", color: "inherit", font: "inherit", textAlign: "left", cursor: "pointer", padding: "0 2px", gap: 10 }}>
                  <span className="tabular-nums" style={{ fontSize: 13, color: "var(--ink-4)", fontFamily: "var(--f-mono)" }}>{String(i + 1).padStart(2, "0")}</span>
                  <span style={{ fontSize: 16 }}>{e.name}</span>
                  <span className="cc-pill cc-pill-violet" style={{ fontSize: 14, fontFamily: "var(--f-mono)" }}>{repsLabel(e)}</span>
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

  // ═════════════════════════════════════════════════════════════════════════
  // Bench block · 3 × 20 after the clock
  // ═════════════════════════════════════════════════════════════════════════
  if (status === "bench" && session) {
    return <BenchBlock session={session} now={now} onSave={(b) => finish(session, b)} onSkip={() => finish(session, null)} />;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Summary
  // ═════════════════════════════════════════════════════════════════════════
  if (status === "summary" && session) {
    const beat = toBeat !== null && rounds > toBeat;
    const tied = toBeat !== null && rounds === toBeat;
    const st = workStats(session);
    const bench = (session.log as AmrapLog).bench;
    const paceDelta = st && pace ? st.avgRoundMs - pace.avgRoundMs : null;
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "var(--bg-deep)", overflowY: "auto", padding: "calc(env(safe-area-inset-top) + 24px) 24px calc(env(safe-area-inset-bottom) + 24px)" }}>
        <div style={{ maxWidth: 560, margin: "0 auto", display: "grid", gap: 14, textAlign: "center" }}>
          <div style={{ ...mono, fontSize: 14, color: beat ? "var(--pos)" : "var(--ink-3)" }}>{beat ? "New weekly record" : tied ? "Matched your best" : `${w.name} done`}</div>
          <div className="tabular-nums" style={{ fontSize: 120, fontWeight: 200, lineHeight: 1, letterSpacing: "-0.04em", color: beat ? "var(--pos)" : "var(--ink)" }}>{rounds}</div>
          <div style={{ fontSize: 17, color: "var(--ink-2)" }}>rounds in {fmtClock(session.durationSeconds ?? 0)}{toBeat !== null ? ` · to beat was ${toBeat}` : ""}</div>

          {st && (
            <div className="cc-card" style={{ textAlign: "left" }}>
              <div className="cc-card-head"><span className="title">Work only</span><span className="tail">rest taken apart</span></div>
              <div className="cc-card-body" style={{ display: "grid", gap: 8, fontSize: 15.5 }}>
                <Row k="Average round" v={`${fmtClock(st.avgRoundMs / 1000)}${paceDelta !== null ? ` · ${paceDelta <= 0 ? "−" : "+"}${fmtClock(Math.abs(paceDelta) / 1000)} vs ${pace!.label.toLowerCase()}` : ""}`} good={paceDelta !== null ? paceDelta <= 0 : undefined} />
                <Row k="Fastest round" v={fmtClock(st.bestRoundMs / 1000)} />
                <Row k="Worked · rested" v={`${fmtClock(st.workMs / 1000)} · ${fmtClock(st.restMs / 1000)}`} />
              </div>
            </div>
          )}
          {bench && bench.reps.length > 0 && (
            <div style={{ fontSize: 15, color: "var(--ink-3)" }}>Incline bench · {bench.reps.join(" / ")} reps · {bench.weightKg} kg {bench.mode}</div>
          )}
          <button className="cc-btn cc-btn-primary" onClick={() => router.push("/train")} style={{ minHeight: 56, fontSize: 18, borderRadius: 14, width: "min(320px, 100%)", margin: "10px auto 0" }}>Done</button>
        </div>
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Running · the sequence, Rest, Round Done
  // ═════════════════════════════════════════════════════════════════════════
  if (!session || !live) return null;
  const urgent = remainingMs < 60_000;
  const aboveBar = toBeat !== null && rounds > toBeat;
  const roundMs = live.rest ? live.roundWorkMs : live.roundWorkMs + (now - live.roundStartedAt);
  const restMs = live.rest ? now - live.rest.startedAt : 0;
  const lastRound = (log.roundLogs ?? [])[rounds - 1];
  const stSoFar = workStats(session);
  const accent = aboveBar ? "var(--pos)" : "var(--violet)";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "var(--bg-deep)", display: "flex", flexDirection: "column", padding: "calc(env(safe-area-inset-top) + 10px) 14px calc(env(safe-area-inset-bottom) + 10px)", gap: 10 }}>
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

      {/* Top strip: to beat · clock · round */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 8 }}>
        <div style={{ ...mono, letterSpacing: "0.08em" }}>TO BEAT <span style={{ fontSize: 20, color: "var(--ink)", fontWeight: 600, letterSpacing: 0 }}>{toBeat ?? "…"}</span></div>
        <div className="tabular-nums" style={{ fontSize: 36, fontWeight: 300, color: urgent ? "var(--neg)" : "var(--ink)" }}>{fmtClock(remainingMs / 1000)}</div>
        <div style={{ ...mono, letterSpacing: "0.08em", textAlign: "right", whiteSpace: "nowrap" }}>ROUND <span style={{ fontSize: 20, color: accent, fontWeight: 600, letterSpacing: 0 }}>{rounds + 1}</span></div>
      </div>
      <div className="cc-progress-track" style={{ height: 3 }}>
        <div className="cc-progress-fill" style={{ width: `${(elapsedMs / totalMs) * 100}%`, transition: "width 0.25s linear", background: aboveBar ? "var(--pos)" : undefined }} />
      </div>

      {/* Round timer · work time of this round (rest counted apart, amber while resting) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "baseline", gap: 10, padding: "2px 4px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span className="tabular-nums" style={{ fontSize: 40, fontWeight: 200, lineHeight: 1, letterSpacing: "-0.03em", color: live.rest ? "var(--warn)" : "var(--ink)" }}>{fmtClock((live.rest ? restMs : roundMs) / 1000)}</span>
          <span style={{ fontSize: 14, color: live.rest ? "var(--warn)" : "var(--ink-3)" }}>{live.rest ? `resting · ${fmtClock(roundMs / 1000)} worked` : "this round"}</span>
        </div>
        <span style={{ fontSize: 13.5, color: "var(--ink-4)", textAlign: "right" }}>
          {lastRound ? `last ${fmtClock(lastRound.ms / 1000)}` : ""}{stSoFar && stSoFar.rounds > 1 ? ` · avg ${fmtClock(stSoFar.avgRoundMs / 1000)}` : ""}{pace ? ` · beat ${fmtClock(pace.avgRoundMs / 1000)}` : ""}
        </span>
      </div>

      {/* The sequence · every move in order, nothing to tap (a ▶ opens a how-to) */}
      <div className="amrap-seq" style={{ flex: 1, minHeight: 0, overflowY: "auto", borderRadius: 20, border: `2px solid ${live.rest ? "var(--warn)" : accent}`, background: "var(--fill-1)", position: "relative", padding: "4px 12px", transition: "border-color 0.3s var(--easeOut)", ["--c" as string]: accent }}>
        {burst && (
          <span key={burst.id} aria-hidden className="amrap-burst">
            <span className="amrap-burst-glow" /><span className="amrap-burst-ring" /><span className="amrap-burst-ring" style={{ animationDelay: "0.1s" }} /><span className="amrap-plus">+1</span>
          </span>
        )}
        {exercises.map((e, i) => (
          <div key={e.id} style={{ display: "grid", gridTemplateColumns: "28px 1fr auto", alignItems: "center", gap: 8, minHeight: 46, borderBottom: i < exercises.length - 1 ? "1px solid var(--line)" : "none", position: "relative" }}>
            <span className="tabular-nums" style={{ fontSize: 12.5, color: "var(--ink-4)", fontFamily: "var(--f-mono)" }}>{String(i + 1).padStart(2, "0")}</span>
            <span style={{ fontSize: "clamp(16px, 4.6vw, 19px)", fontWeight: 500, lineHeight: 1.2, minWidth: 0 }}>{e.name}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span className="tabular-nums" style={{ fontSize: 15, fontFamily: "var(--f-mono)", color: accent, whiteSpace: "nowrap" }}>{repsLabel(e)}</span>
              {e.videoUrl && <a href={e.videoUrl} target="_blank" rel="noopener noreferrer" aria-label={`How to do ${e.name}`} style={{ minWidth: 40, minHeight: 40, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--violet)", textDecoration: "none", fontSize: 13, marginRight: -10 }}>▶</a>}
            </span>
          </div>
        ))}
      </div>

      {/* Two buttons · Rest (or Back to it) and Round Done. Undo and End stay small below. */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 8 }}>
        <button onClick={toggleRest} className={`cc-btn ${live.rest ? "cc-btn-primary" : "cc-btn-secondary"}`} style={{ minHeight: 76, borderRadius: 18, fontSize: 18, ...(live.rest ? { background: "var(--warn)", borderColor: "var(--warn)", color: "#06060B" } : {}) }}>
          {live.rest ? "Back to it" : "Rest"}
        </button>
        <button onClick={roundDone} className="cc-btn cc-btn-primary amrap-tap" style={{ minHeight: 76, borderRadius: 18, fontSize: 20, fontWeight: 600, background: aboveBar ? "var(--pos)" : undefined, borderColor: aboveBar ? "var(--pos)" : undefined }} aria-label={`Round ${rounds + 1} done`}>
          Round done
        </button>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "0 4px" }}>
        <button onClick={undo} disabled={rounds === 0} style={{ minHeight: 40, background: "transparent", border: "none", color: rounds === 0 ? "var(--ink-4)" : "var(--ink-3)", font: "inherit", fontSize: 14, cursor: "pointer", padding: "0 6px" }}>Undo round</button>
        <button onClick={onEnd} style={{ minHeight: 40, background: "transparent", border: "none", color: "var(--neg)", font: "inherit", fontSize: 14, cursor: "pointer", padding: "0 6px" }} aria-label="End the clock">End</button>
      </div>

      <style>{`
        .amrap-tap:active { filter: brightness(1.15); }
        .amrap-seq { scrollbar-width: none; }
        .amrap-burst { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 2; }
        .amrap-burst-glow { position: absolute; width: 70vmin; height: 70vmin; border-radius: 50%; background: radial-gradient(circle, color-mix(in srgb, var(--c) 42%, transparent) 0%, transparent 62%); animation: amrap-glow 0.9s var(--easeOut) forwards; }
        @keyframes amrap-glow { 0% { transform: scale(0.3); opacity: 1; } 100% { transform: scale(1.7); opacity: 0; } }
        .amrap-burst-ring { position: absolute; width: 40vmin; height: 40vmin; border-radius: 50%; border: 2px solid var(--c); animation: amrap-ring 0.85s var(--easeOut) forwards; }
        @keyframes amrap-ring { 0% { transform: scale(0.45); opacity: 0.9; } 100% { transform: scale(2.3); opacity: 0; } }
        .amrap-plus { position: absolute; right: 10%; top: 42%; font-family: var(--f-mono); font-size: 30px; font-weight: 600; color: var(--c); animation: amrap-plus 1s var(--easeOut) forwards; }
        @keyframes amrap-plus { 0% { transform: translateY(0) scale(0.8); opacity: 0; } 15% { opacity: 1; transform: translateY(-8px) scale(1); } 100% { transform: translateY(-96px) scale(1); opacity: 0; } }
        .amrap-record { position: absolute; inset: 0; z-index: 5; pointer-events: none; overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; text-align: center; background: color-mix(in srgb, var(--bg-deep) 96%, transparent); animation: amrap-record-fade 2.6s var(--easeOut) forwards; }
        @keyframes amrap-record-fade { 0% { opacity: 0; } 6% { opacity: 1; } 82% { opacity: 1; } 100% { opacity: 0; } }
        .amrap-record-burst { position: absolute; width: 90vmin; height: 90vmin; border-radius: 50%; background: radial-gradient(circle, color-mix(in srgb, var(--violet) 55%, transparent) 0%, transparent 68%); animation: amrap-record-burst 1.5s var(--easeOut) forwards; }
        @keyframes amrap-record-burst { 0% { transform: scale(0); opacity: 1; } 100% { transform: scale(2.6); opacity: 0; } }
        .amrap-record-ring { position: absolute; width: 50vmin; height: 50vmin; border-radius: 50%; border: 2px solid var(--violet); animation: amrap-record-ring 1.7s var(--easeOut) forwards; }
        @keyframes amrap-record-ring { 0% { transform: scale(0.15); opacity: 1; } 100% { transform: scale(3.2); opacity: 0; } }
        .amrap-record-label { position: relative; font-family: var(--f-mono); font-size: 15px; text-transform: uppercase; color: var(--violet); animation: amrap-track 1.1s var(--easeOut) forwards; }
        @keyframes amrap-track { 0% { letter-spacing: 0.75em; opacity: 0; } 100% { letter-spacing: 0.24em; opacity: 1; } }
        .amrap-record-num { position: relative; font-size: clamp(150px, 50vw, 280px); font-weight: 200; line-height: 1; letter-spacing: -0.05em; color: var(--pos); animation: amrap-slam 0.75s cubic-bezier(.34,1.56,.64,1) 0.08s both; }
        @keyframes amrap-slam { 0% { transform: scale(0.35); opacity: 0; filter: drop-shadow(0 0 0 transparent); } 60% { filter: drop-shadow(0 0 40px var(--pos)); } 100% { transform: scale(1); opacity: 1; filter: drop-shadow(0 0 14px color-mix(in srgb, var(--pos) 50%, transparent)); } }
        .amrap-record-sub { position: relative; font-size: 15px; color: var(--ink-2); animation: amrap-rise 0.6s var(--easeOut) 0.55s both; }
        @keyframes amrap-rise { 0% { transform: translateY(10px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .amrap-burst-glow, .amrap-burst-ring, .amrap-plus, .amrap-record-burst, .amrap-record-ring, .amrap-record-label, .amrap-record-num, .amrap-record-sub { animation-duration: 0.01s !important; animation-delay: 0s !important; }
        }
      `}</style>
    </div>
  );
}

function Row({ k, v, good }: { k: string; v: string; good?: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 12 }}>
      <span style={{ color: "var(--ink-3)" }}>{k}</span>
      <span className="tabular-nums" style={{ textAlign: "right", color: good === undefined ? "var(--ink)" : good ? "var(--pos)" : "var(--warn)" }}>{v}</span>
    </div>
  );
}

// ─── Bench block ──────────────────────────────────────────────────────────────

function readBenchDefault(): BenchLog {
  try {
    const raw = localStorage.getItem(BENCH_KEY);
    if (raw) { const j = JSON.parse(raw) as Partial<BenchLog>; if ((j.mode === "dumbbells" || j.mode === "machine") && typeof j.weightKg === "number") return { mode: j.mode, weightKg: j.weightKg, reps: [] }; }
  } catch { /* ignore */ }
  return { mode: "dumbbells", weightKg: BENCH_DEFAULT.weightKg, reps: [] };
}

/** 3 × 20 incline bench after the clock · reps per set are editable, a 90 s rest counts down between sets. */
function BenchBlock({ session, now, onSave, onSkip }: { session: TrainSession; now: number; onSave: (b: BenchLog) => void; onSkip: () => void }) {
  const initial = (session.log as AmrapLog).bench ?? readBenchDefault();
  const [mode, setMode] = useState<BenchLog["mode"]>(initial.mode);
  const [weightKg, setWeightKg] = useState(initial.weightKg);
  const [reps, setReps] = useState<number[]>(initial.reps.length ? initial.reps : []);
  const [draft, setDraft] = useState(BENCH_DEFAULT.reps);
  const [restStartedAt, setRestStartedAt] = useState<number | null>(null);
  const setsLeft = BENCH_DEFAULT.sets - reps.length;
  const restLeft = restStartedAt ? Math.max(0, BENCH_DEFAULT.restSeconds * 1000 - (now - restStartedAt)) : 0;
  useEffect(() => {
    if (!restStartedAt) return;
    const id = setInterval(() => { if (Date.now() - restStartedAt >= BENCH_DEFAULT.restSeconds * 1000) { setRestStartedAt(null); cues.work(); } }, 250);
    return () => clearInterval(id);
  }, [restStartedAt]);

  const remember = (m: BenchLog["mode"], kg: number) => { try { localStorage.setItem(BENCH_KEY, JSON.stringify({ mode: m, weightKg: kg })); } catch { /* ignore */ } };
  const setDone = () => {
    const next = [...reps, draft];
    setReps(next);
    remember(mode, weightKg);
    if (next.length < BENCH_DEFAULT.sets) { setRestStartedAt(Date.now()); try { navigator.vibrate?.(30); } catch { /* ignore */ } }
    else cues.done();
  };
  const step = mode === "machine" ? 2.5 : 1;
  const big: React.CSSProperties = { minHeight: 60, borderRadius: 16, fontSize: 17 };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "var(--bg-deep)", display: "flex", flexDirection: "column", gap: 12, padding: "calc(env(safe-area-inset-top) + 14px) 16px calc(env(safe-area-inset-bottom) + 12px)", overflowY: "auto" }}>
      <div>
        <div style={mono}>After the clock · {session.rounds ?? 0} rounds banked</div>
        <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 2 }}>Incline bench · {BENCH_DEFAULT.sets} × {BENCH_DEFAULT.reps}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {(["dumbbells", "machine"] as const).map((m) => (
          <button key={m} onClick={() => { setMode(m); const kg = m === "dumbbells" ? BENCH_DEFAULT.weightKg : Math.max(weightKg, 25); setWeightKg(kg); remember(m, kg); }}
            className={`cc-btn ${mode === m ? "cc-btn-primary" : "cc-btn-ghost"}`} style={{ minHeight: 48, borderRadius: 12, fontSize: 16 }}>
            {m === "dumbbells" ? "Dumbbells" : "Speediance"}
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 16, color: "var(--ink-2)" }}>{mode === "dumbbells" ? "Pair total" : "Load"}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button className="cc-btn cc-btn-ghost" onClick={() => setWeightKg((k) => Math.max(0, +(k - step).toFixed(1)))} style={{ width: 56, height: 52, fontSize: 24, borderRadius: 12, padding: 0 }} aria-label="less weight">−</button>
          <span className="tabular-nums" style={{ minWidth: 88, textAlign: "center", fontSize: 24, fontWeight: 600 }}>{weightKg} kg</span>
          <button className="cc-btn cc-btn-ghost" onClick={() => setWeightKg((k) => +(k + step).toFixed(1))} style={{ width: 56, height: 52, fontSize: 24, borderRadius: 12, padding: 0 }} aria-label="more weight">+</button>
        </div>
      </div>

      {/* Sets */}
      <div className="cc-card">
        <div style={{ padding: "0 14px" }}>
          {Array.from({ length: BENCH_DEFAULT.sets }).map((_, i) => {
            const done = reps[i];
            const current = i === reps.length;
            return (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "56px 1fr auto", alignItems: "center", gap: 10, minHeight: 64, borderBottom: i < BENCH_DEFAULT.sets - 1 ? "1px solid var(--line)" : "none", opacity: done === undefined && !current ? 0.45 : 1 }}>
                <span style={{ ...mono, letterSpacing: "0.08em" }}>Set {i + 1}</span>
                {done !== undefined ? (
                  <span style={{ fontSize: 17, color: "var(--pos)" }}>{done} reps ✓</span>
                ) : current ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button className="cc-btn cc-btn-ghost" onClick={() => setDraft((r) => Math.max(1, r - 1))} style={{ width: 52, height: 48, fontSize: 22, borderRadius: 12, padding: 0 }} aria-label="one rep less">−</button>
                    <span className="tabular-nums" style={{ minWidth: 40, textAlign: "center", fontSize: 24, fontWeight: 600 }}>{draft}</span>
                    <button className="cc-btn cc-btn-ghost" onClick={() => setDraft((r) => Math.min(60, r + 1))} style={{ width: 52, height: 48, fontSize: 22, borderRadius: 12, padding: 0 }} aria-label="one rep more">+</button>
                  </div>
                ) : <span style={{ fontSize: 15, color: "var(--ink-4)" }}>{BENCH_DEFAULT.reps} reps</span>}
                {current && <button onClick={setDone} className="cc-btn cc-btn-primary" style={{ minHeight: 48, borderRadius: 12, padding: "0 16px" }}>Done</button>}
              </div>
            );
          })}
        </div>
      </div>

      {restStartedAt && restLeft > 0 && (
        <button onClick={() => setRestStartedAt(null)} className="cc-card" style={{ textAlign: "center", padding: "14px 16px", cursor: "pointer", color: "inherit", font: "inherit", border: "1px solid var(--warn)" }}>
          <div style={{ ...mono, color: "var(--warn)" }}>Rest · tap to skip</div>
          <div className="tabular-nums" style={{ fontSize: 56, fontWeight: 200, lineHeight: 1.1 }}>{fmtClock(restLeft / 1000)}</div>
        </button>
      )}

      <div style={{ flex: 1 }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
        <button onClick={() => onSave({ mode, weightKg, reps })} className="cc-btn cc-btn-primary" style={big} disabled={reps.length === 0}>
          {setsLeft === 0 ? "Save workout" : `Save with ${reps.length} set${reps.length === 1 ? "" : "s"}`}
        </button>
        <button onClick={() => { if (reps.length === 0 || confirm("Leave the bench out of this session?")) onSkip(); }} className="cc-btn cc-btn-ghost" style={{ ...big, minWidth: 96 }}>Skip</button>
      </div>
    </div>
  );
}
