/**
 * Morning mobility routine · 21 movements in 4 blocks, 12:00 total (2026-09-12, evening).
 * (Shown as "Mobility" everywhere since 2026-09-12; the route stays /stretch and the
 * checklist routineKey stays "stretch" so nothing installed on the phone breaks.)
 *
 * Every movement gets the duration it actually needs (Ali's rule 2026-09-10: my
 * judgement per move, 10 s rest between EVERY movement) and the whole thing fits
 * 12 minutes including rests (Ali 2026-09-12): dynamic warm-ups 15–25 s, deep floor
 * holds 30–35 s, the closing pose 30 s. Forearm Stretch removed the same day.
 * 5 s lead-in, 20 × 10 s rests. Work 8:35 + rest 3:20 + lead-in 0:05 = 12:00.
 *   Block 1 · wake-up and spine     starts 0:05
 *   Block 2 · standing to floor     starts 3:10
 *   Block 3 · floor and hips        starts 6:00
 *   Block 4 · grounded finish       starts 10:25 · ends 12:00
 *
 * Every move has a stable `key`. Ali's renames on the phone are stored BY KEY
 * (localStorage cc-stretch-names-v3) · the old positional snapshot (v2) is what
 * painted "Seated Toe Stretch" / "Frog Pose" over the new list on 2026-09-11 and
 * is migrated once (genuine renames kept, stale defaults dropped) in /stretch.
 *
 * 2026-09-12 (Ali): Hindu squats AND Cossack squats both in block 1 (Cossack takes
 * the seated-toe slot: dynamic and satisfying), Happy Baby replaces Frog/Butterfly
 * (same groin + inner-thigh + hip target, on the back, no knee pressure), Kneeling
 * Hamstring is a Left / Right pair, Child's Pose once at the end.
 */

export const STRETCH_LEADIN_SECONDS = 5;
export const STRETCH_REST_SECONDS = 10;

export type StretchMove = { key: string; name: string; seconds: number; block: number };

export const STRETCH_BLOCKS = [
  "Wake-up and spine",
  "Standing to floor",
  "Floor and hips",
  "Grounded finish",
];

export const STRETCH_MOVES: StretchMove[] = [
  // Block 1 · dynamic wake-up: short and lively, the holds come later.        125 s
  { key: "bounce",     name: "Bouncing on Toes",                  seconds: 15, block: 0 },
  { key: "neck",       name: "Neck Twists",                       seconds: 20, block: 0 },
  { key: "torso",      name: "Torso Twists",                      seconds: 20, block: 0 },
  { key: "squat-hold", name: "Squat Hold",                        seconds: 20, block: 0 },
  { key: "hindu",      name: "Hindu Squats",                      seconds: 25, block: 0 },
  { key: "cossack",    name: "Cossack Squats",                    seconds: 25, block: 0 },
  // Block 2 · standing to floor                                                120 s
  { key: "arm-swings", name: "Lateral Arm Swings",                seconds: 15, block: 1 },
  { key: "down-dog",   name: "Down Dog + Calf Pedal",             seconds: 30, block: 1 },
  { key: "wgs-l",      name: "World's Greatest Stretch · Left",   seconds: 25, block: 1 },
  { key: "wgs-r",      name: "World's Greatest Stretch · Right",  seconds: 25, block: 1 },
  { key: "toe-touch",  name: "Toe Touches",                       seconds: 25, block: 1 },
  // Block 3 · deep hip holds keep the most time · still the longest block.    195 s
  { key: "9090",       name: "90/90 Switches",                    seconds: 25, block: 2 },
  { key: "pigeon-l",   name: "Pigeon · Left",                     seconds: 35, block: 2 },
  { key: "pigeon-r",   name: "Pigeon · Right",                    seconds: 35, block: 2 },
  { key: "happy-baby", name: "Happy Baby",                        seconds: 30, block: 2 },
  { key: "seiza",      name: "Seiza",                             seconds: 20, block: 2 },
  { key: "kneel-ham-l", name: "Kneeling Hamstring · Left",        seconds: 25, block: 2 },
  { key: "kneel-ham-r", name: "Kneeling Hamstring · Right",       seconds: 25, block: 2 },
  // Block 4 · grounded finish · a calm, not long, ending.                       75 s
  { key: "cat-cow",    name: "Cat Cow",                           seconds: 25, block: 3 },
  { key: "cobra",      name: "Cobra",                             seconds: 20, block: 3 },
  { key: "child",      name: "Child's Pose",                      seconds: 30, block: 3 },
];

/** Every name that has ever been a DEFAULT (current list + retired moves). A saved
 * name equal to one of these is a stale snapshot entry, never one of Ali's renames. */
export const DEFAULT_NAMES_EVER = new Set<string>([
  ...STRETCH_MOVES.map((m) => m.name),
  "Seated Toe Stretch", "Frog Pose", "Frog", "Butterfly Stretch", "Kneeling Hamstring", "Forearm Stretch",
  "World's Greatest Stretch", "Pigeon", "Down Dog", "Calf Pedal", "Torso Twists",
].map((n) => n.toLowerCase()));
export const isDefaultName = (n: string) => DEFAULT_NAMES_EVER.has(n.trim().toLowerCase());

// Instagram reels · learning aids, dismissible forever once a move is mastered
// (dismissals live in localStorage["cc-reels-dismissed"], see src/components/ReelLink.tsx).
export type StretchReel = { id: string; label: string; url: string; moveKey?: string };
export const STRETCH_REELS: StretchReel[] = [
  {
    id: "stretch-toe-touches",
    label: "Toe touches · how-to reel",
    url: "https://www.instagram.com/reel/DdB9heostpA/?utm_source=ig_web_copy_link&stkn=MzRlODBiNWFlZA==",
    moveKey: "toe-touch",
  },
  {
    id: "stretch-routine",
    label: "Full routine reel · every other move",
    url: "https://www.instagram.com/reel/Dc57ksLtnVD/?utm_source=ig_web_copy_link&stkn=MzRlODBiNWFlZA==",
  },
];

/** The reel that demonstrates a given movement: its own if it has one, else the full-routine reel. */
export function reelForMove(index: number): StretchReel {
  const key = STRETCH_MOVES[index]?.key;
  return STRETCH_REELS.find((r) => r.moveKey === key) ?? STRETCH_REELS.find((r) => r.moveKey === undefined)!;
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
