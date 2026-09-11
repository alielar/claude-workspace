/**
 * Morning stretching routine · 22 movements in 4 blocks, 14:40 total (2026-09-12).
 *
 * Every movement gets the duration it actually needs (Ali's rule 2026-09-10:
 * my judgement per move, 10 s rest between EVERY movement, total under 15:00):
 * dynamic warm-ups 20–30 s, deep floor holds 40–45 s, the closing pose 50 s.
 * 5 s lead-in, 21 × 10 s rests. Work 11:05 + rest 3:30 + lead-in 0:05 = 14:40.
 *   Block 1 · wake-up and spine     starts 0:05
 *   Block 2 · standing to floor     starts 3:30
 *   Block 3 · floor and hips        starts 6:45
 *   Block 4 · grounded finish       starts 12:30 · ends 14:40
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
  // Block 1 · dynamic wake-up: short and lively, the holds come later.
  { key: "bounce",     name: "Bouncing on Toes",                  seconds: 20, block: 0 },
  { key: "neck",       name: "Neck Twists",                       seconds: 20, block: 0 },
  { key: "torso",      name: "Torso Twists",                      seconds: 20, block: 0 },
  { key: "squat-hold", name: "Squat Hold",                        seconds: 25, block: 0 },
  { key: "hindu",      name: "Hindu Squats",                      seconds: 30, block: 0 },
  { key: "cossack",    name: "Cossack Squats",                    seconds: 30, block: 0 },
  // Block 2 · standing to floor
  { key: "arm-swings", name: "Lateral Arm Swings",                seconds: 20, block: 1 },
  { key: "down-dog",   name: "Down Dog + Calf Pedal",             seconds: 35, block: 1 },
  { key: "wgs-l",      name: "World's Greatest Stretch · Left",   seconds: 30, block: 1 },
  { key: "wgs-r",      name: "World's Greatest Stretch · Right",  seconds: 30, block: 1 },
  { key: "toe-touch",  name: "Toe Touches",                       seconds: 30, block: 1 },
  // Block 3 · deep hip holds need real time to release · the longest block.
  { key: "9090",       name: "90/90 Switches",                    seconds: 30, block: 2 },
  { key: "pigeon-l",   name: "Pigeon · Left",                     seconds: 45, block: 2 },
  { key: "pigeon-r",   name: "Pigeon · Right",                    seconds: 45, block: 2 },
  { key: "happy-baby", name: "Happy Baby",                        seconds: 40, block: 2 },
  { key: "seiza",      name: "Seiza",                             seconds: 25, block: 2 },
  { key: "kneel-ham-l", name: "Kneeling Hamstring · Left",        seconds: 30, block: 2 },
  { key: "kneel-ham-r", name: "Kneeling Hamstring · Right",       seconds: 30, block: 2 },
  { key: "forearm",    name: "Forearm Stretch",                   seconds: 20, block: 2 },
  // Block 4 · grounded finish · child's pose stays the long calm ending.
  { key: "cat-cow",    name: "Cat Cow",                           seconds: 30, block: 3 },
  { key: "cobra",      name: "Cobra",                             seconds: 30, block: 3 },
  { key: "child",      name: "Child's Pose",                      seconds: 50, block: 3 },
];

/** Every name that has ever been a DEFAULT (current list + retired moves). A saved
 * name equal to one of these is a stale snapshot entry, never one of Ali's renames. */
export const DEFAULT_NAMES_EVER = new Set<string>([
  ...STRETCH_MOVES.map((m) => m.name),
  "Seated Toe Stretch", "Frog Pose", "Frog", "Butterfly Stretch", "Kneeling Hamstring",
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
