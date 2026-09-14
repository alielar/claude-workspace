/** Shape returned by GET /api/checklist · shared by the Today screen and the editor. */

export type TimeOfDay = "morning" | "afternoon" | "evening" | "anytime";

/**
 * routine · fixed daily routine step (counts toward the day's streak)
 * habit   · being built; own streak, not counted in the day total until promoted
 * manual  · regular item
 */
export type ItemKind = "routine" | "habit" | "manual";

export type RoutineKey = "stretch" | "breathe" | "supp-am" | "supp-pm" | "read" | "gym-push" | "gym-pull" | "gym-legs";

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
  startDate?: string;    // hidden before this date
}[] = [
  { routineKey: "stretch", title: "Mobility",            emoji: "🤸", timeOfDay: "morning", kind: "routine", color: "amber",  notes: "2 sessions of 10 minutes, alternating · 10 s rests", sortOrder: -50 },
  // Speediance machine days (Ali, 2026-09-14): three a week · Sun push, Tue pull, Thu legs+core
  // (he trained Sunday 13th, next Tuesday 15th and Thursday 17th). Tickable morning rows, NOT
  // counted in the day streak (excluded in the checklist route by the gym- prefix); Saturday's
  // kettlebell hour is the KB Hour on Train (kb_workouts.assigned_days = ["sat"]). The days are
  // seeds only · Ali edits them on Today → Edit; the migrate route moves rows still on the old
  // Mon/Wed/Fri defaults, never ones he changed.
  { routineKey: "gym-push", title: "Push day · machine", emoji: "", timeOfDay: "morning", kind: "manual", color: "cyan", notes: "Speediance · chest, shoulders, triceps", sortOrder: -45, weekdays: ["sun"] },
  { routineKey: "gym-pull", title: "Pull day · machine", emoji: "", timeOfDay: "morning", kind: "manual", color: "cyan", notes: "Speediance · back, biceps, rear delts", sortOrder: -45, weekdays: ["tue"] },
  { routineKey: "gym-legs", title: "Legs and core · machine", emoji: "", timeOfDay: "morning", kind: "manual", color: "cyan", notes: "Speediance · squats, hinges, core", sortOrder: -45, weekdays: ["thu"] },
  { routineKey: "breathe", title: "Wim Hof breathing",   emoji: "🫁", timeOfDay: "morning", kind: "routine", color: "cyan",   notes: `30 breaths · ${BREATHING_VIDEO_URL}`, sortOrder: -40 },
  { routineKey: "supp-am", title: "Morning supplements", emoji: "💊", timeOfDay: "morning", kind: "routine", color: "green",  notes: "Zinc · Omega-3 · Creatine", sortOrder: -30 },
  { routineKey: "supp-pm", title: "Magnesium",           emoji: "🌙", timeOfDay: "evening", kind: "routine", color: "violet", notes: "Night supplement", sortOrder: -20 },
  { routineKey: "read",    title: "Read before sleep",   emoji: "📚", timeOfDay: "evening", kind: "habit",   color: "pink",   notes: "A physical book, even ten pages", sortOrder: -10 },
];
