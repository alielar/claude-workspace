/**
 * Morning stretching routine · 21 movements in 4 blocks, 14:55 total (2026-09-11).
 *
 * Every movement gets the duration it actually needs (Ali's rule 2026-09-10:
 * my judgement per move, 10 s rest between EVERY movement, total under 15:00):
 * dynamic warm-ups 20–35 s, deep floor holds 30–45 s, the closing pose 50 s.
 * 5 s lead-in, 20 × 10 s rests. Work 11:30 + rest 3:20 + lead-in 0:05 = 14:55.
 *   Block 1 · wake-up and spine     starts 0:05
 *   Block 2 · standing to floor     starts 3:05
 *   Block 3 · floor and hips        starts 6:35
 *   Block 4 · grounded finish       starts 12:35 · ends 14:55
 *
 * 2026-09-11 changes (Ali): Hindu squats are back (they take the old seated-toe /
 * Cossack slot · dynamic and satisfying, 21 moves total was the cleanest count),
 * Happy Baby replaces Butterfly/Frog (same groin + inner-thigh + hip target, lying
 * on the back so nothing presses into the knees), Kneeling Hamstring is now a
 * proper Left / Right pair like World's Greatest Stretch.
 */

export const STRETCH_LEADIN_SECONDS = 5;
export const STRETCH_REST_SECONDS = 10;

export type StretchMove = { name: string; seconds: number; block: number };

export const STRETCH_BLOCKS = [
  "Wake-up and spine",
  "Standing to floor",
  "Floor and hips",
  "Grounded finish",
];

export const STRETCH_MOVES: StretchMove[] = [
  // Block 1 · dynamic wake-up: short and lively, the holds come later.
  { name: "Bouncing on Toes",                    seconds: 20, block: 0 },
  { name: "Neck Twists",                         seconds: 25, block: 0 },
  { name: "Torso Twists",                        seconds: 25, block: 0 },
  { name: "Squat Hold",                          seconds: 30, block: 0 },
  // Hindu squats (2026-09-11, back from the old routine) · deep rhythmic squats
  // with the arm swing, heels lifting · replaces the seated toe stretch / Cossack slot.
  { name: "Hindu Squats",                        seconds: 30, block: 0 },
  // Block 2 · standing to floor
  { name: "Lateral Arm Swings",                  seconds: 25, block: 1 },
  { name: "Down Dog + Calf Pedal",               seconds: 35, block: 1 },
  { name: "World's Greatest Stretch · Left",     seconds: 35, block: 1 },
  { name: "World's Greatest Stretch · Right",    seconds: 35, block: 1 },
  { name: "Toe Touches",                         seconds: 30, block: 1 },
  // Block 3 · deep hip holds need real time to release · the longest block.
  { name: "90/90 Switches",                      seconds: 35, block: 2 },
  { name: "Pigeon · Left",                       seconds: 45, block: 2 },
  { name: "Pigeon · Right",                      seconds: 45, block: 2 },
  // Happy Baby replaced Butterfly (2026-09-11; Butterfly had replaced Frog on
  // 2026-09-09 and was still awful) · on the back, knees to armpits, holding the
  // feet · same adductor / groin / hip-opening target, zero knee pressure, restful.
  { name: "Happy Baby",                          seconds: 45, block: 2 },
  { name: "Seiza",                               seconds: 30, block: 2 },
  { name: "Kneeling Hamstring · Left",           seconds: 30, block: 2 },
  { name: "Kneeling Hamstring · Right",          seconds: 30, block: 2 },
  { name: "Forearm Stretch",                     seconds: 20, block: 2 },
  // Block 4 · grounded finish · child's pose stays the long calm ending.
  { name: "Cat Cow",                             seconds: 35, block: 3 },
  { name: "Cobra",                               seconds: 35, block: 3 },
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

/** The reel that demonstrates a given movement: its own if it has one, else the full-routine reel. */
export function reelForMove(index: number): StretchReel {
  return STRETCH_REELS.find((r) => r.moveIndex === index) ?? STRETCH_REELS.find((r) => r.moveIndex === undefined)!;
}

export type StretchPhase =
  | { kind: "leadin"; index: 0; seconds: number }
  | { kind: "work"; index: number; seconds: number }
  | { kind: "rest"; index: number; seconds: number }   // rest[i] sits after move i, announcing move i+1
  | { kind: "done"; index: number; seconds: 0 };

/** The full, flat sequence of phases · 10 s rest between every movement. */
export function buildStretchPlan(): StretchPhase[] {
  const plan: StretchPhase[] = [{ kind: "leadin", index: 0, seconds: STRETCH_LEADIN_SECONDS }];
  STRETCH_MOVES.forEach((m, i) => {
    plan.push({ kind: "work", index: i, seconds: m.seconds });
    if (i < STRETCH_MOVES.length - 1) plan.push({ kind: "rest", index: i, seconds: STRETCH_REST_SECONDS });
  });
  plan.push({ kind: "done", index: STRETCH_MOVES.length - 1, seconds: 0 });
  return plan;
}

export const STRETCH_TOTAL_SECONDS = buildStretchPlan().reduce((s, p) => s + p.seconds, 0);
