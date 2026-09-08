/**
 * Morning stretching routine · 20 movements in 4 blocks, 12:00 total (2026-09-08).
 *
 * Continuous flow, NO rest gaps — durations vary per movement so the block
 * markers land exactly (Ali's reel): dynamic standing moves 30 s, floor/hip
 * holds 40 s, the grounded finish 50 s. 5 s lead-in on top.
 *   Block 1 · wake-up and spine     0:00–2:30 (5 × 30 s)
 *   Block 2 · standing to floor     2:30–5:00 (5 × 30 s)
 *   Block 3 · floor and hips        5:00–9:30 (6 × 40 s + 30 s)
 *   Block 4 · grounded finish       9:30–12:00 (3 × 50 s)
 */

export const STRETCH_LEADIN_SECONDS = 5;

export type StretchMove = { name: string; seconds: number; block: number };

export const STRETCH_BLOCKS = [
  "Wake-up and spine",
  "Standing to floor",
  "Floor and hips",
  "Grounded finish",
];

export const STRETCH_MOVES: StretchMove[] = [
  // Block 1 · 0:00–2:30
  { name: "Bouncing on Toes",                    seconds: 30, block: 0 },
  { name: "Neck Twists",                         seconds: 30, block: 0 },
  { name: "Torso Twists",                        seconds: 30, block: 0 },
  { name: "Squat Hold",                          seconds: 30, block: 0 },
  { name: "Seated Toe Stretch",                  seconds: 30, block: 0 },
  // Block 2 · 2:30–5:00
  { name: "Lateral Arm Swings",                  seconds: 30, block: 1 },
  { name: "Down Dog + Calf Pedal",               seconds: 30, block: 1 },
  { name: "World's Greatest Stretch · Left",     seconds: 30, block: 1 },
  { name: "World's Greatest Stretch · Right",    seconds: 30, block: 1 },
  { name: "Toe Touches",                         seconds: 30, block: 1 },
  // Block 3 · 5:00–9:30
  { name: "90/90 Switches",                      seconds: 40, block: 2 },
  { name: "Pigeon · Left",                       seconds: 40, block: 2 },
  { name: "Pigeon · Right",                      seconds: 40, block: 2 },
  { name: "Frog Pose",                           seconds: 40, block: 2 },
  { name: "Seiza",                               seconds: 40, block: 2 },
  { name: "Kneeling Hamstring",                  seconds: 40, block: 2 },
  { name: "Forearm Stretch",                     seconds: 30, block: 2 },
  // Block 4 · 9:30–12:00
  { name: "Cat Cow",                             seconds: 50, block: 3 },
  { name: "Cobra",                               seconds: 50, block: 3 },
  { name: "Child's Pose",                        seconds: 50, block: 3 },
];

// Instagram reels · learning aids, dismissible forever once a move is mastered
// (dismissals live in localStorage["cc-reels-dismissed"], see src/components/ReelLink.tsx).
export type StretchReel = { id: string; label: string; url: string; moveIndex?: number };
export const STRETCH_REELS: StretchReel[] = [
  {
    id: "stretch-toe-touches",
    label: "Toe touches · how-to reel",
    url: "https://www.instagram.com/reel/DdB9heostpA/?utm_source=ig_web_copy_link&stkn=MzRlODBiNWFlZA==",
    moveIndex: 9,
  },
  {
    id: "stretch-routine",
    label: "Full routine reel · every other move",
    url: "https://www.instagram.com/reel/Dc57ksLtnVD/?utm_source=ig_web_copy_link&stkn=MzRlODBiNWFlZA==",
  },
];

export type StretchPhase =
  | { kind: "leadin"; index: 0; seconds: number }
  | { kind: "work"; index: number; seconds: number }
  | { kind: "rest"; index: number; seconds: number }   // kept in the type for compat · the plan no longer produces rests
  | { kind: "done"; index: number; seconds: 0 };

/** The full, flat sequence of phases · continuous, no rests. */
export function buildStretchPlan(): StretchPhase[] {
  const plan: StretchPhase[] = [{ kind: "leadin", index: 0, seconds: STRETCH_LEADIN_SECONDS }];
  STRETCH_MOVES.forEach((m, i) => plan.push({ kind: "work", index: i, seconds: m.seconds }));
  plan.push({ kind: "done", index: STRETCH_MOVES.length - 1, seconds: 0 });
  return plan;
}

export const STRETCH_TOTAL_SECONDS = buildStretchPlan().reduce((s, p) => s + p.seconds, 0);
