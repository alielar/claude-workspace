/**
 * Sounds on actions (Settings → Sounds, 2026-10-07 · Ali: "sounds as a setting"): the chime on a
 * ticked to-do or routine step. On by default; the key is `cc-sounds` ("off" silences it). The
 * timers and the training player keep their own cues, they are the session itself.
 */
const KEY = "cc-sounds";
export function soundsOn(): boolean { try { return localStorage.getItem(KEY) !== "off"; } catch { return true; } }
export function setSoundsOn(on: boolean) { try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* ignore */ } }
