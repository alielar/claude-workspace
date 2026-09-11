/**
 * Completion feedback for ticking a to-do (2026-09-08).
 * A soft two-note chime, synthesized live (no asset, works offline). Quiet and
 * warm — reward, not fanfare. The AudioContext is created on first use, inside
 * the tap gesture, so iOS allows it.
 */

let ctx: AudioContext | null = null;

export function playDoneSound() {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const t0 = ctx.currentTime;
    // Two rising notes (A5 → E6), sine body + a faint triangle overtone, fast decay.
    for (const [freq, at, vol] of [[880, 0, 0.14], [1318.5, 0.09, 0.11]] as const) {
      for (const [type, mul, v] of [["sine", 1, vol], ["triangle", 2, vol * 0.2]] as const) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.value = freq * mul;
        g.gain.setValueAtTime(0, t0 + at);
        g.gain.linearRampToValueAtTime(v, t0 + at + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.5);
        o.connect(g).connect(ctx.destination);
        o.start(t0 + at);
        o.stop(t0 + at + 0.55);
      }
    }
  } catch { /* no audio · the animation still plays */ }
}
