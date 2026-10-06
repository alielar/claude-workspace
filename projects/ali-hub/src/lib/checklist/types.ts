/** Shape returned by GET /api/checklist · shared by the Today screen and the editor. */

export type TimeOfDay = "morning" | "afternoon" | "evening" | "anytime";

/**
 * routine · counts toward the day's streak
 * manual  · "Extra" on screen: something being added (reading), tracked, NEVER counted
 * (Ali 2026-10-03: the third kind, "habit", is gone · old rows were folded into manual.)
 */
export type ItemKind = "routine" | "manual";

/** `gym-legs` and `run` are retired (Ali 2026-10-04: kettlebell and runs cover the legs · then one row per run, sprint and long) · kept in the type so old rows still read. */
export type RoutineKey = "stretch" | "breathe" | "supp-am" | "supp-pm" | "read" | "gym-push" | "gym-pull" | "gym-legs" | "gym-kb" | "run" | "run-sprint" | "run-long" | "mind";

export type ChecklistItem = {
  id: number;
  title: string;
  emoji: string | null;
  sortOrder: number;
  timeOfDay: TimeOfDay;
  kind: ItemKind;
  routineKey: RoutineKey | null;
  completedToday: boolean;
  streak: number;
  last7: boolean[];
  source: "manual" | "workout";
  autoSource: string | null;
  color: string;
  notes: string | null;
  /** Day codes ("mon"…"sun") the item exists on · null = every day. Editable on /checklist (2026-09-14). */
  weekdays?: string[] | null;
  startDate?: string | null;
  /** "HH:MM" · the hour this step is planned for, so the spine can place it. null = no fixed time. */
  atTime?: string | null;
  /** Only in `GET /api/checklist?all=1` (the editor): true when the item is not scheduled for today. */
  hiddenToday?: boolean;
  href?: string;
};

export type ChecklistData = {
  items: ChecklistItem[];
  overallStreak: number;
  monthlyPct: { date: string; pct: number }[];
  thirtyDayAvg: number;
  bestStreak30: number;
};

export const ITEM_COLORS: Record<string, string> = {
  violet: "#7C4DFF",
  cyan:   "#64FFDA",
  green:  "#6FD49A",
  amber:  "#FFC15C",
  red:    "#FF8A8A",
  pink:   "#F472B6",
};

export function itemColor(id: string | null | undefined): string {
  return ITEM_COLORS[id ?? "violet"] ?? ITEM_COLORS.violet;
}

/** Wim Hof guided breathing · the video Ali follows today (a built-in pacer replaces it later). */
export const BREATHING_VIDEO_URL = "https://youtu.be/tybOi4hjZFQ?si=sFm7xUpv-9VcY--k";

/**
 * Built-in routine steps, seeded once (matched by routineKey, never duplicated).
 * Order = order of the morning: stretch → breathe → supplements. Night dose is evening.
 */
export const ROUTINE_SEED: {
  routineKey: RoutineKey;
  title: string;
  emoji: string;
  timeOfDay: TimeOfDay;
  kind: ItemKind;
  color: string;
  notes: string | null;
  sortOrder: number;
  weekdays?: string[];   // day codes · the item only shows on these days
  atTime?: string;       // "HH:MM" · optional planned hour
  startDate?: string;    // hidden before this date
}[] = [
  { routineKey: "stretch", title: "Mobility",            emoji: "🤸", timeOfDay: "morning", kind: "routine", color: "amber",  notes: "2 sessions of 10 minutes, alternating · 10 s rests", sortOrder: -50 },
  // THE PROGRAM (Ali 2026-10-04, starts Monday 2026-10-05 · src/lib/train/program.ts holds what each
  // session is): one session a day, five a week · Mon Push · Tue Sprint run · Wed Pull · Fri Long run ·
  // Sat Kettlebell 30 · Thu and Sun rest. Tickable rows, NEVER counted in the day streak (gym-* excluded
  // in the checklist route; the runs are Extras). Each ticks ITSELF when the Watch posts the matching
  // workout that day (a strength workout on a Push/Pull day, a run on a run day) or when a Kettlebell 30
  // session is finished. The days are seeds · Ali moves a session on Today → Edit; the migrate route
  // moves rows still on old defaults, never ones he changed. `gym-legs` and the single `run` row are retired.
  { routineKey: "gym-push",   title: "Push · Speediance", emoji: "", timeOfDay: "morning", kind: "manual", color: "cyan", notes: "chest · shoulders · triceps · 35 min", sortOrder: -45, weekdays: ["mon"] },
  { routineKey: "run-sprint", title: "Sprint run",        emoji: "", timeOfDay: "morning", kind: "manual", color: "cyan", notes: "10 min easy · 6 × 30 s fast, 90 s walk · 10 min easy", sortOrder: -45, weekdays: ["tue"] },
  { routineKey: "gym-pull",   title: "Pull · Speediance", emoji: "", timeOfDay: "morning", kind: "manual", color: "cyan", notes: "back · biceps · rear delts · core · 34 min", sortOrder: -45, weekdays: ["wed"] },
  { routineKey: "run-long",   title: "Long run",          emoji: "", timeOfDay: "morning", kind: "manual", color: "cyan", notes: "45 to 60 min · talking pace", sortOrder: -45, weekdays: ["fri"] },
  { routineKey: "gym-kb",     title: "Functional",        emoji: "", timeOfDay: "morning", kind: "manual", color: "cyan", notes: "AMRAP 30 · 11 moves", sortOrder: -45, weekdays: ["sat"] },
  { routineKey: "breathe", title: "Wim Hof breathing",   emoji: "🫁", timeOfDay: "morning", kind: "routine", color: "cyan",   notes: `30 breaths · ${BREATHING_VIDEO_URL}`, sortOrder: -40 },
  { routineKey: "supp-am", title: "Morning supplements", emoji: "💊", timeOfDay: "morning", kind: "routine", color: "green",  notes: "Zinc · Omega-3 · Creatine", sortOrder: -30 },
  // Mental Training (Ali's ALAI spec 2026-09-27, built 2026-09-28): 4 a week, weekdays by default,
  // ~20 min · Train → Mind. The days are a seed · Ali edits them on Today → Edit; the 05:00
  // pre-write of the brief reads this row's weekdays.
  { routineKey: "mind",    title: "Mental training",     emoji: "", timeOfDay: "afternoon", kind: "routine", color: "violet", notes: "Callback 2 min · read the brief · speak 2 min", sortOrder: -25, weekdays: ["mon", "tue", "thu", "fri"] },
  { routineKey: "supp-pm", title: "Magnesium",           emoji: "🌙", timeOfDay: "evening", kind: "routine", color: "violet", notes: "Night supplement", sortOrder: -20 },
  { routineKey: "read",    title: "Read before sleep",   emoji: "📚", timeOfDay: "evening", kind: "manual",  color: "pink",   notes: "A physical book, even ten pages", sortOrder: -10 },
];
