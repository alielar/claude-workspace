"use client";

/**
 * /breathe · Wim Hof breathing player.
 *
 * 3 rounds of: 30 paced breaths → retention hold on empty lungs (1:30 countdown,
 * TAP ANYWHERE to end early) → deep breath in, 15 s recovery hold. Finishing
 * ticks the "Wim Hof breathing" routine item (offline-safe).
 *
 * Sound (all synthesized live, no assets, no voice):
 *  · three breath-cue styles, picked + previewed on the idle screen, with volume:
 *      waves (soft noise swell, default) · chime (one soft note) · sweep (pitch arc)
 *  · retention plays the chosen frequency as ONE continuous, constant-volume
 *    oscillator (never two detuned ones · equal tones 0.15 Hz apart beat against
 *    each other and fade to silence every ~7 s, which is why the old pad pulsed).
 *    Binaural options play a steady tone per ear (headphones). A 1 s watchdog
 *    resumes the AudioContext if iOS interrupts it mid-hold. Preview on tap.
 * Frequencies only during the hold. Safety: sit or lie down, never in water.
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
const RETENTION_S = 90;
const RECOVERY_IN_MS = 3500;
const RECOVERY_HOLD_S = 15;

/** Hold-tone options in two honest groups: brainwave "beats" with some published
 * evidence (they need headphones · each ear gets a slightly different pitch and the
 * brain hears the difference as a slow pulse), and the traditional solfeggio tones
 * (pleasant, zero evidence · labels are lore). */
type FreqOpt = { id: string; hz: number; beatHz?: number; label: string; sub: string };
const FREQS_EVIDENCE: FreqOpt[] = [
  { id: "theta6",  hz: 200, beatHz: 6,  label: "6 Hz theta",  sub: "deep relaxation · best-studied" },
  { id: "alpha10", hz: 220, beatHz: 10, label: "10 Hz alpha", sub: "calm, relaxed focus" },
  { id: "gamma40", hz: 240, beatHz: 40, label: "40 Hz gamma", sub: "alertness · early research" },
];
const FREQS_TRADITION: FreqOpt[] = [
  { id: "t174", hz: 174, label: "174 Hz", sub: "grounding" },
  { id: "t285", hz: 285, label: "285 Hz", sub: "restoring" },
  { id: "t396", hz: 396, label: "396 Hz", sub: "release" },
  { id: "t417", hz: 417, label: "417 Hz", sub: "reset" },
  { id: "t432", hz: 432, label: "432 Hz", sub: "natural calm" },
  { id: "t528", hz: 528, label: "528 Hz", sub: "the classic" },
  { id: "t639", hz: 639, label: "639 Hz", sub: "connection" },
  { id: "t741", hz: 741, label: "741 Hz", sub: "clarity" },
  { id: "t852", hz: 852, label: "852 Hz", sub: "intuition" },
  { id: "t963", hz: 963, label: "963 Hz", sub: "stillness" },
];
const ALL_FREQS = [...FREQS_EVIDENCE, ...FREQS_TRADITION];

type BreathStyle = "waves" | "ocean" | "bowl" | "hum" | "chime" | "sweep";
const STYLES: { key: BreathStyle; label: string; hint: string }[] = [
  { key: "waves", label: "Waves", hint: "soft air swell" },
  { key: "ocean", label: "Ocean", hint: "deep, slow surf" },
  { key: "bowl",  label: "Bowl",  hint: "singing bowl" },
  { key: "hum",   label: "Hum",   hint: "low voice-like tone" },
  { key: "chime", label: "Chime", hint: "one quiet note" },
  { key: "sweep", label: "Sweep", hint: "rising and falling tone" },
];

type Phase = "idle" | "breathing" | "retention" | "recoveryIn" | "recoveryHold" | "done";

/** All sound, synthesized. Nothing downloaded, nothing licensed. */
class BreathSynth {
  private ctx: AudioContext | null = null;
  private pad: { osc: OscillatorNode[]; gain: GainNode } | null = null;
  private noiseBuf: AudioBuffer | null = null;
  // While the pad plays, a watchdog re-resumes the AudioContext if iOS
  // suspends/"interrupts" it (notification, Siri, app switch) · otherwise the
  // hold tone dies silently and never comes back.
  private watchdog: ReturnType<typeof setInterval> | null = null;

  arm() {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      if (!this.ctx) this.ctx = new Ctx();
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    } catch { /* silent */ }
  }

  private noise(): AudioBuffer | null {
    const ctx = this.ctx; if (!ctx) return null;
    if (!this.noiseBuf) {
      const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = b;
    }
    return this.noiseBuf;
  }

  /** One breath cue. kind "in" rises, "out" falls. vol 0..1 from the slider. */
  breath(kind: "in" | "out", style: BreathStyle, ms: number, vol: number) {
    const ctx = this.ctx; if (!ctx || vol <= 0) return;
    const t = ctx.currentTime, dur = ms / 1000;

    if (style === "chime") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = kind === "in" ? 740 : 392;
      gain.gain.setValueAtTime(0.16 * vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.55);
      return;
    }

    if (style === "waves" || style === "ocean") {
      const buf = this.noise(); if (!buf) return;
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass"; filter.Q.value = style === "ocean" ? 0.9 : 0.6;
      const gain = ctx.createGain();
      // Ocean sits much lower in pitch and swells later · reads as distant surf.
      const [lo, hi] = style === "ocean" ? [90, 380] : [240, 850];
      const peak = (style === "ocean" ? 0.14 : 0.10) * vol;
      if (kind === "in") {
        filter.frequency.setValueAtTime(lo, t);
        filter.frequency.linearRampToValueAtTime(hi, t + dur);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(peak, t + dur * (style === "ocean" ? 0.85 : 0.7));
        gain.gain.linearRampToValueAtTime(0.001, t + dur);
      } else {
        filter.frequency.setValueAtTime(hi, t);
        filter.frequency.linearRampToValueAtTime(lo, t + dur);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(peak * 0.8, t + dur * 0.25);
        gain.gain.linearRampToValueAtTime(0.001, t + dur);
      }
      src.connect(filter).connect(gain).connect(ctx.destination);
      src.start(t); src.stop(t + dur + 0.05);
      return;
    }

    if (style === "bowl") {
      // Struck singing bowl: a base note + two soft inharmonic partials, long ring.
      const base = kind === "in" ? 329.6 : 246.9;   // E4 in · B3 out
      const ring = Math.min(dur + 0.6, 2.6);
      for (const [mult, amp] of [[1, 0.14], [2.71, 0.05], [5.4, 0.018]] as const) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine"; osc.frequency.value = base * mult;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(amp * vol, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + ring);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t); osc.stop(t + ring + 0.05);
      }
      return;
    }

    if (style === "hum") {
      // A low voice-like hum: fundamental + quiet 2nd and 3rd harmonics,
      // slow attack and release so it breathes rather than beeps.
      const base = kind === "in" ? 146.8 : 110;     // D3 in · A2 out
      for (const [mult, amp] of [[1, 0.14], [2, 0.05], [3, 0.02]] as const) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine"; osc.frequency.value = base * mult;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(amp * vol, t + dur * 0.4);
        gain.gain.setValueAtTime(amp * vol, t + dur * 0.7);
        gain.gain.linearRampToValueAtTime(0, t + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t); osc.stop(t + dur + 0.05);
      }
      return;
    }

    // sweep
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    const v = 0.12 * vol;
    if (kind === "in") { osc.frequency.setValueAtTime(220, t); osc.frequency.exponentialRampToValueAtTime(470, t + dur); }
    else { osc.frequency.setValueAtTime(470, t); osc.frequency.exponentialRampToValueAtTime(210, t + dur); }
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(v, t + 0.12);
    gain.gain.setValueAtTime(v, t + dur - 0.25);
    gain.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  /** Woody pluck for phase markers (hold, release). */
  pluck(freq: number, volume = 0.22) {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime;
    for (const [f, v] of [[freq, volume], [freq * 4, volume * 0.15]] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine"; osc.frequency.value = f;
      gain.gain.setValueAtTime(v, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.4);
    }
  }

  /** Continuous frequency pad.
   * Plain tone: ONE oscillator, constant volume after a short fade-in.
   * beatHz set (binaural): left ear hz, right ear hz+beatHz · steady in each ear,
   * the "beat" happens in the brain, so it needs headphones. */
  padStart(hz: number, fadeIn = 2.5, beatHz?: number) {
    const ctx = this.ctx; if (!ctx) return;
    this.padStop(0.15);
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.11, t + fadeIn);
    gain.connect(ctx.destination);
    let osc: OscillatorNode[];
    if (beatHz) {
      osc = [[hz, -1], [hz + beatHz, 1]].map(([f, side]) => {
        const o = ctx.createOscillator();
        o.type = "sine"; o.frequency.value = f;
        const pan = ctx.createStereoPanner();
        pan.pan.value = side;
        o.connect(pan).connect(gain); o.start(t);
        return o;
      });
    } else {
      const o = ctx.createOscillator();
      o.type = "sine"; o.frequency.value = hz;
      o.connect(gain); o.start(t);
      osc = [o];
    }
    this.pad = { osc, gain };
    this.watchdog = setInterval(() => {
      const c = this.ctx;
      if (!c || !this.pad) return;
      if (c.state !== "running") c.resume().catch(() => { /* retry next second */ });
    }, 1000);
  }

  padStop(fade = 1.2) {
    if (this.watchdog) { clearInterval(this.watchdog); this.watchdog = null; }
    const ctx = this.ctx, pad = this.pad;
    if (!ctx || !pad) return;
    const t = ctx.currentTime;
    pad.gain.gain.cancelScheduledValues(t);
    pad.gain.gain.setValueAtTime(pad.gain.gain.value, t);
    pad.gain.gain.linearRampToValueAtTime(0, t + fade);
    for (const o of pad.osc) o.stop(t + fade + 0.2);
    this.pad = null;
  }

  padActive() { return this.pad !== null; }
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
  const [holds, setHolds] = useState<number[]>([]);
  const [freqId, setFreqId] = useState<string>("t528");
  const [style, setStyle] = useState<BreathStyle>("waves");
  const [vol, setVol] = useState(50);
  const [previewingFreq, setPreviewingFreq] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdown = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdStart = useRef(0);
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const styleRef = useRef<BreathStyle>("waves");
  const volRef = useRef(0.5);
  const freqRef = useRef<FreqOpt>(FREQS_TRADITION[5]);
  phaseRef.current = phase;
  styleRef.current = style;
  volRef.current = vol / 100;

  const freqOpt = ALL_FREQS.find((f) => f.id === freqId) ?? FREQS_TRADITION[5];
  freqRef.current = freqOpt;

  useEffect(() => {
    try {
      const raw = localStorage.getItem("cc-breathe-freq");
      // Old versions stored the plain number (e.g. "528") · map it to the tone id.
      if (raw && ALL_FREQS.some((x) => x.id === raw)) setFreqId(raw);
      else if (raw && ALL_FREQS.some((x) => x.id === `t${raw}`)) setFreqId(`t${raw}`);
      const s = localStorage.getItem("cc-breathe-sound") as BreathStyle | null;
      if (s && STYLES.some((x) => x.key === s)) setStyle(s);
      const v = Number(localStorage.getItem("cc-breathe-vol"));
      if (Number.isFinite(v) && v >= 0 && v <= 100 && localStorage.getItem("cc-breathe-vol") !== null) setVol(v);
    } catch { /* ignore */ }
  }, []);

  const clearTimers = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (countdown.current) clearInterval(countdown.current);
    timer.current = null; countdown.current = null;
  }, []);

  // ── Idle previews ───────────────────────────────────────────────────────────
  const pickFreq = (f: FreqOpt) => {
    setFreqId(f.id);
    try { localStorage.setItem("cc-breathe-freq", f.id); } catch { /* ignore */ }
    // preview the tone right away, a few seconds, so the choice is informed
    synth.arm();
    synth.padStart(f.hz, 0.6, f.beatHz);
    setPreviewingFreq(true);
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => { synth.padStop(); setPreviewingFreq(false); }, 4000);
  };
  const stopFreqPreview = () => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    synth.padStop(0.4); setPreviewingFreq(false);
  };
  const pickStyle = (s: BreathStyle) => {
    setStyle(s);
    try { localStorage.setItem("cc-breathe-sound", s); } catch { /* ignore */ }
    // one demo breath cycle at the current volume
    synth.arm();
    synth.breath("in", s, 1100, vol / 100);
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => synth.breath("out", s, 1300, volRef.current), 1250);
  };
  const pickVol = (v: number) => {
    setVol(v);
    try { localStorage.setItem("cc-breathe-vol", String(v)); } catch { /* ignore */ }
  };

  // ── Wake lock ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const running = phase !== "idle" && phase !== "done";
    if (!running) { wakeLock.current?.release().catch(() => {}); wakeLock.current = null; return; }
    const req = async () => { try { if ("wakeLock" in navigator) wakeLock.current = await navigator.wakeLock.request("screen"); } catch { /* ok */ } };
    req();
    const onVis = () => { if (document.visibilityState === "visible") req(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [phase]);

  // ── Breathing ───────────────────────────────────────────────────────────────
  const runBreath = useCallback((n: number, r: number) => {
    setPhase("breathing"); setRound(r); setBreath(n); setInhaling(true);
    synth.breath("in", styleRef.current, INHALE_MS, volRef.current);
    timer.current = setTimeout(() => {
      setInhaling(false);
      synth.breath("out", styleRef.current, EXHALE_MS, volRef.current * (n === BREATHS ? 0.7 : 1));
      timer.current = setTimeout(() => {
        if (n < BREATHS) runBreath(n + 1, r);
        else startRetention(r);
      }, EXHALE_MS);
    }, INHALE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Retention ───────────────────────────────────────────────────────────────
  const startRetention = useCallback((r: number) => {
    setPhase("retention"); setRemaining(RETENTION_S);
    holdStart.current = Date.now();
    synth.pluck(392);
    const f = freqRef.current;
    synth.padStart(f.hz, 2.5, f.beatHz);
    countdown.current = setInterval(() => {
      const left = RETENTION_S - Math.floor((Date.now() - holdStart.current) / 1000);
      setRemaining(Math.max(0, left));
      if (left <= 0) endRetention(r);
    }, 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const endRetention = useCallback((r: number) => {
    if (phaseRef.current !== "retention") return;
    clearTimers();
    synth.padStop();
    setHolds((h) => [...h, Math.min(RETENTION_S, Math.round((Date.now() - holdStart.current) / 1000))]);
    setPhase("recoveryIn");
    synth.breath("in", styleRef.current, RECOVERY_IN_MS - 700, Math.max(0.35, volRef.current));
    timer.current = setTimeout(() => {
      setPhase("recoveryHold"); setRemaining(RECOVERY_HOLD_S);
      synth.pluck(523);
      const t0 = Date.now();
      countdown.current = setInterval(() => {
        const left = RECOVERY_HOLD_S - Math.floor((Date.now() - t0) / 1000);
        setRemaining(Math.max(0, left));
        if (left <= 0) {
          clearTimers();
          synth.pluck(659);
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

  const start = () => { synth.arm(); stopFreqPreview(); setHolds([]); runBreath(1, 1); };
  const exit = () => { clearTimers(); synth.padStop(); setPhase("idle"); router.push("/today"); };
  useEffect(() => () => { clearTimers(); synth.padStop(); }, [clearTimers]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const chip = (on: boolean): React.CSSProperties => ({
    minHeight: 44, padding: "0 12px", borderRadius: 10, fontSize: 15, font: "inherit", cursor: "pointer",
    border: `1px solid ${on ? "var(--violet)" : "var(--line-hi)"}`,
    background: on ? "var(--accent-soft)" : "var(--fill-1)", color: "var(--ink)",
  });

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
        <div style={{ fontSize: 13, color: "var(--ink-4)", marginTop: -8 }}>
          Sit or lie down. Never in water, never driving. During the hold, tap anywhere to breathe.
        </div>

        <section className="cc-card">
          <div className="cc-card-head"><span className="title">Breath sound</span><span className="tail">{STYLES.find((s) => s.key === style)?.label}</span></div>
          <div className="cc-card-body" style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {STYLES.map((s) => (
                <button key={s.key} onClick={() => pickStyle(s.key)} aria-pressed={style === s.key} style={chip(style === s.key)}>
                  {s.label} <span style={{ color: "var(--ink-3)", fontSize: 13 }}>· {s.hint}</span>
                </button>
              ))}
            </div>
            <label style={{ display: "grid", gap: 6, fontSize: 14, color: "var(--ink-3)" }}>
              Volume · {vol}%
              <input type="range" min={0} max={100} step={5} value={vol}
                onChange={(e) => pickVol(Number(e.target.value))}
                onPointerUp={() => pickStyle(style)}
                style={{ width: "100%", accentColor: "var(--violet)", minHeight: 32 }} />
            </label>
            <div style={{ fontSize: 13, color: "var(--ink-4)" }}>Tap a style to hear one breath at this volume.</div>
          </div>
        </section>

        <section className="cc-card">
          <div className="cc-card-head">
            <span className="title">Hold frequency</span>
            <span className="tail">
              {previewingFreq
                ? <button onClick={stopFreqPreview} style={{ background: "none", border: "none", color: "var(--violet)", font: "inherit", fontSize: 14, cursor: "pointer", padding: 0 }}>■ stop</button>
                : freqOpt.label}
            </span>
          </div>
          <div className="cc-card-body" style={{ display: "grid", gap: 10 }}>
            <div style={{ fontSize: 13, color: "var(--ink-3)" }}>Brainwave beats · some real studies behind these · headphones needed</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {FREQS_EVIDENCE.map((f) => (
                <button key={f.id} onClick={() => pickFreq(f)} aria-pressed={freqId === f.id} style={chip(freqId === f.id)}>
                  {f.label} <span style={{ color: "var(--ink-3)", fontSize: 13 }}>· {f.sub}</span>
                </button>
              ))}
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-3)", paddingTop: 2 }}>Solfeggio tones · calming but no evidence · labels are lore</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {FREQS_TRADITION.map((f) => (
                <button key={f.id} onClick={() => pickFreq(f)} aria-pressed={freqId === f.id} style={chip(freqId === f.id)}>
                  {f.hz} <span style={{ color: "var(--ink-3)", fontSize: 13 }}>· {f.sub}</span>
                </button>
              ))}
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-4)" }}>
              Tap to hear it. The tone plays continuously during the hold, nowhere else.
            </div>
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

  // ── Running ─────────────────────────────────────────────────────────────────
  const isRetention = phase === "retention";
  const label =
    phase === "breathing" ? (inhaling ? "Breathe in" : "Let go") :
    isRetention ? "Hold" :
    phase === "recoveryIn" ? "Big breath in" : "Keep it in";
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
          <div style={{ fontSize: 15, color: "var(--ink-3)" }}>{freqOpt.label} playing · tap anywhere to breathe</div>
        )}
        {phase === "breathing" && (
          <div style={{ fontSize: 15, color: "var(--ink-3)" }}>{BREATHS - breath} to go{round > 1 ? ` · last hold ${fmt(holds[holds.length - 1] ?? 0)}` : ""}</div>
        )}
      </div>

      <div style={{ minHeight: 40, textAlign: "center", fontSize: 14, color: "var(--ink-4)" }}>
        {isRetention ? "the whole screen is the button" : ""}
      </div>
    </div>
  );
}
