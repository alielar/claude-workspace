/**
 * Train — kettlebell era. Types, defaults and pure helpers shared by API + screens.
 */

export type WorkoutKey = "w1" | "w2";
export type WorkoutFormat = "amrap" | "sets";

export type TrainExercise = {
  id: string;            // stable slug, e.g. "snatch"
  name: string;
  reps: number;
  sets: number;          // 1 for AMRAP rounds
  perSide: boolean;      // "per side" / "per arm"
  kettlebell: boolean;   // weight comes from the kettlebell setting
  weightKg: number | null; // dumbbell exercises: editable, null = not set
};

export type TrainWorkout = {
  key: WorkoutKey;
  name: string;
  format: WorkoutFormat;
  amrapMinutes: number | null;
  restSeconds: number;
  exercises: TrainExercise[];
  assignedDays: string[] | null;
};

export type TrainSession = {
  clientId: string;
  workoutKey: WorkoutKey;
  date: string;              // YYYY-MM-DD
  startedAt: number;         // ms
  finishedAt: number | null;
  durationSeconds: number | null;
  rounds: number | null;
  weightKg: number | null;
  log: SessionLog;
  notes: string | null;
};

export type SessionLog =
  | { roundsAt?: number[] }                       // w1: elapsed ms at each round tap
  | { sets?: Record<string, boolean[]> };         // w2: exerciseId → set done flags

export type WeeklyBest = { week: string; label: string; best: number; sessions: number };

export type TrainOverview = {
  sessions: TrainSession[];      // newest first, last 60
  weeklyBests: WeeklyBest[];     // w1, newest first
  next: WorkoutKey;
  toBeat: { rounds: number; week: string; label: string } | null;
  thisWeekBest: number | null;
  /** Finished sessions in the current ISO week (target: 4). */
  thisWeekSessions: number;
  /** Consecutive weeks (ending this week or last week) with at least 4 finished sessions. */
  weekStreak: number;
  kettlebellKg: number;
  /** Sessions per week to aim for: the number of fixed days when set, else 4. */
  target: number;
  /** Fixed-day schedule (spec §7c item 6). null = "any days, alternating" (the default). */
  schedule: { todayKey: WorkoutKey | null; next: { key: WorkoutKey; date: string } | null } | null;
};

export const SESSIONS_PER_WEEK = 4;

/** Finished sessions per ISO week. */
export function sessionsPerWeek(sessions: TrainSession[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of sessions) {
    if (s.finishedAt === null) continue;
    const k = isoWeekKey(s.date);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

/**
 * Weekly streak: how many weeks in a row hit SESSIONS_PER_WEEK. The current week
 * counts if it already hit the target; otherwise the streak is measured up to last week
 * (this week is still in progress, it must not break the streak).
 */
export function weekStreak(sessions: TrainSession[], today: string): number {
  const per = sessionsPerWeek(sessions);
  const d = new Date(today + "T12:00:00Z");
  let key = isoWeekKey(today);
  let count = 0;
  if ((per.get(key) ?? 0) < SESSIONS_PER_WEEK) {
    d.setUTCDate(d.getUTCDate() - 7);
    key = isoWeekKey(d.toISOString().slice(0, 10));
  }
  for (let i = 0; i < 104; i++) {
    if ((per.get(key) ?? 0) >= SESSIONS_PER_WEEK) {
      count++;
      d.setUTCDate(d.getUTCDate() - 7);
      key = isoWeekKey(d.toISOString().slice(0, 10));
    } else break;
  }
  return count;
}

// ─── Defaults (spec §4.2) ─────────────────────────────────────────────────────

const kb = (id: string, name: string, reps: number, sets = 1, perSide = true): TrainExercise =>
  ({ id, name, reps, sets, perSide, kettlebell: true, weightKg: null });
const db = (id: string, name: string, reps: number, sets = 3, perSide = false): TrainExercise =>
  ({ id, name, reps, sets, perSide, kettlebell: false, weightKg: null });

export const DEFAULT_WORKOUTS: TrainWorkout[] = [
  {
    key: "w1",
    name: "Workout 1",
    format: "amrap",
    amrapMinutes: 30,
    restSeconds: 0,
    assignedDays: null,
    exercises: [
      kb("snatch",   "Snatches",   5),
      kb("thruster", "Thrusters",  5),
      kb("highpull", "High pulls", 5),
      kb("press",    "Presses",    5),
      kb("swing",    "Swings",     5),
      kb("squat",    "Squats",     5),
    ],
  },
  {
    key: "w2",
    name: "Workout 2",
    format: "sets",
    amrapMinutes: null,
    restSeconds: 90,
    assignedDays: null,
    exercises: [
      { ...kb("tri-press",  "Triceps overhead press", 12, 3, false) },
      { ...kb("halo",       "Halos",                  12, 3, false) },
      { ...kb("pullover",   "Pullovers",              12, 3, false) },
      { ...kb("helicopter", "Helicopters",            12, 3, false) },
      db("incline-press", "Dumbbell incline chest press", 20, 3, false),
      db("curl",          "Biceps curls",                12, 3, true),
      db("wrist-curl",    "Wrist curls",                 15, 3, true),
    ],
  },
];

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/** ISO week key ("2026-W35") for a YYYY-MM-DD date. Weeks start Monday. */
export function isoWeekKey(date: string): string {
  const d = new Date(date + "T12:00:00Z");
  const day = (d.getUTCDay() + 6) % 7;             // Mon=0 … Sun=6
  d.setUTCDate(d.getUTCDate() - day + 3);          // Thursday of this week decides the year
  const isoYear = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const week = 1 + Math.round(((d.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/** Monday (YYYY-MM-DD) of the week containing `date`. */
export function weekMonday(date: string): string {
  const d = new Date(date + "T12:00:00Z");
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

export function previousWeekKey(date: string): string {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 7);
  return isoWeekKey(d.toISOString().slice(0, 10));
}

export function weekLabel(week: string, todayWeek: string, prevWeek: string): string {
  if (week === todayWeek) return "This week";
  if (week === prevWeek) return "Last week";
  return week.replace("-W", " · wk ");
}

/** Best AMRAP rounds per ISO week, newest first. */
export function weeklyBests(sessions: TrainSession[], today: string): WeeklyBest[] {
  const todayWeek = isoWeekKey(today);
  const prevWeek = previousWeekKey(today);
  const map = new Map<string, WeeklyBest>();
  for (const s of sessions) {
    if (s.workoutKey !== "w1" || s.rounds === null || s.finishedAt === null) continue;
    const week = isoWeekKey(s.date);
    const cur = map.get(week) ?? { week, label: weekLabel(week, todayWeek, prevWeek), best: 0, sessions: 0 };
    cur.best = Math.max(cur.best, s.rounds);
    cur.sessions += 1;
    map.set(week, cur);
  }
  return [...map.values()].sort((a, b) => (a.week < b.week ? 1 : -1));
}

/**
 * The number to beat this week: last week's best; if there was none, the most
 * recent earlier week's best; null when there is no history at all.
 */
export function numberToBeat(bests: WeeklyBest[], today: string): TrainOverview["toBeat"] {
  const todayWeek = isoWeekKey(today);
  const prior = bests.filter((b) => b.week < todayWeek);
  const pick = prior[0] ?? null;
  return pick ? { rounds: pick.best, week: pick.week, label: pick.label } : null;
}

// ─── Fixed training days (opt-in) ────────────────────────────────────────────

export type DayCode = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export const DAY_CODES: DayCode[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const DAY_LABELS: Record<DayCode, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

export function dayCode(ymd: string): DayCode {
  return DAY_CODES[(new Date(ymd + "T12:00:00Z").getUTCDay() + 6) % 7];
}

/** True when at least one workout has fixed days. */
export function hasSchedule(workouts: Pick<TrainWorkout, "assignedDays">[]): boolean {
  return workouts.some((w) => (w.assignedDays?.length ?? 0) > 0);
}

/** Which workout is planned on a given date, or null (rest day / no schedule). */
export function scheduledFor(workouts: TrainWorkout[], ymd: string): WorkoutKey | null {
  const code = dayCode(ymd);
  return workouts.find((w) => w.assignedDays?.includes(code))?.key ?? null;
}

/** Next planned session from `today` (today counts unless already trained today), within 7 days. */
export function nextScheduled(workouts: TrainWorkout[], today: string, trainedToday: boolean): { key: WorkoutKey; date: string } | null {
  if (!hasSchedule(workouts)) return null;
  for (let i = trainedToday ? 1 : 0; i < 8; i++) {
    const d = new Date(today + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + i);
    const ymd = d.toISOString().slice(0, 10);
    const key = scheduledFor(workouts, ymd);
    if (key) return { key, date: ymd };
  }
  return null;
}

export function fmtScheduleDate(ymd: string, today: string): string {
  if (ymd === today) return "today";
  const d = new Date(today + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1);
  if (ymd === d.toISOString().slice(0, 10)) return "tomorrow";
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(new Date(ymd + "T12:00:00Z"));
}

/** Alternate W1 / W2 based on the last finished session. W1 first. */
export function nextWorkoutKey(sessions: TrainSession[]): WorkoutKey {
  const last = sessions.find((s) => s.finishedAt !== null);
  if (!last) return "w1";
  return last.workoutKey === "w1" ? "w2" : "w1";
}

export function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function newClientId(): string {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}
