/**
 * Morning mobility · THREE sessions of 10:00, in sequence day to day (Ali, 2026-09-14; the
 * third, spine-oriented one from Omar Eissa's reel, 2026-09-29 · pick any of them on the
 * morning, the sequence is only the default).
 * (Shown as "Mobility" everywhere since 2026-09-12; the route stays /stretch and the
 * checklist routineKey stays "stretch" so nothing installed on the phone breaks.)
 *
 * Why two splits: one 12-minute session made every hold feel rushed. Two 10-minute
 * sessions let each movement be held long enough to work (30–50 s on the floor) while
 * still covering the whole body across the pair. Same progression in both: standing
 * warm-up → down to the floor → floor and lying holds → Child's Pose to finish.
 * 10 s rest between every movement, 5 s lead-in, both sessions exactly 600 s.
 *
 * Audit of the old list (2026-09-14): Lateral Arm Swings cut (Around the World does the
 * same shoulder job better, full circle); Toe Touches cut (hamstrings already covered by
 * Down Dog in session 1 and Kneeling Hamstring in session 2); Squat Hold and Hindu Squats
 * split across the sessions (same joints, static vs dynamic); Cobra and Cat Cow kept in
 * session 2 together as the spine pair. Everything else stays, held longer.
 *
 *   Session 1 · hips and the back line     13 moves · standing 6 → floor 7
 *   Session 2 · spine, shoulders, inner line 14 moves · standing 5 → floor 9
 *
 * Which session today: odd day-of-epoch = 1, even = 2, so it alternates every calendar day
 * even when a day is skipped. Picked automatically · no selector on the screen (Ali, 2026-09-14
 * evening: "I tap Start and it runs whichever session is correct for today").
 *
 * Every move has a stable `key`. Ali's renames on the phone are stored BY KEY
 * (localStorage cc-stretch-names-v3), so a move renamed in one session is renamed in both.
 */

export const STRETCH_LEADIN_SECONDS = 5;
export const STRETCH_REST_SECONDS = 10;

export type StretchMove = { key: string; name: string; seconds: number; block: number };
export type SessionKey = 1 | 2 | 3;

export const STRETCH_BLOCKS = [
  "Standing",
  "Down to the floor",
  "Floor and lying",
  "Finish",
];

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
  "seiza":        "knees, ankles, quads",
  "cat-cow":      "spine flexion and extension",
  "cobra":        "spine extension, hip flexors, chest",
  "child":        "lower back, calm finish",
  // Session 3 · spine (2026-09-30)
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

/** Session 1 · hips and the back line · 475 s work + 12 rests + lead-in = 600 s */
export const SESSION_1: StretchMove[] = [
  M("bounce",       "Bouncing on Toes",                 20, 0),
  M("neck",         "Neck Twists",                      25, 0),
  M("around-world", "Around the World",                 35, 0),
  M("torso",        "Torso Twists",                     25, 0),
  M("hindu",        "Hindu Squats",                     30, 0),
  M("cossack",      "Cossack Squats",                   40, 0),
  M("down-dog",     "Down Dog + Calf Pedal",            45, 1),
  M("wgs-l",        "World's Greatest Stretch · Left",  35, 1),
  M("wgs-r",        "World's Greatest Stretch · Right", 35, 1),
  M("9090",         "90/90 Switches",                   45, 2),
  M("pigeon-l",     "Pigeon · Left",                    50, 2),
  M("pigeon-r",     "Pigeon · Right",                   50, 2),
  M("child",        "Child's Pose",                     40, 3),
];

/** Session 2 · spine, shoulders, inner line · 465 s work + 13 rests + lead-in = 600 s */
export const SESSION_2: StretchMove[] = [
  M("bounce",       "Bouncing on Toes",                 20, 0),
  M("neck",         "Neck Twists",                      25, 0),
  M("around-world", "Around the World",                 35, 0),
  M("torso",        "Torso Twists",                     25, 0),
  M("squat-hold",   "Squat Hold",                       40, 0),
  M("wgs-l",        "World's Greatest Stretch · Left",  35, 1),
  M("wgs-r",        "World's Greatest Stretch · Right", 35, 1),
  M("kneel-ham-l",  "Kneeling Hamstring · Left",        40, 2),
  M("kneel-ham-r",  "Kneeling Hamstring · Right",       40, 2),
  M("happy-baby",   "Happy Baby",                       45, 2),
  M("seiza",        "Seiza",                            25, 2),
  M("cat-cow",      "Cat Cow",                          35, 2),
  M("cobra",        "Cobra",                            30, 2),
  M("child",        "Child's Pose",                     35, 3),
];

/**
 * Session 3 · spine (Ali 2026-09-29: "another version of the morning mobility routine, spine
 * oriented", from Omar Eissa's reel "My morning mobility routine for a healthy spine"). The
 * reel's caption names no moves and the video cannot be read from outside Instagram, so this
 * is a standard spine sequence in the same shape as the other two (standing → floor → lying →
 * Child's Pose): flexion, extension, side bend, rotation, stability. Ali swaps in the reel's
 * exact moves by renaming (tap a name) or by sending the list · 450 s work + 14 rests + lead-in = 600 s.
 */
export const SESSION_3: StretchMove[] = [
  M("bounce",         "Bouncing on Toes",             20, 0),
  M("neck",           "Neck Twists",                  20, 0),
  M("side-bend",      "Standing Side Bends",          30, 0),
  M("back-ext",       "Standing Back Extension",      25, 0),
  M("roll-down",      "Standing Roll Down",           30, 0),
  M("cat-cow",        "Cat Cow",                      40, 1),
  M("needle-l",       "Thread the Needle · Left",     30, 1),
  M("needle-r",       "Thread the Needle · Right",    30, 1),
  M("bird-dog",       "Bird Dog",                     35, 1),
  M("cobra",          "Cobra",                        30, 2),
  M("open-book-l",    "Open Book · Left",             30, 2),
  M("open-book-r",    "Open Book · Right",            30, 2),
  M("supine-twist-l", "Supine Twist · Left",          30, 2),
  M("supine-twist-r", "Supine Twist · Right",         30, 2),
  M("child",          "Child's Pose",                 45, 3),
];

export type StretchSession = { key: SessionKey; name: string; focus: string; short: string; moves: StretchMove[]; reel?: { label: string; url: string } };
export const STRETCH_SESSIONS: Record<SessionKey, StretchSession> = {
  1: { key: 1, name: "Session 1", focus: "hips and the back line", short: "Hips · back", moves: SESSION_1 },
  2: { key: 2, name: "Session 2", focus: "spine, shoulders, inner line", short: "Spine · shoulders", moves: SESSION_2 },
  3: { key: 3, name: "Session 3", focus: "spine, the reel routine", short: "Spine · reel", moves: SESSION_3,
       reel: { label: "Omar Eissa's spine routine", url: "https://www.instagram.com/reel/DcbsXEJN294/?stkn=MXgyMGRzdGZpNXB5eA==" } },
};
export const SESSION_KEYS: SessionKey[] = [1, 2, 3];

/** Every distinct movement across the sessions (renames are stored by key). */
export const STRETCH_MOVES: StretchMove[] = [...SESSION_1, ...SESSION_2, ...SESSION_3].filter((m, i, all) => all.findIndex((x) => x.key === m.key) === i);

/** Which session a given day gets by default: 1 → 2 → 3 → 1, one step per calendar day (Europe/Madrid YYYY-MM-DD). */
export function sessionForDate(ymd: string): SessionKey {
  const days = Math.floor(new Date(ymd + "T12:00:00Z").getTime() / 86400000);
  return ((days % 3) + 1) as SessionKey;
}

/** Ali's pick for one morning (localStorage `cc-stretch-pick`) · the sequence takes over again the next day. */
export const STRETCH_PICK_KEY = "cc-stretch-pick";
export function readSessionPick(ymd: string): SessionKey | null {
  try {
    const raw = JSON.parse(localStorage.getItem(STRETCH_PICK_KEY) ?? "null") as { ymd?: string; key?: number } | null;
    return raw && raw.ymd === ymd && SESSION_KEYS.includes(raw.key as SessionKey) ? (raw.key as SessionKey) : null;
  } catch { return null; }
}
export function writeSessionPick(ymd: string, key: SessionKey | null): void {
  try { if (key === null) localStorage.removeItem(STRETCH_PICK_KEY); else localStorage.setItem(STRETCH_PICK_KEY, JSON.stringify({ ymd, key })); } catch { /* ignore */ }
}

/** Every name that has ever been a DEFAULT (current list + retired moves). A saved
 * name equal to one of these is a stale snapshot entry, never one of Ali's renames. */
export const DEFAULT_NAMES_EVER = new Set<string>([
  ...STRETCH_MOVES.map((m) => m.name),
  "Seated Toe Stretch", "Frog Pose", "Frog", "Butterfly Stretch", "Kneeling Hamstring", "Forearm Stretch",
  "World's Greatest Stretch", "Pigeon", "Down Dog", "Calf Pedal", "Torso Twists", "Lateral Arm Swings", "Toe Touches",
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

/** The full, flat sequence of phases for one session · 10 s rest between every movement. */
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
/** Every session is 600 s · this is the number shown on cards. */
export const STRETCH_TOTAL_SECONDS = sessionSeconds(SESSION_1);
