/**
 * The microphone's level while dictating (0..1), published per audio frame by the engine and
 * read by the waveform on R2-D2 through requestAnimationFrame · never through React state, a
 * frame every 90 ms would re-render the page for nothing.
 */
let level = 0;
export function setLevel(rms: number) { level = Math.min(1, rms * 9); }
export function getLevel(): number { return level; }
