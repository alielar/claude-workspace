/**
 * Breathing techniques (2026-09-07, spec: batch "ALSO" item).
 * Six paced techniques next to Wim Hof, each driven by the same generic player:
 * a cycle of steps, repeated N times. Evidence is stated in prose (evidenceNote,
 * shown on the detail screen · no rating dots, Ali 2026-09-08) from the 2026-09-06
 * research pass: coherent breathing has the strongest backing, 4-7-8 is tradition
 * with a plausible mechanism. The list is ordered strongest evidence first.
 */

export type PaceStep = {
  kind: "in" | "in2" | "out" | "hold" | "fire" | "rest";
  seconds: number;
  label: string;
  /** Stereo side for alternate-nostril audio: -1 left, 1 right. */
  pan?: -1 | 1;
};

export type Technique = {
  id: string;
  name: string;
  /** One line for the picker row · "what it's for" in a few words. */
  tagline: string;
  goal: "Calm" | "Sleep" | "Reset" | "Focus" | "Energy";
  /** Compact timing pattern, e.g. "4 · 7 · 8". */
  pattern: string;
  patternWords: string;
  /** 1-3 · how solid the research is. */
  evidence: 1 | 2 | 3;
  evidenceNote: string;
  what: string;
  effect: string;
  durations: { label: string; cycles: number }[];
  steps: PaceStep[];
};

export const TECHNIQUES: Technique[] = [
  {
    id: "coherent",
    name: "Coherent breathing",
    tagline: "daily calm, steady baseline",
    goal: "Calm",
    pattern: "5.5 · 5.5",
    patternWords: "in 5.5 s · out 5.5 s · no holds",
    evidence: 3,
    evidenceNote: "The best-studied technique here: dozens of trials on heart-rate variability, blood pressure and anxiety. Around 5-6 breaths a minute is where the nervous system settles.",
    what: "Slow, even breathing at about five and a half breaths per minute, no holds. Nothing to count beyond in and out.",
    effect: "A calm that builds over 10-20 minutes and lingers after. Gentle · impossible to overdo, fine every day.",
    durations: [
      { label: "5 min", cycles: 27 },
      { label: "10 min", cycles: 55 },
      { label: "15 min", cycles: 82 },
    ],
    steps: [
      { kind: "in", seconds: 5.5, label: "Breathe in" },
      { kind: "out", seconds: 5.5, label: "Breathe out" },
    ],
  },
  {
    id: "sigh",
    name: "Cyclic sighing",
    tagline: "fast mood reset",
    goal: "Reset",
    pattern: "2 + 1 · 5",
    patternWords: "two nose inhales · one long mouth exhale",
    evidence: 2,
    evidenceNote: "One strong Stanford trial (2023): five minutes a day improved mood more than mindfulness meditation. Young but real evidence, and the single sigh works instantly.",
    what: "Breathe in through the nose, top it up with a second short sip of air, then sigh it all out slowly through the mouth.",
    effect: "The fastest calm-down there is · the double inhale pops the lungs' air sacs open, the long exhale slows the heart within a few breaths.",
    durations: [
      { label: "2 min", cycles: 15 },
      { label: "5 min", cycles: 38 },
    ],
    steps: [
      { kind: "in", seconds: 2, label: "Breathe in · nose" },
      { kind: "in2", seconds: 1, label: "Top up" },
      { kind: "out", seconds: 5, label: "Long sigh out" },
    ],
  },
  {
    id: "box",
    name: "Box breathing",
    tagline: "steady yourself before something hard",
    goal: "Focus",
    pattern: "4 · 4 · 4 · 4",
    patternWords: "in 4 s · hold 4 · out 4 · hold 4",
    evidence: 2,
    evidenceNote: "Decent evidence for calming acute stress, widely used by military and clinicians. Works fast; the effect is in the slow, even rhythm.",
    what: "Four equal sides: breathe in, hold full, breathe out, hold empty. Four seconds each.",
    effect: "Steadies you within a couple of minutes without making you sleepy · calm focus, not sedation.",
    durations: [
      { label: "3 min", cycles: 11 },
      { label: "5 min", cycles: 19 },
      { label: "8 min", cycles: 30 },
    ],
    steps: [
      { kind: "in", seconds: 4, label: "Breathe in" },
      { kind: "hold", seconds: 4, label: "Hold" },
      { kind: "out", seconds: 4, label: "Breathe out" },
      { kind: "hold", seconds: 4, label: "Hold empty" },
    ],
  },
  {
    id: "478",
    name: "4-7-8",
    tagline: "falling asleep",
    goal: "Sleep",
    pattern: "4 · 7 · 8",
    patternWords: "in 4 s nose · hold 7 · out 8 mouth",
    evidence: 1,
    evidenceNote: "Modest evidence: the long exhale genuinely slows the heart, but the specific 4-7-8 numbers are Dr Weil's tradition, not science. Consistent reports for sleep.",
    what: "In through the nose for 4, hold for 7, out through the mouth for 8, lips slightly pursed. Four to eight cycles, best done lying in bed.",
    effect: "Strongly sedative · the exhale twice as long as the inhale tips the nervous system toward sleep. Can feel light-headed at first, that fades with practice.",
    durations: [
      { label: "4 cycles", cycles: 4 },
      { label: "8 cycles", cycles: 8 },
    ],
    steps: [
      { kind: "in", seconds: 4, label: "In through the nose" },
      { kind: "hold", seconds: 7, label: "Hold" },
      { kind: "out", seconds: 8, label: "Out through the mouth" },
    ],
  },
  {
    id: "nostril",
    name: "Alternate nostril",
    tagline: "wind down, settle the head",
    goal: "Calm",
    pattern: "4 · 4 · 4 · 4",
    patternWords: "in left · out right · in right · out left",
    evidence: 1,
    evidenceNote: "A few small studies on blood pressure and attention. Gentle and zero-risk · the value is as much the single-pointed focus as the breathing.",
    what: "Close the right nostril with your thumb, breathe in left. Close the left with your ring finger, breathe out right. In right, out left. That's one cycle. With headphones, the sound moves to the side you should breathe on.",
    effect: "Meditative and settling · good before bed or after a loud day. The switching keeps the mind too busy to wander.",
    durations: [
      { label: "5 min", cycles: 19 },
      { label: "10 min", cycles: 38 },
    ],
    steps: [
      { kind: "in", seconds: 4, label: "In · left nostril", pan: -1 },
      { kind: "out", seconds: 4, label: "Out · right nostril", pan: 1 },
      { kind: "in", seconds: 4, label: "In · right nostril", pan: 1 },
      { kind: "out", seconds: 4, label: "Out · left nostril", pan: -1 },
    ],
  },
  {
    id: "kapalabhati",
    name: "Kapalabhati",
    tagline: "wake up, energize",
    goal: "Energy",
    pattern: "30 × 1s",
    patternWords: "30 sharp exhales · 30 s rest · repeat",
    evidence: 1,
    evidenceNote: "Traditional yogic 'breath of fire' · the research is thin, but the immediate wake-up effect is real. The opposite of everything else on this list.",
    what: "Sharp, quick exhales through the nose · one per beat, the belly snaps in, the inhale happens by itself. 30 exhales, then rest and breathe normally for 30 seconds. Two or three rounds.",
    effect: "Energizing like a cold splash · clears morning fog in under three minutes. Expect a light buzz · ease off if you feel dizzy.",
    durations: [
      { label: "2 rounds", cycles: 2 },
      { label: "3 rounds", cycles: 3 },
    ],
    steps: [
      { kind: "fire", seconds: 30, label: "Sharp exhales · one per beat" },
      { kind: "rest", seconds: 30, label: "Rest · breathe normally" },
    ],
  },
];

export const techniqueById = (id: string) => TECHNIQUES.find((t) => t.id === id);

export const cycleSeconds = (t: Technique) => t.steps.reduce((s, x) => s + x.seconds, 0);

export function totalLabel(t: Technique, cycles: number): string {
  const s = Math.round(cycleSeconds(t) * cycles);
  if (s < 45) return `~${s} s`;
  const m = s / 60;
  return `~${m < 3 ? Math.round(m * 2) / 2 : Math.round(m)} min`;
}
