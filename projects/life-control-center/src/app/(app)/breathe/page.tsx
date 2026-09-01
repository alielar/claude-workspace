"use client";

/**
 * /breathe — Wim Hof breathing player (built 2026-09-02, replaces the YouTube video).
 *
 * Protocol (verified against the official method):
 *   3 rounds of: 30 deep breaths (~1.7 s in, ~2 s out, exhale relaxed)
 *   → retention hold on EMPTY lungs, 1:30 countdown — TAP ANYWHERE to end early
 *   → deep breath in, 15 s recovery hold → next round.
 * Finishing ticks the "Wim Hof breathing" routine item (offline-safe).
 *
 * All sound is synthesized (Web Audio, no assets, no voice — gamified):
 *   inhale = rising sweep · exhale = falling sweep · hold/release = woody pluck.
 * During retention a chosen "healing frequency" plays (pure detuned-sine pad,
 * generated live — no files). Frequencies are wellness lore, labelled as such;
 * they play ONLY during retention so the breathing itself stays clean.
 * Safety: sit or lie down. Never in water, never driving. Tingling is normal.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { readCache, writeCache } from "@/lib/local/store";
import { sendOrQueue } from "@/lib/local/outbox";
import { checklistToday } from "@/lib/checklist/day";
import type { ChecklistData } from "@/lib/checklist/types";

const ROUNDS = 3;
const BREATHS = 30;
const INHALE_MS = 1700;
const EXHALE_MS = 2000;
const RETENTION_S = 90;          // 1:30 default — tap anywhere ends it early
const RECOVERY_IN_MS = 3500;     // "breathe in fully" lead-in
const RECOVERY_HOLD_S = 15;

const FREQS: { hz: number; label: string }[] = [
  { hz: 174, label: "grounding" },
  { hz: 285, label: "restoring" },
  { hz: 396, label: "release" },
  { hz: 417, label: "reset" },
  { hz: 432, label: "natural calm" },
  { hz: 528, label: "the classic" },
  { hz: 639, label: "connection" },
  { hz: 741, label: "clarity" },
  { hz: 852, label: "intuition" },
  { hz: 963, label: "stillness" },
];

type Phase = "idle" | "breathing" | "retention" | "recoveryIn" | "recoveryHold" | "done";

/** Tiny synth — sweeps for breaths, plucks for events, a soft pad for retention. */
class BreathSynth {
  private ctx: AudioContext | null = null;
  private pad: { osc: OscillatorNode[]; gain: GainNode } | null = null;

  arm() {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      if (!this.ctx) this.ctx = new Ctx();
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    } catch { /* silent */ }
  }

  /** Pitch sweep — up for inhale, down for exhale. */
  sweep(from: number, to: number, ms: number, volume = 0.14) {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + ms / 1000);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.12);
    gain.gain.setValueAtTime(volume, t + ms / 1000 - 0.25);
    gain.gain.linearRampToValueAtTime(0, t + ms / 1000);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t); osc.stop(t + ms / 1000 + 0.05);
  }

  /** Woody marimba-ish pluck for phase markers. */
  pluck(freq: number, volume = 0.25) {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime;
    for (const [f, v] of [[freq, volume], [freq * 4, volume * 0.15]] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(v, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.4);
    }
  }

  /** Healing-frequency pad: two slightly detuned sines → slow natural shimmer. */
  padStart(hz: number) {
    const ctx = this.ctx; if (!ctx || this.pad) return;
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.11, t + 2.5);   // long fade-in, no click
    gain.connect(ctx.destination);
    const osc = [hz, hz + 1.2].map((f) => {
      const o = ctx.createOscillator();
      o.type = "sine"; o.frequency.value = f;
      o.connect(gain); o.start(t);
      return o;
    });
    this.pad = { osc, gain };
  }

  padStop() {
    const ctx = this.ctx, pad = this.pad;
    if (!ctx || !pad) return;
    const t = ctx.currentTime;
    pad.gain.gain.cancelScheduledValues(t);
    pad.gain.gain.setValueAtTime(pad.gain.gain.value, t);
    pad.gain.gain.linearRampToValueAtTime(0, t + 1.2);
    for (const o of pad.osc) o.stop(t + 1.4);
    this.pad = null;
  }
}

const synth = new BreathSynth();

async function completeBreatheItem() {
  const today = checklistToday();
  const cached = readCache<ChecklistData>("checklist");
  const item = cached?.data.items.find((i) => i.routineKey === "breathe");
  if (!item || item.completedToday) return;
  writeCache("checklist", {
    ...cached!.data,
    items: cached!.data.items.map((i) => i.id === item.id ? { ...i, completedToday: true } : i),
  });
  try {
    await sendOrQueue({
      url: "/api/checklist/toggle", method: "POST",
      body: { itemId: item.id, completed: true, date: today },
      dedupeKey: `toggle:${item.id}:${today}`,
    });
  } catch { /* replayed later */ }
}

export default function BreathePage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [round, setRound] = useState(1);
  const [breath, setBreath] = useState(1);
  const [inhaling, setInhaling] = useState(true);
  const [remaining, setRemaining] = useState(RETENTION_S);
  const [holds, setHolds] = useState<number[]>([]);       // seconds held per round
  const [freq, setFreq] = useState<number>(528);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdown = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStart = useRef(0);
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;

  useEffect(() => { try { const f = Number(localStorage.getItem("cc-breathe-freq")); if (FREQS.some((x) => x.hz === f)) setFreq(f); } catch { /* ignore */ } }, []);
  const pickFreq = (hz: number) => { setFreq(hz); try { localStorage.setItem("cc-breathe-freq", String(hz)); } catch { /* ignore */ } };

  const clearTimers = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (countdown.current) clearInterval(countdown.current);
    timer.current = null; countdown.current = null;
  }, []);

  // ── Wake lock while a session runs ──────────────────────────────────────────
  useEffect(() => {
    const running = phase !== "idle" && phase !== "done";
    if (!running) { wakeLock.current?.release().catch(() => {}); wakeLock.current = null; return; }
    const req = async () => { try { if ("wakeLock" in navigator) wakeLock.current = await navigator.wakeLock.request("screen"); } catch { /* ok */ } };
    req();
    const onVis = () => { if (document.visibilityState === "visible") req(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [phase]);

  // ── Breathing: 30 paced breaths, sweep up / sweep down ─────────────────────
  const runBreath = useCallback((n: number, r: number) => {
    setPhase("breathing"); setRound(r); setBreath(n); setInhaling(true);
    synth.sweep(220, 470, INHALE_MS);
    timer.current = setTimeout(() => {
      setInhaling(false);
      // last exhale of the round stays relaxed and unforced — softer sweep
      synth.sweep(470, n === BREATHS ? 180 : 220, EXHALE_MS, n === BREATHS ? 0.1 : 0.14);
      timer.current = setTimeout(() => {
        if (n < BREATHS) runBreath(n + 1, r);
        else startRetention(r);
      }, EXHALE_MS);
    }, INHALE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Retention: countdown from 1:30, tap anywhere ends it ───────────────────
  const startRetention = useCallback((r: number) => {
    setPhase("retention"); setRemaining(RETENTION_S);
    holdStart.current = Date.now();
    synth.pluck(392);                       // "hold now"
    synth.padStart(freq);
    countdown.current = setInterval(() => {
      const left = RETENTION_S - Math.floor((Date.now() - holdStart.current) / 1000);
      setRemaining(Math.max(0, left));
      if (left <= 0) endRetention(r);
    }, 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freq]);

  const endRetention = useCallback((r: number) => {
    if (phaseRef.current !== "retention") return;
    clearTimers();
    synth.padStop();
    setHolds((h) => [...h, Math.min(RETENTION_S, Math.round((Date.now() - holdStart.current) / 1000))]);
    // Recovery: one deep breath in…
    setPhase("recoveryIn");
    synth.sweep(220, 560, RECOVERY_IN_MS - 500, 0.18);
    timer.current = setTimeout(() => {
      // …hold 15 s
      setPhase("recoveryHold"); setRemaining(RECOVERY_HOLD_S);
      synth.pluck(523);
      const t0 = Date.now();
      countdown.current = setInterval(() => {
        const left = RECOVERY_HOLD_S - Math.floor((Date.now() - t0) / 1000);
        setRemaining(Math.max(0, left));
        if (left <= 0) {
          clearTimers();
          synth.pluck(659);                 // release
          if (r < ROUNDS) {
            timer.current = setTimeout(() => runBreath(1, r + 1), 2200);
          } else {
            setPhase("done");
            synth.pluck(784); synth.pluck(988);
            completeBreatheItem();
          }
        }
      }, 250);
    }, RECOVERY_IN_MS);
  }, [clearTimers, runBreath]);

  const start = () => { synth.arm(); setHolds([]); runBreath(1, 1); };
  const exit = () => { clearTimers(); synth.padStop(); setPhase("idle"); router.push("/today"); };
  useEffect(() => () => { clearTimers(); synth.padStop(); }, [clearTimers]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  // ── Idle ────────────────────────────────────────────────────────────────────
  if (phase === "idle") {
    return (
      <div style={{ display: "grid", gap: 18, maxWidth: 560, margin: "0 auto", width: "100%" }}>
        <div className="cc-pagetitle" style={{ marginBottom: 0 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 600 }}>Breathing</h1>
            <div className="sub">{ROUNDS} rounds · {BREATHS} breaths · hold up to {fmt(RETENTION_S)} · ~12 min</div>
          </div>
        </div>

        <button className="cc-btn cc-btn-primary" onClick={start} style={{ minHeight: 64, fontSize: 19, borderRadius: 16, width: "100%" }}>
          ▶ Start
        </button>

        <section className="cc-card">
          <div className="cc-card-head"><span className="title">Hold frequency</span><span className="tail">{freq} Hz</span></div>
          <div className="cc-card-body">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {FREQS.map((f) => (
                <button key={f.hz} onClick={() => pickFreq(f.hz)} aria-pressed={freq === f.hz}
                  style={{ minHeight: 44, padding: "0 12px", borderRadius: 10, fontSize: 15, font: "inherit", cursor: "pointer",
                    border: `1px solid ${freq === f.hz ? "var(--violet)" : "var(--line-hi)"}`,
                    background: freq === f.hz ? "var(--accent-soft)" : "var(--fill-1)", color: "var(--ink)" }}>
                  {f.hz} <span style={{ color: "var(--ink-3)", fontSize: 13 }}>· {f.label}</span>
                </button>
              ))}
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-4)", paddingTop: 10 }}>
              A pure tone plays only during the hold. The labels are wellness lore, not medicine — pick what feels calm.
            </div>
          </div>
        </section>

        <section className="cc-card">
          <div className="cc-card-head"><span className="title">How it goes</span></div>
          <div className="cc-card-body" style={{ fontSize: 15, color: "var(--ink-2)", lineHeight: 1.6, display: "grid", gap: 6 }}>
            <div>1 · {BREATHS} deep breaths — rising sound in, falling sound out. Let the exhale go, don&rsquo;t push it.</div>
            <div>2 · After the last exhale: hold. The tone plays. <b>Tap anywhere when you need to breathe</b> — no need to look.</div>
            <div>3 · Big breath in, hold 15 s, release. {ROUNDS} rounds, then done.</div>
            <div style={{ color: "var(--warn)", fontSize: 14 }}>Sit or lie down. Never in water, never driving.</div>
          </div>
        </section>

        <Link href="/today" style={{ fontSize: 15, color: "var(--ink-3)", textDecoration: "none" }}>← Back to Today</Link>
      </div>
    );
  }

  // ── Done ────────────────────────────────────────────────────────────────────
  if (phase === "done") {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "var(--bg-deep)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 64 }}>✓</div>
        <h1 style={{ fontSize: 28, fontWeight: 600 }}>Breathing done</h1>
        <p style={{ color: "var(--ink-3)", fontSize: 16 }}>
          {ROUNDS} rounds · holds: {holds.map(fmt).join(" · ")} · ticked on today&rsquo;s list
        </p>
        <button className="cc-btn cc-btn-primary" onClick={exit} style={{ minHeight: 56, fontSize: 18, borderRadius: 14, width: "min(320px, 100%)", marginTop: 12 }}>
          Back to Today
        </button>
      </div>
    );
  }

  // ── Running (full-screen) ───────────────────────────────────────────────────
  const isRetention = phase === "retention";
  const label =
    phase === "breathing" ? (inhaling ? "Breathe in" : "Let go") :
    isRetention ? "Hold — empty lungs" :
    phase === "recoveryIn" ? "Big breath in" : "Hold it in";
  const accent = isRetention ? "var(--violet)" : phase === "recoveryHold" || phase === "recoveryIn" ? "var(--warn)" : "var(--cyan)";

  return (
    <div
      onClick={isRetention ? () => endRetention(round) : undefined}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "var(--bg-deep)", display: "flex", flexDirection: "column",
        padding: "calc(env(safe-area-inset-top) + 16px) 20px calc(env(safe-area-inset-bottom) + 20px)",
        cursor: isRetention ? "pointer" : "default", WebkitTapHighlightColor: "transparent" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontFamily: "var(--f-mono)", fontSize: 14, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-3)" }}>
          Round {round} of {ROUNDS}
        </span>
        <span style={{ flex: 1 }} />
        <button onClick={(e) => { e.stopPropagation(); exit(); }} aria-label="Exit" className="cc-btn cc-btn-ghost" style={{ minWidth: 44, minHeight: 44, padding: 0, borderRadius: 12 }}>✕</button>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 18 }}>
        {/* breathing circle — grows on the inhale, relaxes on the exhale */}
        <div aria-hidden style={{
          width: 190, height: 190, borderRadius: "50%",
          border: `3px solid ${accent}`,
          background: "color-mix(in srgb, var(--bg-card) 70%, transparent)",
          transform: phase === "breathing" ? (inhaling ? "scale(1.22)" : "scale(0.86)") :
                     phase === "recoveryIn" ? "scale(1.25)" : isRetention ? "scale(0.82)" : "scale(1.1)",
          transition: phase === "breathing"
            ? `transform ${(inhaling ? INHALE_MS : EXHALE_MS) / 1000}s cubic-bezier(.45,0,.55,1)`
            : "transform 2s cubic-bezier(.45,0,.55,1)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span className="tabular-nums" style={{ fontSize: phase === "breathing" ? 72 : 64, fontWeight: 200, lineHeight: 1, color: "var(--ink)" }}>
            {phase === "breathing" ? breath : phase === "recoveryIn" ? "↑" : fmt(remaining)}
          </span>
        </div>

        <div style={{ fontSize: 20, fontWeight: 600, color: "var(--ink)" }}>{label}</div>
        {isRetention && (
          <div style={{ fontSize: 15, color: "var(--ink-3)" }}>{freq} Hz playing · tap anywhere to breathe</div>
        )}
        {phase === "breathing" && (
          <div style={{ fontSize: 15, color: "var(--ink-3)" }}>{BREATHS - breath} to go{round > 1 ? ` · last hold ${fmt(holds[holds.length - 1] ?? 0)}` : ""}</div>
        )}
      </div>

      {/* bottom hint keeps the thumb zone honest — the whole screen is the button during retention */}
      <div style={{ minHeight: 40, textAlign: "center", fontSize: 14, color: "var(--ink-4)" }}>
        {isRetention ? "the whole screen is the button" : ""}
      </div>
    </div>
  );
}
