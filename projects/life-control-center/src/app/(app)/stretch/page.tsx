"use client";

/**
 * /stretch — guided morning stretching timer.
 *
 * 16 movements · 30 s work · 10 s rest · 5 s lead-in. Full-screen while running.
 * Time is computed from timestamps (not tick counts) so it stays correct if the
 * phone sleeps briefly or the app is backgrounded. Screen stays awake (Wake Lock),
 * every change beeps + vibrates, the movement name is spoken so it works from a pocket.
 * Finishing ticks "Stretching" on today's checklist (offline-safe).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  STRETCH_MOVES, STRETCH_TOTAL_SECONDS, buildStretchPlan, type StretchPhase,
} from "@/lib/routine/stretching";
import { cues } from "@/lib/routine/cues";
import { readCache, writeCache } from "@/lib/local/store";
import { sendOrQueue } from "@/lib/local/outbox";
import { checklistToday } from "@/lib/checklist/day";
import type { ChecklistData } from "@/lib/checklist/types";

type Status = "idle" | "running" | "paused" | "done";

const PLAN = buildStretchPlan();

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/** Mark the "Stretching" routine item done for today — local copy first, server after. */
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
  } catch { /* server refused — the next refresh will show the truth */ }
}

export default function StretchPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [step, setStep] = useState(0);                 // index into PLAN
  const [remainingMs, setRemainingMs] = useState(PLAN[0].seconds * 1000);
  const [voice, setVoice] = useState(true);
  const phaseEndsAt = useRef<number>(0);               // absolute ms
  const pausedRemaining = useRef<number>(0);
  const lastTickSecond = useRef<number>(-1);
  const wakeLock = useRef<WakeLockSentinel | null>(null);

  const phase: StretchPhase = PLAN[step];
  const moveName = phase.kind === "leadin" ? STRETCH_MOVES[0] : STRETCH_MOVES[phase.index];
  const nextName = useMemo(() => {
    if (phase.kind === "leadin") return STRETCH_MOVES[1] ?? null;
    if (phase.kind === "work") return STRETCH_MOVES[phase.index + 1] ?? null;
    if (phase.kind === "rest") return STRETCH_MOVES[phase.index + 1] ?? null;
    return null;
  }, [phase]);

  // elapsed seconds across the whole routine (for the top progress bar)
  const elapsedBefore = useMemo(() => PLAN.slice(0, step).reduce((s, p) => s + p.seconds, 0), [step]);
  const elapsed = Math.min(STRETCH_TOTAL_SECONDS, elapsedBefore + (phase.seconds - Math.ceil(remainingMs / 1000)));

  // ── Wake lock ──────────────────────────────────────────────────────────────
  const requestWakeLock = useCallback(async () => {
    try {
      if (!("wakeLock" in navigator)) return;
      wakeLock.current = await navigator.wakeLock.request("screen");
    } catch { /* not allowed right now — try again on next visibility change */ }
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
    if (p.kind === "work") cues.work(STRETCH_MOVES[p.index]);
    else if (p.kind === "rest") cues.rest(STRETCH_MOVES[p.index + 1]);
  }, []);

  // ── Ticker ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (status !== "running") return;
    const id = setInterval(() => {
      const now = Date.now();
      let rem = phaseEndsAt.current - now;
      if (rem <= 0) {
        // Advance — possibly several phases if the phone slept.
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
            if (p.kind === "work") cues.work(STRETCH_MOVES[p.index]);
            else cues.rest(STRETCH_MOVES[p.index + 1]);
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
    }, 200);
    return () => clearInterval(id);
  }, [status, step, enterStep]);

  // ── Controls ──────────────────────────────────────────────────────────────
  const start = () => {
    cues.arm();
    cues.setVoice(voice);
    setStatus("running");
    enterStep(0, false);
    cues.say(`Get ready. First: ${STRETCH_MOVES[0]}`);
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
    // jump to the next *work* phase (or done)
    let s = step + 1;
    while (PLAN[s].kind === "rest") s += 1;
    if (status === "paused") { setStatus("running"); }
    enterStep(s);
  };
  const back = () => {
    // jump to the start of the current move (or the previous move if within 2s)
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
    setStatus("idle");
    setStep(0);
    setRemainingMs(PLAN[0].seconds * 1000);
    router.push("/today");
  };

  const seconds = Math.ceil(remainingMs / 1000);
  const isRest = phase.kind === "rest";
  const isLead = phase.kind === "leadin";
  const accent = isRest ? "var(--cyan)" : isLead ? "var(--warn)" : "var(--violet)";
  const moveNumber = phase.kind === "done" ? STRETCH_MOVES.length : phase.kind === "leadin" ? 1 : phase.index + 1;

  // ── Idle screen ───────────────────────────────────────────────────────────
  if (status === "idle") {
    return (
      <div style={{ display: "grid", gap: 18, maxWidth: 560 }}>
        <div className="cc-pagetitle" style={{ marginBottom: 0 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 600 }}>Stretching</h1>
            <div className="sub">{STRETCH_MOVES.length} moves · 30 s on, 10 s off · {fmt(STRETCH_TOTAL_SECONDS)}</div>
          </div>
        </div>

        <button
          className="cc-btn cc-btn-primary"
          onClick={start}
          style={{ minHeight: 64, fontSize: 18, borderRadius: 16, width: "100%" }}
        >
          ▶ Start
        </button>

        <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 44, fontSize: 14, color: "var(--ink-2)" }}>
          <span>Speak each movement name</span>
          <input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} style={{ width: 22, height: 22, accentColor: "var(--violet)" }} />
        </label>

        <section className="cc-card">
          <div className="cc-card-head"><span className="title">Order</span><span className="tail">screen stays on</span></div>
          <ol style={{ padding: "4px 16px 8px", margin: 0, listStyle: "none" }}>
            {STRETCH_MOVES.map((m, i) => (
              <li key={m} style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: 8, minHeight: 40, alignItems: "center", fontSize: 15, borderBottom: i < STRETCH_MOVES.length - 1 ? "1px solid var(--line)" : "none" }}>
                <span style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--ink-4)" }}>{String(i + 1).padStart(2, "0")}</span>
                <span>{m}</span>
              </li>
            ))}
          </ol>
        </section>

        <Link href="/today" style={{ fontSize: 14, color: "var(--ink-3)", textDecoration: "none" }}>← Back to Today</Link>
      </div>
    );
  }

  // ── Done screen ───────────────────────────────────────────────────────────
  if (status === "done") {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "var(--bg-deep)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 64 }}>✓</div>
        <h1 style={{ fontSize: 28, fontWeight: 600 }}>Stretching done</h1>
        <p style={{ color: "var(--ink-3)", fontSize: 15 }}>{STRETCH_MOVES.length} moves · {fmt(STRETCH_TOTAL_SECONDS)} · ticked on today&rsquo;s list</p>
        <button className="cc-btn cc-btn-primary" onClick={exit} style={{ minHeight: 56, fontSize: 17, borderRadius: 14, width: "min(320px, 100%)", marginTop: 12 }}>
          Back to Today
        </button>
      </div>
    );
  }

  // ── Running / paused (full-screen) ────────────────────────────────────────
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 60, background: "var(--bg-deep)",
        display: "flex", flexDirection: "column",
        padding: "calc(env(safe-area-inset-top) + 16px) 20px calc(env(safe-area-inset-bottom) + 20px)",
      }}
    >
      {/* Top: overall progress + exit */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div className="cc-progress-track" style={{ flex: 1, height: 4 }}>
          <div className="cc-progress-fill" style={{ width: `${(elapsed / STRETCH_TOTAL_SECONDS) * 100}%`, transition: "width 0.3s linear" }} />
        </div>
        <span style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--ink-3)" }}>{fmt(Math.max(0, STRETCH_TOTAL_SECONDS - elapsed))} left</span>
        <button onClick={exit} aria-label="Exit" className="cc-btn cc-btn-ghost" style={{ minWidth: 44, minHeight: 44, padding: 0, borderRadius: 12 }}>✕</button>
      </div>

      {/* Middle: phase, name, countdown */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 8 }}>
        <div style={{ fontFamily: "var(--f-mono)", fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: accent }}>
          {isLead ? "Get ready" : isRest ? "Rest" : `Move ${moveNumber} of ${STRETCH_MOVES.length}`}
        </div>
        <div style={{ fontSize: "clamp(24px, 7vw, 34px)", fontWeight: 600, lineHeight: 1.2, letterSpacing: "-0.02em", minHeight: "2.4em", display: "flex", alignItems: "center" }}>
          {isRest ? (nextName ?? "") : moveName}
        </div>
        <div
          className="tabular-nums"
          style={{ fontSize: "clamp(96px, 32vw, 160px)", fontWeight: 200, lineHeight: 1, letterSpacing: "-0.04em", color: status === "paused" ? "var(--ink-3)" : "var(--ink)", fontVariantNumeric: "tabular-nums" }}
        >
          {seconds}
        </div>
        {!isRest && nextName && (
          <div style={{ fontSize: 14, color: "var(--ink-3)" }}>Next: {nextName}</div>
        )}
        {isRest && <div style={{ fontSize: 14, color: "var(--ink-3)" }}>coming up</div>}
        {status === "paused" && <div className="cc-pill cc-pill-warn" style={{ marginTop: 8 }}>Paused</div>}
      </div>

      {/* Bottom: controls — thumb zone */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 10 }}>
        <button onClick={back} className="cc-btn cc-btn-ghost" style={{ minHeight: 64, borderRadius: 16, fontSize: 15 }}>‹ Back</button>
        <button
          onClick={status === "running" ? pause : resume}
          className="cc-btn cc-btn-primary"
          style={{ minHeight: 64, borderRadius: 16, fontSize: 18 }}
        >
          {status === "running" ? "Pause" : "Resume"}
        </button>
        <button onClick={skip} className="cc-btn cc-btn-ghost" style={{ minHeight: 64, borderRadius: 16, fontSize: 15 }}>Skip ›</button>
      </div>
    </div>
  );
}
