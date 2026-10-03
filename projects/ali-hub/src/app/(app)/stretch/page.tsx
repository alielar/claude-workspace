"use client";

/**
 * /stretch · "Mobility" · the guided morning timer.
 *
 * Three 10:00 sessions in sequence by calendar day (src/lib/routine/stretching.ts), 10 s rests,
 * full-screen while running. Time is computed from timestamps (not tick counts) so it stays
 * correct if the phone sleeps briefly. Screen stays awake (Wake Lock); every change beeps and
 * vibrates · NO voice since 2026-10-03 (Ali: the robotic names were disturbing).
 * Finishing ticks "Mobility" on today's checklist (offline-safe).
 *
 * MUSIC (2026-10-03): no picker. A random track from the epic shelf starts with the session;
 * when it ends the next one is another track, never one already heard this session.
 *
 * THE RUNNING SCREEN (2026-10-03, Ali: "it is all I look at for ten minutes · more engaging,
 * tasteful"): a big ring that drains with the phase (violet for a move, cyan for a rest, amber
 * for the lead-in), a slow ambient glow behind it that breathes with the block of the session,
 * the move name sliding in on every change, a strip of dots for the whole session (done · now ·
 * next), and the last three seconds pulse the ring. No figure demonstrating the move · Ali's
 * standing rule is precise motion or nothing (spec §7c item 13), so nothing approximate here.
 * Everything collapses to the plain numbers under prefers-reduced-motion.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  STRETCH_MOVES, STRETCH_BLOCKS, STRETCH_SESSIONS, STRETCH_LEADIN_SECONDS, SESSION_KEYS, MOVE_TARGETS, buildStretchPlan, isDefaultName, sessionForDate, sessionSeconds,
  readSessionPick, writeSessionPick, type SessionKey, type StretchPhase,
} from "@/lib/routine/stretching";
import { cues } from "@/lib/routine/cues";
import { STRETCH_TRACKS, trackUrl } from "@/lib/routine/music";
import { readCache, writeCache } from "@/lib/local/store";
import { sendOrQueue } from "@/lib/local/outbox";
import { checklistToday } from "@/lib/checklist/day";
import type { ChecklistData } from "@/lib/checklist/types";

type Status = "idle" | "running" | "paused" | "done";

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/** Mark the "Mobility" routine item done for today · local copy first, server after. */
async function completeStretchItem() {
  const today = checklistToday();
  const cached = readCache<ChecklistData>("checklist");
  const item = cached?.data.items.find((i) => i.routineKey === "stretch");
  if (!item || item.completedToday) return;
  writeCache("checklist", {
    ...cached!.data,
    items: cached!.data.items.map((i) => i.id === item.id ? { ...i, completedToday: true } : i),
  });
  try {
    await sendOrQueue({
      url: "/api/checklist/toggle",
      method: "POST",
      body: { itemId: item.id, completed: true, date: today },
      dedupeKey: `toggle:${item.id}:${today}`,
    });
  } catch { /* server refused · the next refresh will show the truth */ }
}

/** The block's hue for the ambient glow · standing warm, floor cooler, lying deep, finish calm. */
const BLOCK_GLOW = ["#F0A35B", "#8B7CF0", "#5B8DEF", "#6FD49A"];

export default function StretchPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  // Three sessions in sequence day to day (2026-09-14, third one 2026-09-30) · today's is
  // preselected; Ali can pick another on the morning (Ali 2026-09-29), the pick lasts the day.
  const today = checklistToday();
  const autoSession = sessionForDate(today);
  const [session, setSessionState] = useState<SessionKey>(autoSession);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the day's pick after mount
    const pick = readSessionPick(today); if (pick) setSessionState(pick);
  }, [today]);
  const pickSession = (k: SessionKey) => { setSessionState(k); writeSessionPick(today, k === autoSession ? null : k); };
  const SESSION = STRETCH_SESSIONS[session];
  const MOVES = SESSION.moves;
  const PLAN = useMemo(() => buildStretchPlan(MOVES), [MOVES]);
  const TOTAL = sessionSeconds(MOVES);
  const [step, setStep] = useState(0);                 // index into PLAN
  const [remainingMs, setRemainingMs] = useState(STRETCH_LEADIN_SECONDS * 1000);

  // ── Music · random, never the same track twice in one session ──
  const music = useRef<HTMLAudioElement | null>(null);
  const played = useRef<string[]>([]);
  const [nowPlaying, setNowPlaying] = useState<string | null>(null);
  const nextTrack = useCallback((): string | null => {
    const pool = STRETCH_TRACKS.map((t) => t.slug).filter((s) => !played.current.includes(s));
    const from = pool.length ? pool : STRETCH_TRACKS.map((t) => t.slug).filter((s) => s !== played.current.at(-1));
    if (!from.length) return null;
    const slug = from[Math.floor(Math.random() * from.length)];
    played.current.push(slug);
    return slug;
  }, []);
  const playNext = useCallback(() => {
    const slug = nextTrack();
    if (!slug) return;
    if (!music.current) {
      music.current = new Audio();
      music.current.addEventListener("ended", () => playNext());
    }
    const el = music.current;
    el.src = trackUrl(slug);
    el.loop = false;
    el.volume = 0.35;
    el.play().catch(() => { /* autoplay refused · beeps still work */ });
    setNowPlaying(slug);
  }, [nextTrack]);
  const stopMusic = useCallback(() => {
    music.current?.pause();
    if (music.current) music.current.currentTime = 0;
    setNowPlaying(null);
  }, []);
  // Music follows the session: starts with Start, pauses with Pause, stops at the end.
  useEffect(() => {
    if (status === "running") { if (music.current?.src && music.current.paused && nowPlaying) music.current.play().catch(() => {}); else if (!nowPlaying) playNext(); }
    else if (status === "paused") music.current?.pause();
    else { stopMusic(); played.current = []; }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nowPlaying is read, not a trigger
  }, [status, playNext, stopMusic]);
  useEffect(() => () => { stopMusic(); cues.silence(); }, [stopMusic]);  // leaving the page stops everything

  // Movement names are editable · renames live on the phone BY MOVE KEY (cc-stretch-names-v3).
  const MOVE_NAMES = MOVES.map((m) => m.name);
  const [renames, setRenames] = useState<Record<string, string>>({});
  const moves = MOVES.map((m) => renames[m.key]?.trim() || m.name);
  const movesRef = useRef<string[]>(MOVE_NAMES);
  movesRef.current = moves;
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  useEffect(() => {
    try {
      const v3 = JSON.parse(localStorage.getItem("cc-stretch-names-v3") ?? "null");
      if (v3 && typeof v3 === "object" && !Array.isArray(v3)) { setRenames(v3 as Record<string, string>); return; }
      const v2 = JSON.parse(localStorage.getItem("cc-stretch-names-v2") ?? "null");
      if (Array.isArray(v2)) {
        const migrated: Record<string, string> = {};
        v2.forEach((n, i) => {
          const m = STRETCH_MOVES[i];
          if (m && typeof n === "string" && n.trim() && !isDefaultName(n)) migrated[m.key] = n.trim();
        });
        setRenames(migrated);
        localStorage.setItem("cc-stretch-names-v3", JSON.stringify(migrated));
        localStorage.removeItem("cc-stretch-names-v2");
      }
    } catch { /* ignore */ }
  }, []);
  const renameMove = (i: number, name: string) => {
    const key = MOVES[i].key;
    const next = { ...renames };
    if (name.trim() && name.trim() !== MOVE_NAMES[i]) next[key] = name.trim(); else delete next[key];
    setRenames(next);
    try { localStorage.setItem("cc-stretch-names-v3", JSON.stringify(next)); } catch { /* ignore */ }
  };

  const phaseEndsAt = useRef<number>(0);               // absolute ms
  const pausedRemaining = useRef<number>(0);
  const lastTickSecond = useRef<number>(-1);
  const wakeLock = useRef<WakeLockSentinel | null>(null);

  const phase: StretchPhase = PLAN[step];
  const moveName = phase.kind === "leadin" ? moves[0] : moves[phase.index];
  const nextName = useMemo(() => {
    if (phase.kind === "leadin") return moves[1] ?? null;
    if (phase.kind === "work") return moves[phase.index + 1] ?? null;
    if (phase.kind === "rest") return moves[phase.index + 1] ?? null;
    return null;
  }, [phase, moves]);

  // elapsed seconds across the whole routine (for the top progress bar)
  const elapsedBefore = useMemo(() => PLAN.slice(0, step).reduce((s, p) => s + p.seconds, 0), [step, PLAN]);
  const elapsed = Math.min(TOTAL, elapsedBefore + (phase.seconds - Math.ceil(remainingMs / 1000)));

  // ── Wake lock ──────────────────────────────────────────────────────────────
  const requestWakeLock = useCallback(async () => {
    try {
      if (!("wakeLock" in navigator)) return;
      wakeLock.current = await navigator.wakeLock.request("screen");
    } catch { /* not allowed right now · try again on next visibility change */ }
  }, []);
  useEffect(() => {
    if (status !== "running") {
      wakeLock.current?.release().catch(() => {});
      wakeLock.current = null;
      return;
    }
    requestWakeLock();
    const onVis = () => { if (document.visibilityState === "visible") requestWakeLock(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [status, requestWakeLock]);

  // ── Phase transitions ─────────────────────────────────────────────────────
  const enterStep = useCallback((next: number, announce = true) => {
    const p = PLAN[next];
    setStep(next);
    lastTickSecond.current = -1;
    if (p.kind === "done") {
      setRemainingMs(0);
      setStatus("done");
      if (announce) cues.done();
      completeStretchItem();
      return;
    }
    phaseEndsAt.current = Date.now() + p.seconds * 1000;
    setRemainingMs(p.seconds * 1000);
    if (!announce) return;
    if (p.kind === "work") cues.work();
    else if (p.kind === "rest") cues.rest();
  }, [PLAN]);

  // ── Ticker ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (status !== "running") return;
    const id = setInterval(() => {
      const now = Date.now();
      let rem = phaseEndsAt.current - now;
      if (rem <= 0) {
        // Advance · possibly several phases if the phone slept.
        let s = step;
        let overshoot = -rem;
        while (true) {
          s += 1;
          const p = PLAN[s];
          if (p.kind === "done") { enterStep(s); return; }
          if (overshoot < p.seconds * 1000) {
            phaseEndsAt.current = now + p.seconds * 1000 - overshoot;
            setStep(s);
            lastTickSecond.current = -1;
            if (p.kind === "work") cues.work();
            else cues.rest();
            rem = phaseEndsAt.current - now;
            break;
          }
          overshoot -= p.seconds * 1000;
        }
      }
      setRemainingMs(rem);
      const sec = Math.ceil(rem / 1000);
      if (sec <= 3 && sec >= 1 && sec !== lastTickSecond.current) {
        lastTickSecond.current = sec;
        cues.tick();
      }
    }, 100);
    return () => clearInterval(id);
  }, [status, step, enterStep, PLAN]);

  // ── Controls ──────────────────────────────────────────────────────────────
  const start = () => {
    cues.arm();
    setStatus("running");
    enterStep(0, false);
  };
  const pause = () => {
    pausedRemaining.current = Math.max(0, phaseEndsAt.current - Date.now());
    setStatus("paused");
  };
  const resume = () => {
    cues.arm();
    phaseEndsAt.current = Date.now() + pausedRemaining.current;
    setStatus("running");
  };
  const skip = () => {
    let s = step + 1;
    while (PLAN[s].kind === "rest") s += 1;
    if (status === "paused") { setStatus("running"); }
    enterStep(s);
  };
  const back = () => {
    let s = step;
    if (PLAN[s].kind === "rest") s -= 1;
    const intoPhase = PLAN[step].seconds * 1000 - remainingMs;
    if (intoPhase < 2000 || PLAN[step].kind === "rest") {
      let prev = s - 1;
      while (prev > 0 && PLAN[prev].kind !== "work") prev -= 1;
      s = Math.max(0, prev);
    }
    if (status === "paused") setStatus("running");
    enterStep(s);
  };
  const exit = () => {
    cues.silence();
    setStatus("idle");
    setStep(0);
    setRemainingMs(STRETCH_LEADIN_SECONDS * 1000);
    router.push("/today");
  };

  const seconds = Math.ceil(remainingMs / 1000);
  const isRest = phase.kind === "rest";
  const isLead = phase.kind === "leadin";
  const accent = isRest ? "var(--cyan)" : isLead ? "var(--warn)" : "var(--violet)";
  const moveIdx = phase.kind === "done" ? MOVES.length - 1 : phase.kind === "leadin" ? 0 : phase.index;
  const moveNumber = phase.kind === "done" ? MOVES.length : phase.kind === "leadin" ? 1 : phase.index + 1;
  const blockIdx = MOVES[Math.min(moveIdx, MOVES.length - 1)].block;
  const glow = BLOCK_GLOW[blockIdx] ?? BLOCK_GLOW[1];
  const nowTitle = nowPlaying ? STRETCH_TRACKS.find((t) => t.slug === nowPlaying)?.title : null;

  // ── Idle screen ───────────────────────────────────────────────────────────
  if (status === "idle") {
    return (
      <div style={{ display: "grid", gap: 18, maxWidth: 560 }}>
        <div className="cc-pagetitle" style={{ marginBottom: 0 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 600 }}>Mobility</h1>
            <div className="sub">{session === autoSession ? "Today" : "Picked"}: {SESSION.focus} · {MOVES.length} moves · {fmt(TOTAL)}</div>
          </div>
        </div>

        {/* Which session · today's in the sequence is preselected, any other is a pick for today only */}
        <div role="tablist" aria-label="Session" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, padding: 4, borderRadius: 14, background: "var(--fill-1)" }}>
          {SESSION_KEYS.map((k) => {
            const on = k === session;
            return (
              <button key={k} role="tab" aria-selected={on} onClick={() => pickSession(k)}
                style={{ minHeight: 48, borderRadius: 10, border: "none", cursor: "pointer", font: "inherit", fontSize: 14.5, fontWeight: on ? 600 : 500, color: on ? "var(--ink)" : "var(--ink-3)", background: on ? "var(--bg-card)" : "transparent", display: "grid", gap: 1, alignContent: "center", WebkitTapHighlightColor: "transparent" }}>
                <span>{STRETCH_SESSIONS[k].short}</span>
                <span style={{ fontSize: 12, color: k === autoSession ? "var(--violet)" : "var(--ink-4)", fontFamily: "var(--f-mono)" }}>{k === autoSession ? "today" : `session ${k}`}</span>
              </button>
            );
          })}
        </div>
        {SESSION.reel && (
          <a href={SESSION.reel.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: 44, padding: "0 14px", borderRadius: 12, border: "1px solid var(--line-hi)", background: "var(--fill-1)", color: "var(--violet)", textDecoration: "none", fontSize: 15 }}>
            <span>{SESSION.reel.label} · Instagram</span><span aria-hidden>↗</span>
          </a>
        )}

        <button className="cc-btn cc-btn-primary" onClick={start} style={{ minHeight: 64, fontSize: 19, borderRadius: 14, width: "100%" }}>
          ▶ Start
        </button>
        <div style={{ fontSize: 14, color: "var(--ink-3)", display: "flex", justifyContent: "space-between", padding: "0 2px" }}>
          <span>Music · a random epic track, another when it ends</span>
          <span style={{ fontFamily: "var(--f-mono)" }}>{STRETCH_TRACKS.length} tracks</span>
        </div>

        <section className="cc-card">
          <div className="cc-card-head"><span className="title">Order</span><span className="tail">tap a name to rename</span></div>
          <ol style={{ padding: "4px 16px 8px", margin: 0, listStyle: "none" }}>
            {moves.map((m, i) => (
              <li key={i}>
              {(i === 0 || MOVES[i].block !== MOVES[i - 1].block) && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0 2px" }}>
                  <span style={{ fontSize: 12.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-4)", fontFamily: "var(--f-mono)" }}>{STRETCH_BLOCKS[MOVES[i].block]}</span>
                  <span aria-hidden style={{ flex: 1, height: 1, background: "var(--line)" }} />
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "28px 1fr auto", gap: 8, minHeight: 40, alignItems: "center", fontSize: 16, borderBottom: i < moves.length - 1 ? "1px solid var(--line)" : "none" }}>
                <span style={{ fontFamily: "var(--f-mono)", fontSize: 14, color: "var(--ink-4)" }}>{String(i + 1).padStart(2, "0")}</span>
                {editIdx === i ? (
                  <input
                    className="cc-input"
                    autoFocus
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onBlur={() => { renameMove(i, editText); setEditIdx(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditIdx(null); }}
                    style={{ fontSize: 16, minHeight: 38, width: "100%", boxSizing: "border-box" }}
                  />
                ) : (
                  <button
                    onClick={() => { setEditIdx(i); setEditText(m); }}
                    style={{ background: "transparent", border: "none", textAlign: "left", color: "var(--ink)", font: "inherit", fontSize: 16, padding: "8px 0", cursor: "pointer", minWidth: 0, overflowWrap: "anywhere" }}
                  >
                    {m}
                  </button>
                )}
                <span style={{ fontFamily: "var(--f-mono)", fontSize: 13, color: "var(--ink-4)" }}>{MOVES[i].seconds}s</span>
              </div>
              </li>
            ))}
          </ol>
        </section>

        <Link href="/today" style={{ fontSize: 15, color: "var(--ink-3)", textDecoration: "none" }}>← Back to Today</Link>
      </div>
    );
  }

  // ── Done screen ───────────────────────────────────────────────────────────
  if (status === "done") {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "var(--bg-deep)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center" }}>
        <div className="mob-done-ring" aria-hidden><svg width="120" height="120" viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" fill="none" stroke="var(--pos)" strokeWidth="4" className="mob-done-circle" /><path d="M38 62l15 15 30-32" fill="none" stroke="var(--pos)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" className="mob-done-check" /></svg></div>
        <h1 style={{ fontSize: 28, fontWeight: 600 }}>Mobility done</h1>
        <p style={{ color: "var(--ink-3)", fontSize: 16 }}>{SESSION.focus} · {MOVES.length} moves · {fmt(TOTAL)} · ticked on today&rsquo;s list</p>
        <button className="cc-btn cc-btn-primary" onClick={exit} style={{ minHeight: 56, fontSize: 18, borderRadius: 14, width: "min(320px, 100%)", marginTop: 12 }}>
          Back to Today
        </button>
        <style>{`
          .mob-done-circle { stroke-dasharray: 327; stroke-dashoffset: 327; animation: mob-draw 0.7s var(--easeOut) forwards; }
          .mob-done-check { stroke-dasharray: 70; stroke-dashoffset: 70; animation: mob-draw 0.45s var(--easeOut) 0.5s forwards; }
          @keyframes mob-draw { to { stroke-dashoffset: 0; } }
          @media (prefers-reduced-motion: reduce) { .mob-done-circle, .mob-done-check { animation: none; stroke-dashoffset: 0; } }
        `}</style>
      </div>
    );
  }

  // ── Running / paused (full-screen) ────────────────────────────────────────
  const R = 46;                                   // ring radius in a 100 × 100 box
  const C = 2 * Math.PI * R;
  const frac = phase.seconds > 0 ? Math.max(0, Math.min(1, remainingMs / (phase.seconds * 1000))) : 0;
  const last3 = seconds <= 3 && seconds >= 1 && status === "running";
  const target = MOVE_TARGETS[MOVES[Math.min(moveIdx, MOVES.length - 1)].key];

  return (
    <div className="mob-screen" style={{ position: "fixed", inset: 0, zIndex: 60, background: "var(--bg-deep)", display: "flex", flexDirection: "column", padding: "calc(env(safe-area-inset-top) + 16px) 20px calc(env(safe-area-inset-bottom) + 20px)", overflow: "hidden" }}>
      {/* Ambient glow · the block's colour, breathing slowly behind everything */}
      <div aria-hidden className="mob-glow" style={{ ["--glow" as string]: glow, opacity: status === "paused" ? 0.25 : undefined }} />

      {/* Top: overall progress + exit */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
        <div className="cc-progress-track" style={{ flex: 1, height: 4 }}>
          <div className="cc-progress-fill" style={{ width: `${(elapsed / TOTAL) * 100}%`, transition: "width 0.3s linear" }} />
        </div>
        <span style={{ fontFamily: "var(--f-mono)", fontSize: 14, color: "var(--ink-3)" }}>{fmt(Math.max(0, TOTAL - elapsed))} left</span>
        <button onClick={exit} aria-label="Exit" className="cc-btn cc-btn-ghost" style={{ minWidth: 44, minHeight: 44, padding: 0, borderRadius: 12 }}>✕</button>
      </div>

      {/* The session as a strip of dots · done, now (bigger), next */}
      <div aria-hidden style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 14, position: "relative" }}>
        {MOVES.map((m, i) => {
          const state = i < moveIdx || phase.kind === "done" ? "done" : i === moveIdx ? "now" : "next";
          return <span key={m.key + i} className={`mob-dot mob-dot-${state}`} style={{ background: state === "next" ? "var(--line-strong)" : state === "done" ? "var(--pos)" : isRest ? "var(--cyan)" : "var(--violet)" }} />;
        })}
      </div>

      {/* Middle: ring with the countdown inside, the name under it */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 14, position: "relative", minHeight: 0 }}>
        <div className={`mob-ring${last3 ? " mob-ring-last" : ""}`} style={{ width: "min(68vw, 46vh, 320px)", aspectRatio: "1", position: "relative", display: "grid", placeItems: "center" }}>
          <svg viewBox="0 0 100 100" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", transform: "rotate(-90deg)" }} aria-hidden>
            <circle cx="50" cy="50" r={R} fill="none" stroke="var(--line)" strokeWidth="3" />
            <circle cx="50" cy="50" r={R} fill="none" stroke={accent} strokeWidth="3.5" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - frac)} style={{ transition: status === "running" ? "stroke-dashoffset 0.12s linear, stroke 0.3s" : "stroke 0.3s" }} />
          </svg>
          <div style={{ display: "grid", gap: 2, position: "relative" }}>
            <span className="tabular-nums" style={{ fontSize: "clamp(72px, 22vw, 120px)", fontWeight: 200, lineHeight: 1, letterSpacing: "-0.04em", color: status === "paused" ? "var(--ink-3)" : "var(--ink)" }}>{seconds}</span>
            <span style={{ fontFamily: "var(--f-mono)", fontSize: 12.5, letterSpacing: "0.18em", textTransform: "uppercase", color: accent }}>
              {isLead ? "get ready" : isRest ? "rest" : `${moveNumber} of ${MOVES.length}`}
            </span>
          </div>
        </div>

        <div key={`${phase.kind}-${moveIdx}`} className="mob-name" style={{ display: "grid", gap: 6, maxWidth: 420 }}>
          <div style={{ fontSize: "clamp(24px, 7vw, 34px)", fontWeight: 600, lineHeight: 1.2, letterSpacing: "-0.02em" }}>
            {isRest ? (nextName ?? "") : moveName}
          </div>
          <div style={{ fontSize: 14.5, color: "var(--ink-3)" }}>
            {isRest ? "coming up" : isLead ? `${STRETCH_BLOCKS[blockIdx]} · ${SESSION.focus}` : target ?? STRETCH_BLOCKS[blockIdx]}
          </div>
          {!isRest && nextName && <div style={{ fontSize: 14, color: "var(--ink-4)" }}>Next · {nextName}</div>}
        </div>
        {status === "paused" && <div className="cc-pill cc-pill-warn" style={{ marginTop: 4 }}>Paused</div>}
      </div>

      {nowTitle && <div style={{ textAlign: "center", fontSize: 12.5, color: "var(--ink-4)", marginBottom: 10, position: "relative" }}>♪ {nowTitle}</div>}

      {/* Bottom: controls · thumb zone */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 10, position: "relative" }}>
        <button onClick={back} className="cc-btn cc-btn-ghost" style={{ minHeight: 64, borderRadius: 14, fontSize: 16 }}>‹ Back</button>
        <button onClick={status === "running" ? pause : resume} className="cc-btn cc-btn-primary" style={{ minHeight: 64, borderRadius: 14, fontSize: 19 }}>
          {status === "running" ? "Pause" : "Resume"}
        </button>
        <button onClick={skip} className="cc-btn cc-btn-ghost" style={{ minHeight: 64, borderRadius: 14, fontSize: 16 }}>Skip ›</button>
      </div>

      <style>{`
        .mob-glow { position: absolute; left: 50%; top: 38%; width: 120vw; height: 120vw; max-width: 720px; max-height: 720px; transform: translate(-50%, -50%); border-radius: 50%;
          background: radial-gradient(circle, color-mix(in srgb, var(--glow) 28%, transparent) 0%, color-mix(in srgb, var(--glow) 10%, transparent) 38%, transparent 68%);
          filter: blur(10px); animation: mob-breathe 7s ease-in-out infinite; transition: opacity 0.6s, background 1.2s; pointer-events: none; }
        @keyframes mob-breathe { 0%, 100% { transform: translate(-50%, -50%) scale(0.92); opacity: 0.75; } 50% { transform: translate(-50%, -50%) scale(1.06); opacity: 1; } }
        .mob-dot { width: 7px; height: 7px; border-radius: 99px; transition: transform 0.3s var(--easeOut), background 0.3s; }
        .mob-dot-now { transform: scale(1.7); box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 10%, transparent); }
        .mob-name { animation: mob-slide 0.42s var(--easeOut) both; }
        @keyframes mob-slide { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        .mob-ring-last { animation: mob-pulse 1s ease-out infinite; }
        @keyframes mob-pulse { 0% { transform: scale(1); } 30% { transform: scale(1.03); } 100% { transform: scale(1); } }
        @media (prefers-reduced-motion: reduce) { .mob-glow, .mob-name, .mob-ring-last { animation: none; } .mob-dot { transition: none; } }
      `}</style>
    </div>
  );
}
