/**
 * Morning stretching routine — 16 movements, 30 s work / 10 s rest.
 * Order is Ali's (spec §4.1a). Total ≈ 16×30 + 15×10 = 10 min 30 s (+ a short lead-in).
 */

export const STRETCH_WORK_SECONDS = 30;
export const STRETCH_REST_SECONDS = 10;
export const STRETCH_LEADIN_SECONDS = 5;

export const STRETCH_MOVES: string[] = [
  "Bouncing on Toes",
  "Torso Rotations",
  "Hip Circles",
  "Lateral Arm Swings",
  "Alternating Windmills",
  "Alternating Cossack Squats",
  "Walk Outs",
  "Down Dog Calf Stretch",
  "Cat Cow",
  "Push Up +",
  "Bootstrapper Squats",
  "World's Greatest Stretch — Left Leg Forward",
  "Around the World",
  "World's Greatest Stretch — Right Leg Forward",
  "90/90",
  "Hindu Squats",
];

export type StretchPhase =
  | { kind: "leadin"; index: 0; seconds: number }
  | { kind: "work"; index: number; seconds: number }
  | { kind: "rest"; index: number; seconds: number }   // rest *after* move `index`
  | { kind: "done"; index: number; seconds: 0 };

/** The full, flat sequence of phases. */
export function buildStretchPlan(): StretchPhase[] {
  const plan: StretchPhase[] = [{ kind: "leadin", index: 0, seconds: STRETCH_LEADIN_SECONDS }];
  STRETCH_MOVES.forEach((_, i) => {
    plan.push({ kind: "work", index: i, seconds: STRETCH_WORK_SECONDS });
    if (i < STRETCH_MOVES.length - 1) plan.push({ kind: "rest", index: i, seconds: STRETCH_REST_SECONDS });
  });
  plan.push({ kind: "done", index: STRETCH_MOVES.length - 1, seconds: 0 });
  return plan;
}

export const STRETCH_TOTAL_SECONDS = buildStretchPlan().reduce((s, p) => s + p.seconds, 0);
