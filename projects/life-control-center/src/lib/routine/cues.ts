"use client";

/**
 * Sound, voice and vibration cues for timers.
 * Everything here is offline and needs no permission. The AudioContext must
 * be created from a user tap (iOS rule) — call `cues.arm()` in the Start handler.
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
    } catch { /* no audio — vibration still works */ }
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

  private vibrate(pattern: number | number[]) {
    try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
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

  /** Rest begins. The next movement's name is NOT spoken here — it is announced
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

  /** Whole routine finished. */
  done() {
    this.play([{ freq: 784, ms: 140 }, { freq: 988, ms: 140 }, { freq: 1318, ms: 260 }]);
    this.vibrate([200, 100, 200, 100, 400]);
    this.say("Done. Nice work.");
  }
}

export const cues = new Cues();
