"use client";

/**
 * Sound, voice and vibration cues for timers.
 * Everything here is offline and needs no permission. The AudioContext must
 * be created from a user tap (iOS rule) · call `cues.arm()` in the Start handler.
 */

type Tone = { freq: number; ms: number; gap?: number };

class Cues {
  private ctx: AudioContext | null = null;
  private voiceOn = true;

  /** Create/resume the audio context. Call from a tap handler. */
  arm() {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      if (!this.ctx) this.ctx = new Ctx();
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      // A silent blip keeps the context "used" so iOS lets us play later.
      this.play([{ freq: 440, ms: 1 }], 0.0001);
    } catch { /* no audio · vibration still works */ }
  }

  setVoice(on: boolean) { this.voiceOn = on; }

  private play(tones: Tone[], volume = 0.25) {
    const ctx = this.ctx;
    if (!ctx) return;
    let t = ctx.currentTime;
    for (const tone of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = tone.freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(volume, t + 0.01);
      gain.gain.linearRampToValueAtTime(0, t + tone.ms / 1000);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + tone.ms / 1000 + 0.02);
      t += (tone.ms + (tone.gap ?? 60)) / 1000;
    }
  }

  /** One shaped note: optional pitch sweep, attack, exponential tail. `at` = ms from now. */
  private tone(o: { type?: OscillatorType; from: number; to?: number; at?: number; ms: number; vol?: number; attack?: number }) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + (o.at ?? 0) / 1000;
    const end = t0 + o.ms / 1000;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = o.type ?? "sine";
    osc.frequency.setValueAtTime(o.from, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, end);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(o.vol ?? 0.25, t0 + (o.attack ?? 8) / 1000);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(end + 0.03);
  }

  private vibrate(pattern: number | number[]) {
    try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
  }

  /** AMRAP round done: the bell lands (low thud + knock), then a bright two-note lift.
   * Past the record the lift sits a third higher, so every extra round sounds like a win. */
  round(aboveRecord = false) {
    this.tone({ from: 150, to: 55, ms: 220, vol: 0.5, attack: 4 });
    this.tone({ type: "triangle", from: 330, to: 60, ms: 110, vol: 0.12, attack: 2 });
    const base = aboveRecord ? 784 : 659;
    this.tone({ from: base, ms: 140, vol: 0.14, at: 70 });
    this.tone({ from: base * 4 / 3, ms: 280, vol: 0.12, at: 160 });
    this.vibrate(aboveRecord ? [30, 30, 90] : [30, 30, 60]);
  }

  /** The moment the number to beat falls: a low drone under a rising four-note arpeggio. */
  record() {
    this.tone({ from: 110, ms: 1500, vol: 0.18, attack: 40 });
    this.tone({ type: "triangle", from: 220, ms: 1500, vol: 0.05, attack: 40 });
    const notes: [number, number][] = [[440, 0], [554.4, 130], [659.3, 260], [880, 400]];
    notes.forEach(([f, at], i) => {
      const ms = i === notes.length - 1 ? 950 : 260;
      this.tone({ from: f, ms, vol: 0.2, at });
      this.tone({ type: "triangle", from: f * 2, ms, vol: 0.04, at });
    });
    this.vibrate([80, 40, 80, 40, 300]);
  }

  /** Speak a short phrase (movement name). Cancels anything still speaking. */
  say(text: string) {
    if (!this.voiceOn) return;
    try {
      if (!("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-GB";
      u.rate = 1.0;
      window.speechSynthesis.speak(u);
    } catch { /* ignore */ }
  }

  /** New movement starts. */
  work(name?: string) {
    this.play([{ freq: 880, ms: 120 }, { freq: 1175, ms: 160 }]);
    this.vibrate([120, 60, 120]);
    if (name) this.say(name);
  }

  /** Rest begins. The next movement's name is NOT spoken here · it is announced
   * once, when the move actually starts (Ali, 2026-09-01: it was said twice). */
  rest(nextName?: string) {
    this.play([{ freq: 523, ms: 180 }]);
    this.vibrate(80);
    void nextName;
    this.say("Rest");
  }

  /** Last three seconds of a phase. */
  tick() {
    this.play([{ freq: 660, ms: 60 }], 0.12);
  }

  /** Stop anything still talking · call when leaving a timer screen, otherwise a
   * queued phrase can come out seconds later with no visible cause. */
  silence() {
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
  }

  /** Whole routine finished. */
  done() {
    this.play([{ freq: 784, ms: 140 }, { freq: 988, ms: 140 }, { freq: 1318, ms: 260 }]);
    this.vibrate([200, 100, 200, 100, 400]);
    this.say("Done. Nice work.");
  }
}

export const cues = new Cues();
