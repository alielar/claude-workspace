/**
 * Train · kettlebell era. Types, defaults and pure helpers shared by API + screens.
 */

// "kb1" (Kettlebell 30) is the one live workout since 2026-09-10; the old keys stay
// in the type so session history keeps rendering.
export type WorkoutKey = "w1" | "w2" | "w3" | "kb1";
export const PRIMARY_KEY: WorkoutKey = "kb1";
export type WorkoutFormat = "amrap" | "sets";

export type TrainExercise = {
  id: string;            // stable slug, e.g. "swing"
  name: string;
  reps: number;
  sets: number;          // 1 for AMRAP rounds
  perSide: boolean;      // one arm / one leg does the work · reps count per side
  eachWay?: boolean;     // halos, helicopters: reps count per direction (shown "each way", implies perSide)
  kettlebell: boolean;   // weight comes from the kettlebell setting
  weightKg: number | null; // dumbbell exercises: editable, null = not set
  videoUrl?: string | null; // how-to video (YouTube / Instagram reel), opens externally
};

/** "6 per side" · "5 each way" · "8". */
export function repsLabel(e: Pick<TrainExercise, "reps" | "perSide" | "eachWay">): string {
  return `${e.reps}${e.eachWay ? " each way" : e.perSide ? " per side" : ""}`;
}

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

/** One movement inside a round: work time only (on-demand rest is kept apart). */
export type MoveLog = { id: string; ms: number };
/** One completed round: the rest taken inside the round and `ms` = work time of the round.
 * `moves` is per-move work time · EMPTY since 2026-09-24 (no tap per movement any more; sessions
 * before that still carry it). */
export type RoundLog = { moves: MoveLog[]; restMs: number; ms: number };
/** The 3 × 20 incline bench after the clock (2026-09-20). `reps` = what was done per set. */
export type BenchLog = { mode: "dumbbells" | "machine"; weightKg: number; reps: number[] };

/**
 * AMRAP log. `roundsAt` (elapsed ms at each round tap) is the original score and is still
 * written; v2 adds the timings the weekly comparison needs once rest between rounds exists.
 */
export type AmrapLog = {
  roundsAt?: number[];
  v?: 2;
  roundLogs?: RoundLog[];      // one per completed round
  roundRestMs?: number[];      // the rest taken AFTER each round (between rounds)
  bench?: BenchLog;
};

export type SessionLog =
  | AmrapLog                                      // w1 / kb1
  | { sets?: Record<string, boolean[]> };         // w2: exerciseId → set done flags

// ─── Work-only metrics (2026-09-20) ──────────────────────────────────────────
// "Rounds in 30 minutes" also measures how long you rested. The comparison that stays
// honest week to week is the WORK-ONLY average round time · rest excluded · lower is better.

export type WorkStats = {
  rounds: number;
  workMs: number;          // sum of round work time
  restMs: number;          // inside rounds + between rounds
  avgRoundMs: number;      // work only
  bestRoundMs: number;     // fastest round, work only
  moveAvgMs: Record<string, number>;
};

export function workStats(s: Pick<TrainSession, "log">): WorkStats | null {
  const log = s.log as AmrapLog;
  const rl = log?.roundLogs;
  if (!rl || rl.length === 0) return null;
  const workMs = rl.reduce((a, r) => a + r.ms, 0);
  const restMs = rl.reduce((a, r) => a + r.restMs, 0) + (log.roundRestMs ?? []).reduce((a, b) => a + b, 0);
  const moveTotals: Record<string, { ms: number; n: number }> = {};
  for (const r of rl) for (const m of r.moves) {
    const t = (moveTotals[m.id] ??= { ms: 0, n: 0 });
    t.ms += m.ms; t.n += 1;
  }
  const moveAvgMs: Record<string, number> = {};
  for (const [id, t] of Object.entries(moveTotals)) moveAvgMs[id] = t.ms / t.n;
  return {
    rounds: rl.length, workMs, restMs,
    avgRoundMs: workMs / rl.length,
    bestRoundMs: Math.min(...rl.map((r) => r.ms)),
    moveAvgMs,
  };
}

export type WeeklyPace = { week: string; label: string; avgRoundMs: number };

/** Best (lowest) work-only average round time per ISO week, newest first · sessions without v2 logs are skipped. */
export function weeklyPaces(sessions: TrainSession[], today: string, key: WorkoutKey = PRIMARY_KEY): WeeklyPace[] {
  const todayWeek = isoWeekKey(today);
  const prevWeek = previousWeekKey(today);
  const map = new Map<string, WeeklyPace>();
  for (const s of sessions) {
    if (s.workoutKey !== key || s.finishedAt === null) continue;
    const st = workStats(s);
    if (!st || st.rounds < 2) continue;
    const week = isoWeekKey(s.date);
    const cur = map.get(week);
    if (!cur || st.avgRoundMs < cur.avgRoundMs) map.set(week, { week, label: weekLabel(week, todayWeek, prevWeek), avgRoundMs: st.avgRoundMs });
  }
  return [...map.values()].sort((a, b) => (a.week < b.week ? 1 : -1));
}

/** The pace to beat this week: the most recent earlier week's best work-only round time. */
export function paceToBeat(paces: WeeklyPace[], today: string): WeeklyPace | null {
  const todayWeek = isoWeekKey(today);
  return paces.find((p) => p.week < todayWeek) ?? null;
}

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

// ─── Defaults ─────────────────────────────────────────────────────────────────

const kb = (id: string, name: string, reps: number, perSide = false, eachWay = false): TrainExercise =>
  ({ id, name, reps, sets: 1, perSide: perSide || eachWay, ...(eachWay ? { eachWay } : {}), kettlebell: true, weightKg: null, videoUrl: null });

/** Moves that left the round on 2026-09-20 (snatches, crush thrusters, plain squats) · a stored
 * row still carrying one of these is on the old recipe and gets migrated (workoutRows.ts). */
export const KB1_RETIRED_IDS = ["snatch", "crush-thruster", "squat"];

/**
 * Kettlebell 30 (2026-09-10, Ali · "KB Hour" until 2026-09-24) · the ONE workout on Train.
 * Audited and rebuilt 2026-09-20 (11 moves); cut to AMRAP 30 min on 2026-09-24 with NO tap
 * per movement: the player shows the sequence, a Rest button and a Round Done button, nothing
 * else. Rest is on demand only (`restSeconds` 0 = no automatic rest between rounds); then
 * 3 × 20 incline bench after the clock.
 *
 * Order (the logic, in priority order):
 *  1. most explosive / most technical first, while fresh → swings open the round;
 *  2. alternate hinge → push → squat → pull so no muscle group works twice in a row;
 *  3. grip-heavy moves (swings, rows, high pulls) kept apart, grip-light ones
 *     (halos, helicopters, pullover, triceps) between them as active recovery;
 *  4. close with a low-skill, grip-light move you can do tired without consequence,
 *     because the next round opens with swings and needs grip.
 * Ali does swings, thrusters and high pulls one-armed → per side; halos and
 * helicopters count per direction ("each way"). Snatches and crush thrusters are
 * out (his call), plain squats became reverse lunges (the round had three squat
 * patterns and no single-leg one). Old w1/w2/w3 rows stay in the DB for history.
 */
export const DEFAULT_WORKOUTS: TrainWorkout[] = [
  {
    key: "kb1",
    name: "Kettlebell 30",
    format: "amrap",
    amrapMinutes: 30,
    restSeconds: 0,     // 0 = no automatic rest between rounds · rest is the Rest button, whenever
    // Saturdays (Ali, 2026-09-11) · Mon/Wed/Fri are Speediance machine days,
    // which live as checklist rows, not Train workouts.
    assignedDays: ["sat"],
    exercises: [
      kb("swing",         "Swings",                   10, true),
      kb("press",         "Presses",                   5, true),
      kb("goblet-curl",   "Goblet squat + deep curl",  6),
      kb("ballistic-row", "Ballistic rows",            5, true),
      kb("halo",          "Halos",                     5, false, true),
      kb("thruster",      "Thrusters",                 6, true),
      kb("highpull",      "High pulls",                8, true),
      kb("helicopter",    "Helicopters",               5, false, true),
      kb("lunge",         "Reverse lunges",            5, true),
      kb("pullover",      "Pullovers",                 8),
      kb("tri-press",     "Triceps overhead press",    8),
    ],
  },
];

/** The bench block after the clock: 3 × 20 · 20 kg with dumbbells (10 each side, Ali's max pair). */
export const BENCH_DEFAULT: { sets: number; reps: number; weightKg: number; restSeconds: number } = { sets: 3, reps: 20, weightKg: 20, restSeconds: 90 };

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

/** Best AMRAP rounds per ISO week for one workout, newest first. */
export function weeklyBests(sessions: TrainSession[], today: string, key: WorkoutKey = PRIMARY_KEY): WeeklyBest[] {
  const todayWeek = isoWeekKey(today);
  const prevWeek = previousWeekKey(today);
  const map = new Map<string, WeeklyBest>();
  for (const s of sessions) {
    if (s.workoutKey !== key || s.rounds === null || s.finishedAt === null) continue;
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

/** One workout since 2026-09-10: the next session is always Kettlebell 30. */
export function nextWorkoutKey(_sessions: TrainSession[]): WorkoutKey {
  return PRIMARY_KEY;
}

export function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** A stable-enough id for a new custom exercise. */
export function newExerciseId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "exercise";
  return `${slug}-${Math.random().toString(36).slice(2, 6)}`;
}

export function newClientId(): string {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}
