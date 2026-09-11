"use client";

/**
 * /breathe · technique picker + players (2026-09-07).
 *
 * Opens on a picker: Wim Hof (the daily, first and biggest) + six paced
 * techniques from src/lib/breathe/techniques.ts, each showing goal and duration
 * (evidence stated in prose on the detail screen · no rating dots, Ali 2026-09-08).
 * One tap deeper = full detail + duration choice + Start. Any finished session
 * ticks the "breathe" routine item (offline-safe).
 *
 * Wim Hof player: 3 rounds of 30 paced breaths → retention hold on empty lungs
 * (1:30 countdown, TAP ANYWHERE to end early) → deep breath in, 15 s recovery,
 * then an 8 s long controlled exhale before the next round (Ali's deliberate
 * preference · not part of the standard protocol · keep it).
 * The others run through GenericPlayer (steps × cycles, same sounds and circle).
 *
 * Sound (all synthesized live, no assets, no voice):
 *  · six breath-cue styles with volume; every style SUSTAINS for the whole
 *    inhale/exhale (Ali 2026-09-08: the sound ending must mean the phase ended) ·
 *    Chime and Hum are the pure held-note "monotone" options
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
import { TECHNIQUES, techniqueById, totalLabel, type Technique, type PaceStep } from "@/lib/breathe/techniques";

const ROUNDS = 3;
const BREATHS = 30;
const INHALE_MS = 1700;
const EXHALE_MS = 2000;
const RETENTION_S = 90;
const RECOVERY_IN_MS = 3500;
const RECOVERY_HOLD_S = 15;
// Ali's deliberate choice (2026-09-08, spec §4.x Breathe): a long controlled exhale
// after the 15 s recovery hold, before the next round. NOT part of the standard
// Wim Hof protocol (which goes straight on) · do not "fix" this back.
const RECOVERY_OUT_MS = 8000;
// 2026-09-11 (Ali): a 3-2-1 countdown after Start so the first inhale never
// catches him off guard; the rising bell now covers the LAST 10 breaths of each
// round (was 3), one scale step per breath; and each round's hold gets its own
// frequency, chosen before the session (key cc-breathe-freqs, JSON array of 3).
const COUNTDOWN_S = 3;
const BELL_BREATHS = 10;
// Major scale from G4 up to B5, one step per breath: G A B C D E F# G A B.
const BELL_SEMITONES = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16];

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

// 2026-09-12 (Ali): a real range of inhale/exhale sounds, and a "top 5" he manages
// himself (star = favourite). Session screens show only the top 5; "All sounds"
// opens the full list to swap favourites. Keys: cc-breathe-sound (current),
// cc-breathe-favs (JSON array of ≤ 5 style keys).
type BreathStyle = "waves" | "ocean" | "rain" | "wind" | "bowl" | "hum" | "chime" | "sweep" | "flute" | "strings" | "piano" | "drone";
const STYLES: { key: BreathStyle; label: string; hint: string }[] = [
  { key: "waves",   label: "Waves",   hint: "soft air swell" },
  { key: "ocean",   label: "Ocean",   hint: "deep, slow surf" },
  { key: "rain",    label: "Rain",    hint: "light rain, swells with the breath" },
  { key: "wind",    label: "Wind",    hint: "a gust that rises and falls" },
  { key: "bowl",    label: "Bowl",    hint: "singing bowl" },
  { key: "hum",     label: "Hum",     hint: "low voice-like tone" },
  { key: "chime",   label: "Chime",   hint: "one quiet note" },
  { key: "sweep",   label: "Sweep",   hint: "rising and falling tone" },
  { key: "flute",   label: "Flute",   hint: "breathy note with a slow waver" },
  { key: "strings", label: "Strings", hint: "warm string pad" },
  { key: "piano",   label: "Piano",   hint: "two soft notes, in and out" },
  { key: "drone",   label: "Drone",   hint: "deep swell, almost felt" },
];
const DEFAULT_FAVS: BreathStyle[] = ["waves", "ocean", "bowl", "hum", "chime"];
const MAX_FAVS = 5;
const isStyle = (k: unknown): k is BreathStyle => typeof k === "string" && STYLES.some((x) => x.key === k);

type Phase = "idle" | "countdown" | "breathing" | "retention" | "recoveryIn" | "recoveryHold" | "recoveryOut" | "done";

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

  /** Where a cue's audio goes: the speakers, or one side of the headphones
   * (alternate nostril pans the sound to the breathing side). */
  private dest(pan?: -1 | 1): AudioNode {
    const ctx = this.ctx!;
    if (!pan) return ctx.destination;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(ctx.destination);
    return p;
  }

  /** One breath cue. kind "in" rises, "out" falls. vol 0..1 from the slider. */
  breath(kind: "in" | "out", style: BreathStyle, ms: number, vol: number, pan?: -1 | 1) {
    const ctx = this.ctx; if (!ctx || vol <= 0) return;
    const t = ctx.currentTime, dur = ms / 1000;
    const out = this.dest(pan);

    if (style === "chime") {
      // A held note for the WHOLE phase (Ali, 2026-09-08): soft attack, steady
      // level, gentle release · eyes closed, the note ending = the phase ending.
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = kind === "in" ? 587.3 : 392;   // D5 in · G4 out
      const v = 0.13 * vol;
      const release = Math.min(0.4, dur * 0.2);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(v, t + 0.15);
      gain.gain.setValueAtTime(v, t + dur - release);
      gain.gain.linearRampToValueAtTime(0, t + dur);
      osc.connect(gain).connect(out);
      osc.start(t); osc.stop(t + dur + 0.05);
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
      src.connect(filter).connect(gain).connect(out);
      src.start(t); src.stop(t + dur + 0.05);
      return;
    }

    if (style === "bowl") {
      // Struck singing bowl: a base note + two soft inharmonic partials. The ring
      // lasts the whole phase, so a long exhale keeps its sound to the end.
      const base = kind === "in" ? 329.6 : 246.9;   // E4 in · B3 out
      const ring = dur;
      for (const [mult, amp] of [[1, 0.14], [2.71, 0.05], [5.4, 0.018]] as const) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine"; osc.frequency.value = base * mult;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(amp * vol, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + ring);
        osc.connect(gain).connect(out);
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
        osc.connect(gain).connect(out);
        osc.start(t); osc.stop(t + dur + 0.05);
      }
      return;
    }

    if (style === "rain" || style === "wind") {
      // Filtered noise shaped like the breath. Rain sits high and light (bandpass
      // around 3 kHz); wind is a broad band that climbs on the inhale.
      const buf = this.noise(); if (!buf) return;
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.Q.value = style === "rain" ? 0.7 : 1.4;
      const [lo, hi] = style === "rain" ? [2600, 3400] : [300, 1400];
      const peak = (style === "rain" ? 0.07 : 0.09) * vol;
      const gain = ctx.createGain();
      if (kind === "in") {
        filter.frequency.setValueAtTime(lo, t); filter.frequency.linearRampToValueAtTime(hi, t + dur);
        gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(peak, t + dur * 0.75); gain.gain.linearRampToValueAtTime(0.001, t + dur);
      } else {
        filter.frequency.setValueAtTime(hi, t); filter.frequency.linearRampToValueAtTime(lo, t + dur);
        gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(peak * 0.85, t + dur * 0.2); gain.gain.linearRampToValueAtTime(0.001, t + dur);
      }
      src.connect(filter).connect(gain).connect(out);
      src.start(t); src.stop(t + dur + 0.05);
      return;
    }

    if (style === "flute") {
      // Breathy note: sine + faint 2nd harmonic, slow vibrato, a whisper of air.
      const base = kind === "in" ? 523.3 : 392;      // C5 in · G4 out
      const vib = ctx.createOscillator(); const vibGain = ctx.createGain();
      vib.frequency.value = 4.5; vibGain.gain.value = 3;
      vib.connect(vibGain);
      for (const [mult, amp] of [[1, 0.11], [2, 0.03]] as const) {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.type = "sine"; osc.frequency.value = base * mult;
        vibGain.connect(osc.frequency);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(amp * vol, t + Math.min(0.5, dur * 0.3));
        gain.gain.setValueAtTime(amp * vol, t + dur - Math.min(0.4, dur * 0.2));
        gain.gain.linearRampToValueAtTime(0, t + dur);
        osc.connect(gain).connect(out); osc.start(t); osc.stop(t + dur + 0.05);
      }
      vib.start(t); vib.stop(t + dur + 0.05);
      const buf = this.noise();
      if (buf) {
        const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
        const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = base * 2; f.Q.value = 6;
        const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.02 * vol, t + 0.3); g.gain.linearRampToValueAtTime(0, t + dur);
        src.connect(f).connect(g).connect(out); src.start(t); src.stop(t + dur + 0.05);
      }
      return;
    }

    if (style === "strings") {
      // Warm pad: three slightly detuned sawtooths through a soft lowpass, slow swell.
      const base = kind === "in" ? 220 : 164.8;      // A3 in · E3 out
      const filter = ctx.createBiquadFilter(); filter.type = "lowpass"; filter.Q.value = 0.5;
      filter.frequency.setValueAtTime(kind === "in" ? 500 : 1400, t);
      filter.frequency.linearRampToValueAtTime(kind === "in" ? 1400 : 500, t + dur);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.06 * vol, t + dur * 0.45);
      gain.gain.setValueAtTime(0.06 * vol, t + dur * 0.75);
      gain.gain.linearRampToValueAtTime(0, t + dur);
      for (const det of [-4, 0, 5]) {
        const osc = ctx.createOscillator(); osc.type = "sawtooth"; osc.frequency.value = base; osc.detune.value = det;
        osc.connect(filter); osc.start(t); osc.stop(t + dur + 0.05);
      }
      filter.connect(gain).connect(out);
      return;
    }

    if (style === "piano") {
      // Two soft piano-like notes: struck at the phase start, ringing through it.
      const notes = kind === "in" ? [261.6, 392] : [329.6, 196];   // C4+G4 in · E4+G3 out
      notes.forEach((f, i) => {
        const at = t + i * 0.18;
        for (const [mult, amp] of [[1, 0.12], [2, 0.04], [3, 0.015]] as const) {
          const osc = ctx.createOscillator(); const gain = ctx.createGain();
          osc.type = "sine"; osc.frequency.value = f * mult;
          gain.gain.setValueAtTime(0, at);
          gain.gain.linearRampToValueAtTime(amp * vol, at + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(0.8, dur));
          osc.connect(gain).connect(out); osc.start(at); osc.stop(at + Math.max(0.8, dur) + 0.05);
        }
      });
      return;
    }

    if (style === "drone") {
      // Deep swell you feel more than hear: two low sines a fifth apart.
      const base = kind === "in" ? 82.4 : 65.4;      // E2 in · C2 out
      for (const [mult, amp] of [[1, 0.2], [1.5, 0.08], [2, 0.04]] as const) {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.type = "sine"; osc.frequency.value = base * mult;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(amp * vol, t + dur * (kind === "in" ? 0.7 : 0.25));
        gain.gain.linearRampToValueAtTime(0, t + dur);
        osc.connect(gain).connect(out); osc.start(t); osc.stop(t + dur + 0.05);
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
    osc.connect(gain).connect(out);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  /** Kapalabhati exhale snap · a short breathy burst, one per beat. */
  snap(vol: number) {
    const ctx = this.ctx; if (!ctx || vol <= 0) return;
    const buf = this.noise(); if (!buf) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass"; filter.frequency.value = 900; filter.Q.value = 1.1;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.55 * vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(t); src.stop(t + 0.15);
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
   * the "beat" happens in the brain, so it needs headphones.
   * vol 0..1 from the volume slider · was a hardcoded 0.11 (~a tenth of maximum),
   * which is why the hold tone stayed quiet at full phone volume (Ali, 2026-09-07). */
  padStart(hz: number, fadeIn = 2.5, beatHz?: number, vol = 0.5) {
    const ctx = this.ctx; if (!ctx) return;
    this.padStop(0.15);
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.18 + 0.55 * vol, t + fadeIn);
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

/** The "top 5" favourites · shared by every screen (localStorage cc-breathe-favs). */
function useSoundFavs() {
  const [favs, setFavs] = useState<BreathStyle[]>(DEFAULT_FAVS);
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("cc-breathe-favs") ?? "null");
      if (Array.isArray(raw)) { const ok = raw.filter(isStyle).slice(0, MAX_FAVS); if (ok.length) setFavs(ok); }
    } catch { /* ignore */ }
  }, []);
  const save = (next: BreathStyle[]) => { setFavs(next); try { localStorage.setItem("cc-breathe-favs", JSON.stringify(next)); } catch { /* ignore */ } };
  const toggleFav = (k: BreathStyle) => {
    if (favs.includes(k)) { if (favs.length > 1) save(favs.filter((x) => x !== k)); return; }
    if (favs.length >= MAX_FAVS) return; // full · remove one first (the UI says so)
    save([...favs, k]);
  };
  return { favs, toggleFav, full: favs.length >= MAX_FAVS };
}

/**
 * Sound chips. Default: only the top 5, one tap = pick + hear one breath.
 * "All sounds" unfolds the full list where ★ adds/removes a favourite.
 */
function SoundPicker({ style, onPick, chip }: { style: BreathStyle; onPick: (s: BreathStyle) => void; chip: (on: boolean) => React.CSSProperties }) {
  const { favs, toggleFav, full } = useSoundFavs();
  const [all, setAll] = useState(false);
  const shown = all ? STYLES : STYLES.filter((s) => favs.includes(s.key) || s.key === style);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {shown.map((s) => {
          const fav = favs.includes(s.key);
          return (
            <span key={s.key} style={{ display: "inline-flex", alignItems: "stretch" }}>
              <button onClick={() => onPick(s.key)} aria-pressed={style === s.key} style={{ ...chip(style === s.key), ...(all ? { borderTopRightRadius: 0, borderBottomRightRadius: 0 } : {}) }}>
                {s.label} <span style={{ color: "var(--ink-3)", fontSize: 13 }}>· {s.hint}</span>
              </button>
              {all && (
                <button onClick={() => toggleFav(s.key)} aria-pressed={fav} aria-label={fav ? `Remove ${s.label} from top 5` : `Add ${s.label} to top 5`}
                  title={!fav && full ? "Top 5 is full · remove one first" : undefined}
                  style={{ minWidth: 44, minHeight: 44, borderRadius: "0 10px 10px 0", border: "1px solid var(--line-hi)", borderLeft: "none", background: fav ? "var(--accent-soft)" : "var(--fill-1)", color: fav ? "var(--violet)" : !fav && full ? "var(--ink-4)" : "var(--ink-3)", font: "inherit", fontSize: 16, cursor: "pointer" }}>
                  {fav ? "★" : "☆"}
                </button>
              )}
            </span>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink-4)" }}>
        <span>{all ? `★ = in your top 5 (${favs.length}/${MAX_FAVS})${full ? " · full, remove one to add another" : ""}` : "Your top 5 · tap to hear one breath"}</span>
        <button onClick={() => setAll((v) => !v)} style={{ background: "none", border: "none", color: "var(--violet)", font: "inherit", fontSize: 13, cursor: "pointer", padding: "6px 0", minHeight: 32, whiteSpace: "nowrap" }}>{all ? "Done" : "All sounds ›"}</button>
      </div>
    </div>
  );
}

/** Breath-cue style + volume, shared by every player (same localStorage keys). */
function useSoundPrefs() {
  const [style, setStyle] = useState<BreathStyle>("waves");
  const [vol, setVol] = useState(50);
  useEffect(() => {
    try {
      const s = localStorage.getItem("cc-breathe-sound");
      if (isStyle(s)) setStyle(s);
      const v = Number(localStorage.getItem("cc-breathe-vol"));
      if (Number.isFinite(v) && v >= 0 && v <= 100 && localStorage.getItem("cc-breathe-vol") !== null) setVol(v);
    } catch { /* ignore */ }
  }, []);
  const pickStyle = (s: BreathStyle) => {
    setStyle(s);
    try { localStorage.setItem("cc-breathe-sound", s); } catch { /* ignore */ }
  };
  const pickVol = (v: number) => {
    setVol(v);
    try { localStorage.setItem("cc-breathe-vol", String(v)); } catch { /* ignore */ }
  };
  return { style, vol, pickStyle, pickVol };
}

function WimHofScreen({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [round, setRound] = useState(1);
  const [breath, setBreath] = useState(1);
  const [inhaling, setInhaling] = useState(true);
  const [remaining, setRemaining] = useState(RETENTION_S);
  const [holds, setHolds] = useState<number[]>([]);
  const [count, setCount] = useState(COUNTDOWN_S);
  // One hold frequency per round · editRound = which round the chips below assign to.
  const [freqIds, setFreqIds] = useState<string[]>(["t528", "t528", "t528"]);
  const [editRound, setEditRound] = useState(0);
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
  const freqsRef = useRef<FreqOpt[]>([FREQS_TRADITION[5], FREQS_TRADITION[5], FREQS_TRADITION[5]]);
  phaseRef.current = phase;
  styleRef.current = style;
  volRef.current = vol / 100;

  const freqById = (id: string) => ALL_FREQS.find((f) => f.id === id) ?? FREQS_TRADITION[5];
  const freqOpts = freqIds.map(freqById);
  freqsRef.current = freqOpts;
  const freqOpt = freqOpts[editRound];
  const freqFor = (r: number) => freqsRef.current[Math.min(ROUNDS, Math.max(1, r)) - 1];

  useEffect(() => {
    try {
      const rawList = localStorage.getItem("cc-breathe-freqs");
      const list = rawList ? (JSON.parse(rawList) as unknown) : null;
      if (Array.isArray(list) && list.length === ROUNDS && list.every((x) => typeof x === "string" && ALL_FREQS.some((f) => f.id === x))) {
        setFreqIds(list as string[]);
      } else {
        // Older versions kept ONE tone (id, or the plain number like "528") · use it for all rounds.
        const raw = localStorage.getItem("cc-breathe-freq");
        const one = raw && ALL_FREQS.some((x) => x.id === raw) ? raw : raw && ALL_FREQS.some((x) => x.id === `t${raw}`) ? `t${raw}` : null;
        if (one) setFreqIds([one, one, one]);
      }
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
  const saveFreqs = (ids: string[]) => {
    setFreqIds(ids);
    try { localStorage.setItem("cc-breathe-freqs", JSON.stringify(ids)); localStorage.setItem("cc-breathe-freq", ids[0]); } catch { /* ignore */ }
  };
  const pickFreq = (f: FreqOpt) => {
    saveFreqs(freqIds.map((id, i) => (i === editRound ? f.id : id)));
    // preview the tone right away, a few seconds, so the choice is informed
    synth.arm();
    synth.padStart(f.hz, 0.6, f.beatHz, volRef.current);
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
    // Eyes-closed cue: each of the last ten breaths of a round starts with a bell,
    // one scale step higher each time (G4 → B5), so the hold never comes as a surprise.
    const k = n - (BREATHS - BELL_BREATHS);
    if (k >= 1) synth.pluck(392 * 2 ** (BELL_SEMITONES[k - 1] / 12), 0.1 + 0.012 * k);
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
    const f = freqFor(r);
    synth.padStart(f.hz, 2.5, f.beatHz, volRef.current);
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
          // Long controlled exhale before moving on (Ali's choice · see RECOVERY_OUT_MS).
          setPhase("recoveryOut"); setRemaining(Math.round(RECOVERY_OUT_MS / 1000));
          synth.breath("out", styleRef.current, RECOVERY_OUT_MS - 300, volRef.current);
          const t1 = Date.now();
          countdown.current = setInterval(() => {
            const outLeft = Math.round(RECOVERY_OUT_MS / 1000) - Math.floor((Date.now() - t1) / 1000);
            setRemaining(Math.max(0, outLeft));
            if (outLeft <= 0) {
              clearTimers();
              if (r < ROUNDS) {
                runBreath(1, r + 1);
              } else {
                setPhase("done");
                synth.pluck(784); synth.pluck(988);
                completeBreatheItem();
              }
            }
          }, 250);
        }
      }, 250);
    }, RECOVERY_IN_MS);
  }, [clearTimers, runBreath]);

  const start = () => {
    synth.arm(); stopFreqPreview(); setHolds([]);
    // 3-2-1 before the first inhale (Ali 2026-09-11) · a soft tick each second.
    setPhase("countdown"); setRound(1); setCount(COUNTDOWN_S);
    let n = COUNTDOWN_S;
    synth.pluck(523, 0.14);
    countdown.current = setInterval(() => {
      n -= 1;
      if (n >= 1) { setCount(n); synth.pluck(523, 0.14); return; }
      clearTimers();
      runBreath(1, 1);
    }, 1000);
  };
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
            <h1 style={{ fontSize: 28, fontWeight: 600 }}>Wim Hof</h1>
            <div className="sub">{ROUNDS} rounds · {BREATHS} breaths · hold up to {fmt(RETENTION_S)} · ~12 min</div>
          </div>
        </div>

        <button className="cc-btn cc-btn-primary" onClick={start} style={{ minHeight: 64, fontSize: 19, borderRadius: 16, width: "100%" }}>
          ▶ Start
        </button>
        <div style={{ fontSize: 13, color: "var(--ink-4)", marginTop: -8 }}>
          During the hold, tap anywhere to breathe.
        </div>

        <section className="cc-card">
          <div className="cc-card-head"><span className="title">Breath sound</span><span className="tail">{STYLES.find((s) => s.key === style)?.label}</span></div>
          <div className="cc-card-body" style={{ display: "grid", gap: 12 }}>
            <SoundPicker style={style} onPick={pickStyle} chip={chip} />
            <label style={{ display: "grid", gap: 6, fontSize: 14, color: "var(--ink-3)" }}>
              Volume · {vol}%
              <input type="range" min={0} max={100} step={5} value={vol}
                onChange={(e) => pickVol(Number(e.target.value))}
                onPointerUp={() => pickStyle(style)}
                style={{ width: "100%", accentColor: "var(--violet)", minHeight: 32 }} />
            </label>
          </div>
        </section>

        <section className="cc-card">
          <div className="cc-card-head">
            <span className="title">Hold frequency</span>
            <span className="tail">
              {previewingFreq
                ? <button onClick={stopFreqPreview} style={{ background: "none", border: "none", color: "var(--violet)", font: "inherit", fontSize: 14, cursor: "pointer", padding: 0 }}>■ stop</button>
                : "one per round"}
            </span>
          </div>
          <div className="cc-card-body" style={{ display: "grid", gap: 10 }}>
            {/* Which round the chips below set · each shows its current tone */}
            <div role="tablist" aria-label="Round" style={{ display: "grid", gridTemplateColumns: `repeat(${ROUNDS}, 1fr)`, gap: 4, padding: 4, borderRadius: 12, background: "var(--fill-1)" }}>
              {freqOpts.map((f, i) => {
                const on = editRound === i;
                return (
                  <button key={i} role="tab" aria-selected={on} onClick={() => setEditRound(i)}
                    style={{ minHeight: 52, borderRadius: 10, border: "none", cursor: "pointer", font: "inherit", background: on ? "var(--bg-card)" : "transparent", color: on ? "var(--ink)" : "var(--ink-3)", display: "grid", gap: 2, alignContent: "center", WebkitTapHighlightColor: "transparent" }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Round {i + 1}</span>
                    <span style={{ fontSize: 13, fontFamily: "var(--f-mono)", color: on ? "var(--violet)" : "var(--ink-3)" }}>{f.label}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink-3)" }}>
              <span>Tap a tone below to set it for round {editRound + 1}.</span>
              <button onClick={() => saveFreqs([freqIds[editRound], freqIds[editRound], freqIds[editRound]])} style={{ background: "none", border: "none", color: "var(--violet)", font: "inherit", fontSize: 13, cursor: "pointer", padding: "6px 0", minHeight: 32 }}>Use for all rounds</button>
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-3)" }}>Brainwave beats · some real studies behind these · headphones needed</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {FREQS_EVIDENCE.map((f) => (
                <button key={f.id} onClick={() => pickFreq(f)} aria-pressed={freqOpt.id === f.id} style={chip(freqOpt.id === f.id)}>
                  {f.label} <span style={{ color: "var(--ink-3)", fontSize: 13 }}>· {f.sub}</span>
                </button>
              ))}
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-3)", paddingTop: 2 }}>Solfeggio tones · calming but no evidence · labels are lore</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {FREQS_TRADITION.map((f) => (
                <button key={f.id} onClick={() => pickFreq(f)} aria-pressed={freqOpt.id === f.id} style={chip(freqOpt.id === f.id)}>
                  {f.hz} <span style={{ color: "var(--ink-3)", fontSize: 13 }}>· {f.sub}</span>
                </button>
              ))}
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-4)" }}>
              Tap to hear it. Each round&rsquo;s tone plays continuously during that round&rsquo;s hold, nowhere else.
            </div>
          </div>
        </section>

        <button onClick={onBack} style={{ fontSize: 15, color: "var(--ink-3)", background: "transparent", border: "none", font: "inherit", cursor: "pointer", textAlign: "left", padding: 0, minHeight: 44 }}>← All techniques</button>
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
    phase === "countdown" ? "Get ready" :
    phase === "breathing" ? (inhaling ? "Breathe in" : "Let go") :
    isRetention ? "Hold" :
    phase === "recoveryIn" ? "Big breath in" :
    phase === "recoveryOut" ? "Long breath out · slow" : "Keep it in";
  const accent = isRetention ? "var(--violet)" : phase === "recoveryHold" || phase === "recoveryIn" || phase === "recoveryOut" ? "var(--warn)" : "var(--cyan)";

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
                     phase === "recoveryIn" ? "scale(1.25)" : phase === "recoveryOut" ? "scale(0.8)" : isRetention ? "scale(0.82)" : "scale(1.1)",
          transition: phase === "breathing"
            ? `transform ${(inhaling ? INHALE_MS : EXHALE_MS) / 1000}s cubic-bezier(.45,0,.55,1)`
            : phase === "recoveryOut"
            ? `transform ${RECOVERY_OUT_MS / 1000}s cubic-bezier(.45,0,.55,1)`
            : "transform 2s cubic-bezier(.45,0,.55,1)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span className="tabular-nums" style={{ fontSize: phase === "breathing" || phase === "countdown" ? 72 : 64, fontWeight: 200, lineHeight: 1, color: "var(--ink)" }}>
            {phase === "countdown" ? count : phase === "breathing" ? breath : phase === "recoveryIn" ? "↑" : fmt(remaining)}
          </span>
        </div>

        <div style={{ fontSize: 20, fontWeight: 600, color: "var(--ink)" }}>{label}</div>
        {isRetention && (
          <div style={{ fontSize: 15, color: "var(--ink-3)" }}>{freqOpts[Math.min(ROUNDS, round) - 1].label} playing · tap anywhere to breathe</div>
        )}
        {phase === "countdown" && (
          <div style={{ fontSize: 15, color: "var(--ink-3)" }}>breathe normally · first breath in on zero</div>
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

// ═══ Technique picker + generic paced player (2026-09-07) ═════════════════════

/** "~5 min" or "~5-15 min" from a technique's duration options. */
function durationRange(t: Technique): string {
  const first = totalLabel(t, t.durations[0].cycles).replace("~", "");
  const last = totalLabel(t, t.durations[t.durations.length - 1].cycles).replace("~", "");
  return first === last ? first : `${first.replace(/ (min|s)$/, "")}-${last}`;
}

const GOAL_COLOR: Record<string, string> = {
  Calm: "var(--cyan)", Sleep: "var(--violet)", Reset: "var(--pos)", Focus: "var(--warn)", Energy: "var(--neg)",
};

// ─── Generic paced player · runs any Technique's step cycle ───────────────────

function GenericPlayer({ t, cycles, style, vol, onExit }: {
  t: Technique; cycles: number; style: BreathStyle; vol: number; onExit: () => void;
}) {
  const router = useRouter();
  const [cycle, setCycle] = useState(1);
  const [stepIdx, setStepIdx] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [fireCount, setFireCount] = useState(0);
  const [count, setCount] = useState<number | null>(COUNTDOWN_S);
  const [done, setDone] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervals = useRef<ReturnType<typeof setInterval>[]>([]);
  const stopped = useRef(false);
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  const volRef = useRef(vol / 100); volRef.current = vol / 100;
  const styleRef = useRef(style); styleRef.current = style;

  const clearAll = useCallback(() => {
    timers.current.forEach(clearTimeout); intervals.current.forEach(clearInterval);
    timers.current = []; intervals.current = [];
  }, []);

  const finish = useCallback(() => {
    if (stopped.current) return;
    clearAll();
    setDone(true);
    synth.pluck(659); synth.pluck(784);
    completeBreatheItem();
  }, [clearAll]);

  const runStep = useCallback(function run(c: number, i: number) {
    if (stopped.current) return;
    const step: PaceStep = t.steps[i];
    // Kapalabhati: the trailing rest of the final round is pointless · finish instead.
    if (c === cycles && step.kind === "rest" && i === t.steps.length - 1) { finish(); return; }
    setCycle(c); setStepIdx(i); setFireCount(0);
    const ms = step.seconds * 1000;
    if (step.kind === "in" || step.kind === "in2") synth.breath("in", styleRef.current, step.kind === "in2" ? Math.min(ms, 900) : ms, volRef.current, step.pan);
    else if (step.kind === "out") synth.breath("out", styleRef.current, ms, volRef.current, step.pan);
    else if (step.kind === "hold") synth.pluck(392, 0.2);
    else if (step.kind === "rest") synth.pluck(523, 0.16);
    if (step.kind === "hold" || step.kind === "rest" || step.kind === "fire") {
      const t0 = Date.now();
      setRemaining(step.seconds);
      intervals.current.push(setInterval(() => {
        setRemaining(Math.max(0, Math.ceil(step.seconds - (Date.now() - t0) / 1000)));
      }, 200));
      if (step.kind === "fire") {
        synth.snap(volRef.current); setFireCount(1);
        let n = 1;
        intervals.current.push(setInterval(() => {
          n += 1;
          if (n <= step.seconds) { synth.snap(volRef.current); setFireCount(n); }
        }, 1000));
      }
    } else setRemaining(null);
    timers.current.push(setTimeout(() => {
      clearAll();
      if (i + 1 < t.steps.length) run(c, i + 1);
      else if (c < cycles) run(c + 1, 0);
      else finish();
    }, ms));
  }, [t, cycles, clearAll, finish]);

  useEffect(() => {
    stopped.current = false;
    synth.arm();
    // 3-2-1 before the first step (Ali 2026-09-11) · soft tick each second.
    let n = COUNTDOWN_S;
    synth.pluck(523, 0.14);
    const cd = setInterval(() => {
      n -= 1;
      if (n >= 1) { setCount(n); synth.pluck(523, 0.14); return; }
      clearInterval(cd);
      setCount(null);
      runStep(1, 0);
    }, 1000);
    intervals.current.push(cd);
    return () => { stopped.current = true; clearAll(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Screen stays awake for the whole session.
  useEffect(() => {
    if (done) { wakeLock.current?.release().catch(() => {}); wakeLock.current = null; return; }
    const req = async () => { try { if ("wakeLock" in navigator) wakeLock.current = await navigator.wakeLock.request("screen"); } catch { /* ok */ } };
    req();
    const onVis = () => { if (document.visibilityState === "visible") req(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [done]);

  const step = t.steps[stepIdx];
  const grow = step.kind === "in" || step.kind === "in2";
  const accent = step.kind === "fire" ? "var(--neg)" : step.kind === "hold" || step.kind === "rest" ? "var(--violet)" : "var(--cyan)";

  if (done) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "var(--bg-deep)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 64 }}>✓</div>
        <h1 style={{ fontSize: 28, fontWeight: 600 }}>{t.name} done</h1>
        <p style={{ color: "var(--ink-3)", fontSize: 16 }}>{cycles} {t.id === "kapalabhati" ? "rounds" : "cycles"} · {totalLabel(t, cycles).replace("~", "")} · ticked on today&rsquo;s list</p>
        <button className="cc-btn cc-btn-primary" onClick={() => router.push("/today")} style={{ minHeight: 56, fontSize: 18, borderRadius: 14, width: "min(320px, 100%)", marginTop: 12 }}>
          Back to Today
        </button>
        <button className="cc-btn cc-btn-ghost" onClick={onExit} style={{ minHeight: 48, borderRadius: 12 }}>Pick another</button>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "var(--bg-deep)", display: "flex", flexDirection: "column", padding: "calc(env(safe-area-inset-top) + 16px) 20px calc(env(safe-area-inset-bottom) + 20px)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontFamily: "var(--f-mono)", fontSize: 14, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-3)" }}>
          {t.name} · {t.id === "kapalabhati" ? "round" : "cycle"} {cycle} of {cycles}
        </span>
        <span style={{ flex: 1 }} />
        <button onClick={onExit} aria-label="Exit" className="cc-btn cc-btn-ghost" style={{ minWidth: 44, minHeight: 44, padding: 0, borderRadius: 12 }}>✕</button>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 18 }}>
        <div aria-hidden style={{
          width: 190, height: 190, borderRadius: "50%",
          border: `3px solid ${accent}`,
          background: "color-mix(in srgb, var(--bg-card) 70%, transparent)",
          transform: step.kind === "fire" ? (fireCount % 2 ? "scale(0.94)" : "scale(1.0)") : step.kind === "in2" ? "scale(1.32)" : grow ? "scale(1.22)" : step.kind === "out" ? "scale(0.86)" : "scale(1.0)",
          transition: step.kind === "fire" ? "transform 0.25s ease" : `transform ${step.seconds}s cubic-bezier(.45,0,.55,1)`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span className="tabular-nums" style={{ fontSize: 64, fontWeight: 200, lineHeight: 1, color: "var(--ink)" }}>
            {count !== null ? count : step.kind === "fire" ? fireCount : remaining !== null ? remaining : ""}
          </span>
        </div>
        <div style={{ fontSize: 20, fontWeight: 600, color: "var(--ink)" }}>{count !== null ? "Get ready" : step.label}</div>
        <div style={{ fontSize: 15, color: "var(--ink-3)" }}>{count !== null ? "breathe normally · we start on zero" : t.patternWords}</div>
      </div>

      <div style={{ minHeight: 40 }} />
    </div>
  );
}

// ─── Technique detail · info + duration + start ───────────────────────────────

function TechniqueScreen({ t, onBack }: { t: Technique; onBack: () => void }) {
  const { style, vol, pickStyle, pickVol } = useSoundPrefs();
  const [cycles, setCycles] = useState(t.durations[0].cycles);
  const [playing, setPlaying] = useState(false);

  const chip = (on: boolean): React.CSSProperties => ({
    minHeight: 44, padding: "0 12px", borderRadius: 10, fontSize: 15, font: "inherit", cursor: "pointer",
    border: `1px solid ${on ? "var(--violet)" : "var(--line-hi)"}`,
    background: on ? "var(--accent-soft)" : "var(--fill-1)", color: "var(--ink)",
  });

  if (playing) return <GenericPlayer t={t} cycles={cycles} style={style} vol={vol} onExit={() => setPlaying(false)} />;

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 560, margin: "0 auto", width: "100%" }}>
      <div className="cc-pagetitle" style={{ marginBottom: 0 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600 }}>{t.name}</h1>
          <div className="sub">{t.tagline} · <span style={{ color: GOAL_COLOR[t.goal] }}>{t.goal}</span></div>
        </div>
      </div>

      <button className="cc-btn cc-btn-primary" onClick={() => { synth.arm(); setPlaying(true); }} style={{ minHeight: 64, fontSize: 19, borderRadius: 16, width: "100%" }}>
        ▶ Start · {totalLabel(t, cycles).replace("~", "")}
      </button>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {t.durations.map((d) => (
          <button key={d.label} onClick={() => setCycles(d.cycles)} aria-pressed={cycles === d.cycles} style={chip(cycles === d.cycles)}>{d.label}</button>
        ))}
      </div>

      <section className="cc-card">
        <div className="cc-card-head"><span className="title">The pattern</span><span className="tail" style={{ fontFamily: "var(--f-mono)" }}>{t.pattern}</span></div>
        <div className="cc-card-body" style={{ display: "grid", gap: 10, fontSize: 15, lineHeight: 1.55, color: "var(--ink-2)" }}>
          <p style={{ margin: 0, color: "var(--ink)", fontFamily: "var(--f-mono)", fontSize: 14 }}>{t.patternWords}</p>
          <p style={{ margin: 0 }}>{t.what}</p>
          <p style={{ margin: 0 }}>{t.effect}</p>
          <p style={{ margin: 0, fontSize: 14, color: "var(--ink-3)" }}>{t.evidenceNote}</p>
        </div>
      </section>

      <section className="cc-card">
        <div className="cc-card-head"><span className="title">Breath sound</span><span className="tail">{STYLES.find((s) => s.key === style)?.label} · {vol}%</span></div>
        <div className="cc-card-body" style={{ display: "grid", gap: 10 }}>
          <SoundPicker style={style} onPick={(k) => { pickStyle(k); synth.arm(); synth.breath("in", k, 1100, vol / 100); }} chip={chip} />
          <input type="range" min={0} max={100} step={5} value={vol} onChange={(e) => pickVol(Number(e.target.value))} onPointerUp={() => { synth.arm(); synth.breath("in", style, 1100, vol / 100); }} style={{ width: "100%", accentColor: "var(--violet)", minHeight: 32 }} />
        </div>
      </section>

      <button onClick={onBack} style={{ fontSize: 15, color: "var(--ink-3)", background: "transparent", border: "none", font: "inherit", cursor: "pointer", textAlign: "left", padding: 0, minHeight: 44 }}>← All techniques</button>
    </div>
  );
}

// ─── The picker · default view of /breathe ────────────────────────────────────

export default function BreathePage() {
  const [view, setView] = useState<string>("pick");

  if (view === "wimhof") return <WimHofScreen onBack={() => setView("pick")} />;
  const chosen = techniqueById(view);
  if (chosen) return <TechniqueScreen t={chosen} onBack={() => setView("pick")} />;

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 560, margin: "0 auto", width: "100%" }}>
      <div className="cc-pagetitle" style={{ marginBottom: 0 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600 }}>Breathing</h1>
          <div className="sub">pick for how you feel right now</div>
        </div>
      </div>

      {/* Wim Hof · the daily one, first and biggest */}
      <button onClick={() => setView("wimhof")} className="cc-card" style={{ display: "grid", gap: 4, padding: "16px 18px", textAlign: "left", border: "1px solid var(--violet)", cursor: "pointer", font: "inherit", color: "var(--ink)", width: "100%" }}>
        <span style={{ fontSize: 18, fontWeight: 600 }}>Wim Hof <span style={{ fontSize: 13, color: "var(--violet)", fontWeight: 500 }}>· your daily</span></span>
        <span style={{ fontSize: 14.5, color: "var(--ink-3)" }}>energy + stress reset · 3 rounds · ~12 min · <span style={{ color: GOAL_COLOR.Energy }}>Energy</span></span>
      </button>

      <section className="cc-card">
        <div className="cc-card-head"><span className="title">Techniques</span><span className="tail">strongest evidence first</span></div>
        <div className="cc-card-body" style={{ display: "grid", padding: "0 0 6px" }}>
          {TECHNIQUES.map((t, i) => (
            <button key={t.id} onClick={() => setView(t.id)}
              style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", minHeight: 62, padding: "8px 16px", background: "transparent", border: "none", borderBottom: i < TECHNIQUES.length - 1 ? "1px solid var(--line)" : "none", textAlign: "left", color: "inherit", font: "inherit", cursor: "pointer" }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 16.5, fontWeight: 600 }}>{t.name}</span>
                <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)", marginTop: 1 }}>{t.tagline}</span>
              </span>
              <span style={{ display: "grid", justifyItems: "end", gap: 3 }}>
                <span style={{ fontSize: 13, color: GOAL_COLOR[t.goal] }}>{t.goal}</span>
                <span style={{ fontSize: 13, color: "var(--ink-3)", fontFamily: "var(--f-mono)" }}>{durationRange(t)}</span>
              </span>
            </button>
          ))}
        </div>
      </section>


      <Link href="/today" style={{ fontSize: 15, color: "var(--ink-3)", textDecoration: "none", minHeight: 44, display: "inline-flex", alignItems: "center" }}>← Back to Today</Link>
    </div>
  );
}
