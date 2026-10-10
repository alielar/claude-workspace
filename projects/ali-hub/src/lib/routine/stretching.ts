/**
 * Morning mobility · ONE session since 2026-10-10 (Ali: "this is my new routine, remove all the
 * other mobility routines"): the 15 standing moves of NEXT Workout's "DO THIS EVERY MORNING
 * After Waking Up" (youtu.be/8YOTIyUwxTU), in the video's order, then a floor finish with the
 * five Ali kept from the old sessions (90/90 switches, pigeon both sides, cobra, happy baby,
 * child's pose) · they cover what the video skips: deep hip opening, a long spine extension,
 * a lying inner-thigh release, the calm close. The app counts time, not reps: each move gets
 * the seconds its reps take at the video's pace. 5 s between moves (Ali: "just time to move to
 * the other position", not a rest), 5 s lead-in · 640 s work + 20 × 5 s + 5 s = 745 s ≈ 12:25.
 * The video is embedded on the idle screen (`STRETCH_VIDEO`) until Ali hides it (`cc-stretch-video-hidden`).
 * (Shown as "Mobility" everywhere since 2026-09-12; the route stays /stretch and the
 * checklist routineKey stays "stretch" so nothing installed on the phone breaks.)
 *
 * The three old sessions (hips · spine/shoulders · spine, 10:00 each, in sequence by calendar
 * day with a pick for the morning) are in git before this commit; their MOVE_TARGETS and
 * default names stay here so a rename stored by key or a stale snapshot still reads right.
 *
 * Every move has a stable `key`. Ali's renames on the phone are stored BY KEY
 * (localStorage cc-stretch-names-v3).
 */

export const STRETCH_LEADIN_SECONDS = 5;
export const STRETCH_REST_SECONDS = 5;

export type StretchMove = { key: string; name: string; seconds: number; block: number };

export const STRETCH_BLOCKS = [
  "Standing · the video",
  "Floor",
  "Lying",
  "Finish",
];

/** The video the standing block comes from · embedded on the idle screen until hidden. */
export const STRETCH_VIDEO = { id: "8YOTIyUwxTU", title: "Do this every morning after waking up", channel: "NEXT Workout", url: "https://youtu.be/8YOTIyUwxTU" };
export const STRETCH_VIDEO_HIDDEN_KEY = "cc-stretch-video-hidden";

/** What each movement is for · shown nowhere yet, kept as the single source of truth. */
export const MOVE_TARGETS: Record<string, string> = {
  "bounce":       "calves, ankles · wakes the legs up",
  "neck":         "neck rotation",
  "around-world": "shoulders, full circle · upper back",
  "torso":        "thoracic rotation",
  "squat-hold":   "ankles, hips, deep-squat position (static)",
  "hindu":        "knees, calves, squat pattern (dynamic)",
  "cossack":      "inner thighs, hips side to side, ankles",
  "down-dog":     "hamstrings, calves, shoulders",
  "wgs-l":        "hip flexors, hamstrings, thoracic rotation · left",
  "wgs-r":        "hip flexors, hamstrings, thoracic rotation · right",
  "9090":         "hip internal and external rotation",
  "pigeon-l":     "glutes, deep hip rotators · left",
  "pigeon-r":     "glutes, deep hip rotators · right",
  "kneel-ham-l":  "hamstrings · left",
  "kneel-ham-r":  "hamstrings · right",
  "happy-baby":   "groin, inner thighs, lower back",
  "seiza":        "knees, ankles, quads (out of the sessions since 2026-10-03, key kept for renames)",
  "seated-toe":   "hamstrings, calves, lower back · seated, reach for the toes",
  "cat-cow":      "spine flexion and extension",
  "cobra":        "spine extension, hip flexors, chest",
  "child":        "lower back, calm finish",
  // The video's 15 (2026-10-10)
  "arm-raise":    "shoulders, full range · wakes the upper body",
  "head-turn":    "neck rotation, slow",
  "t-twist":      "thoracic rotation, neck · arms out",
  "arm-circle":   "shoulder circles, both directions",
  "s-stretch":    "lateral line, side body, obliques",
  "round-ab":     "spine flexion to extension, shoulders front and back",
  "hip-oblique":  "hip flexors, obliques · static",
  "hip-circle":   "hips, both directions",
  "wide-reach":   "hamstrings, inner thighs, thoracic rotation · arm to the sky",
  "wide-bounce":  "inner thighs, hamstrings, then the front line",
  "ankle-circle": "ankles, both sides",
  "air-kick":     "hamstrings, hip flexors · dynamic",
  "squat-side":   "ankles, hips, deep squat · side to side",
  "squat-elbow":  "deep squat, hips open, elbows push the knees",
  "horse":        "quads, hips, stance · hold",
  // Session 3 · spine (2026-09-30, retired 2026-10-10, keys kept for renames)
  "side-bend":    "lateral spine, obliques, quadratus lumborum",
  "back-ext":     "lumbar extension, standing · undoes the chair",
  "roll-down":    "segmental flexion, one vertebra at a time · hamstrings",
  "needle-l":     "thoracic rotation, rear shoulder · left",
  "needle-r":     "thoracic rotation, rear shoulder · right",
  "bird-dog":     "spine stability, glutes, deep core",
  "open-book-l":  "thoracic rotation lying, chest · left",
  "open-book-r":  "thoracic rotation lying, chest · right",
  "supine-twist-l": "lumbar rotation, glutes, calm · left",
  "supine-twist-r": "lumbar rotation, glutes, calm · right",
};

const M = (key: string, name: string, seconds: number, block: number): StretchMove => ({ key, name, seconds, block });

/** The one session · the video's 15 standing, then the floor finish · 640 s work. */
export const SESSION_MOVES: StretchMove[] = [
  M("arm-raise",    "180° arm raises · 5",                                 20, 0),
  M("head-turn",    "Slow head turns · 9 per side",                        30, 0),
  M("t-twist",      "T-pose arm twists and head turns · 11 per side",      35, 0),
  M("arm-circle",   "Arm circles · 8 per direction",                       25, 0),
  M("s-stretch",    "Side overhead S stretch · 6 per side",                30, 0),
  M("round-ab",     "Rounded back to ab stretch · 8",                      30, 0),
  M("hip-oblique",  "Static hip oblique stretch · 10 per side",            30, 0),
  M("hip-circle",   "Hip circles · 8 per direction",                       25, 0),
  M("wide-reach",   "Wide stance, touch ground, arm to sky · 7 per side",  35, 0),
  M("wide-bounce",  "Wide stance, triple low bounce to ab stretch · 5",    25, 0),
  M("ankle-circle", "Ankle circles · 13 per side",                         30, 0),
  M("air-kick",     "Air kicks · 10 per side",                             25, 0),
  M("squat-side",   "Deep squat, bounce side to side",                     20, 0),
  M("squat-elbow",  "Deep elbow-to-knee squat",                            20, 0),
  M("horse",        "Horse stance",                                        25, 0),
  M("9090",         "90/90 Switches",                                      45, 1),
  M("pigeon-l",     "Pigeon · Left",                                       40, 1),
  M("pigeon-r",     "Pigeon · Right",                                      40, 1),
  M("cobra",        "Cobra",                                               30, 2),
  M("happy-baby",   "Happy Baby",                                          40, 2),
  M("child",        "Child's Pose",                                        40, 3),
];

export type StretchSession = { name: string; focus: string; moves: StretchMove[] };
export const STRETCH_SESSION: StretchSession = { name: "Morning mobility", focus: "the video's 15, then hips, spine and the close", moves: SESSION_MOVES };

/** Every distinct movement (renames are stored by key). */
export const STRETCH_MOVES: StretchMove[] = SESSION_MOVES;

/** Every name that has ever been a DEFAULT (current list + retired moves). A saved
 * name equal to one of these is a stale snapshot entry, never one of Ali's renames. */
export const DEFAULT_NAMES_EVER = new Set<string>([
  ...STRETCH_MOVES.map((m) => m.name),
  "Seated Toe Stretch", "Seated Toe Touch", "Seiza", "Frog Pose", "Frog", "Butterfly Stretch", "Kneeling Hamstring", "Forearm Stretch",
  "World's Greatest Stretch", "Pigeon", "Down Dog", "Calf Pedal", "Torso Twists", "Lateral Arm Swings", "Toe Touches",
  // The three sessions retired 2026-10-10
  "Bouncing on Toes", "Neck Twists", "Around the World", "Hindu Squats", "Cossack Squats", "Down Dog + Calf Pedal",
  "World's Greatest Stretch · Left", "World's Greatest Stretch · Right", "Squat Hold", "Kneeling Hamstring · Left", "Kneeling Hamstring · Right",
  "Cat Cow", "Standing Side Bends", "Standing Back Extension", "Standing Roll Down", "Thread the Needle · Left", "Thread the Needle · Right",
  "Bird Dog", "Open Book · Left", "Open Book · Right", "Supine Twist · Left", "Supine Twist · Right",
].map((n) => n.toLowerCase()));
export const isDefaultName = (n: string) => DEFAULT_NAMES_EVER.has(n.trim().toLowerCase());

// ARCHIVED 2026-09-14 (Ali: "I know all the movements now · don't delete, archive so I can
// ask for them back"). Instagram reels as learning aids · nothing renders them any more.
// To bring them back: import STRETCH_REELS/reelForMove + ReelRow/useReelDismissals
// (src/components/ReelLink.tsx) in /stretch again · idle-screen list + the mid-session
// "Check the form · pauses the timer" link (git: the commit before this note has both blocks).
// Dismissals still live in localStorage["cc-reels-dismissed"].
export type StretchReel = { id: string; label: string; url: string; moveKey?: string };
export const STRETCH_REELS: StretchReel[] = [
  {
    id: "stretch-routine",
    label: "Full routine reel · most of the moves",
    url: "https://www.instagram.com/reel/Dc57ksLtnVD/?utm_source=ig_web_copy_link&stkn=MzRlODBiNWFlZA==",
  },
];

/** The reel that demonstrates a given movement: its own if it has one, else the full-routine reel. */
export function reelForMove(moves: StretchMove[], index: number): StretchReel {
  const key = moves[index]?.key;
  return STRETCH_REELS.find((r) => r.moveKey === key) ?? STRETCH_REELS.find((r) => r.moveKey === undefined)!;
}

export type StretchPhase =
  | { kind: "leadin"; index: 0; seconds: number }
  | { kind: "work"; index: number; seconds: number }
  | { kind: "rest"; index: number; seconds: number }   // rest[i] sits after move i, announcing move i+1
  | { kind: "done"; index: number; seconds: 0 };

/** The full, flat sequence of phases for one session · 5 s between movements, time to change position. */
export function buildStretchPlan(moves: StretchMove[]): StretchPhase[] {
  const plan: StretchPhase[] = [{ kind: "leadin", index: 0, seconds: STRETCH_LEADIN_SECONDS }];
  moves.forEach((m, i) => {
    plan.push({ kind: "work", index: i, seconds: m.seconds });
    if (i < moves.length - 1) plan.push({ kind: "rest", index: i, seconds: STRETCH_REST_SECONDS });
  });
  plan.push({ kind: "done", index: moves.length - 1, seconds: 0 });
  return plan;
}

export const sessionSeconds = (moves: StretchMove[]) => buildStretchPlan(moves).reduce((s, p) => s + p.seconds, 0);
/** The session's length · the number shown on cards. */
export const STRETCH_TOTAL_SECONDS = sessionSeconds(SESSION_MOVES);
