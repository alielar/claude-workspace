/**
 * Ali's training program (2026-10-04 · "set up my own program · five sessions a week · dispatch
 * them the best way · we start fresh this Monday"). One session a day, never two:
 *
 *   Mon  Push          · Speediance, upper body (chest · shoulders · triceps)
 *   Tue  Sprint run    · short and fast with the Watch · legs are fresh after an upper day
 *   Wed  Pull          · Speediance, upper body (back · biceps · rear delts · core)
 *   Thu  rest
 *   Fri  Long run      · easy, talking pace · three days after the sprints
 *   Sat  Functional 30 (the kettlebell AMRAP, "Kettlebell 30" until 2026-10-07) · the full-body session he already keeps on Saturday
 *   Sun  rest
 *
 * Why this order: the two machine days alternate with the runs so no muscle group works two
 * days in a row; the sprint day sits after Push (upper) and before Pull (upper), so the legs get
 * a full day each side; the long run comes before the kettlebell day, not after it (a ballistic
 * hinge session the day before a long run makes the run heavy, the other way round is fine); two
 * rest days split the week in two. Kettlebell and the runs cover the legs · no legs day.
 *
 * The DAYS live on the Routine rows (one row per session, `routineKey` below), so Ali moves a
 * session on Today → Edit and everything follows. This file holds what each session IS. The
 * Speediance moves are in programs.ts, Kettlebell 30 in types.ts. Starts 2026-10-05: weeks
 * before that are history (kept, shown in the reports) and not judged against this plan.
 */

import type { DayCode } from "@/lib/train/types";

export const PROGRAM_START = "2026-10-05";

export type SessionKey = "push" | "sprint" | "pull" | "long" | "kb";
export type SessionKind = "strength" | "run" | "kb";

export type ProgramSession = {
  key: SessionKey;
  kind: SessionKind;
  name: string;
  /** Two or three words for a narrow cell. */
  short: string;
  /** The Routine row that carries this session's weekday. */
  routineKey: "gym-push" | "gym-pull" | "run-sprint" | "run-long" | "gym-kb";
  /** The seeded day (the Routine row may be edited later). */
  day: DayCode;
  /** What the session is, in one line. */
  what: string;
  /** How it gets logged. */
  how: string;
  /** Where "Start" / "Program" goes. */
  href: string;
  action: string;
};

export const PROGRAM: ProgramSession[] = [
  { key: "push",   kind: "strength", name: "Push",          short: "Push",   routineKey: "gym-push",   day: "mon", what: "Speediance · chest, shoulders, triceps · 35 min", how: "Start Traditional Strength Training on the Watch when the machine starts.", href: "/train?body=strength", action: "Program" },
  { key: "sprint", kind: "run",      name: "Sprint run",    short: "Sprint", routineKey: "run-sprint", day: "tue", what: "10 min easy · 6 × 30 s fast, 90 s walk · 10 min easy · about 30 min", how: "Outdoor Run on the Watch · it lands here when the phone syncs.", href: "/train?body=runs", action: "Runs" },
  { key: "pull",   kind: "strength", name: "Pull",          short: "Pull",   routineKey: "gym-pull",   day: "wed", what: "Speediance · back, biceps, rear delts, core · 34 min", how: "Start Traditional Strength Training on the Watch when the machine starts.", href: "/train?body=strength", action: "Program" },
  { key: "long",   kind: "run",      name: "Long run",      short: "Long",   routineKey: "run-long",   day: "fri", what: "45 to 60 min at talking pace · the week's base", how: "Outdoor Run on the Watch · it lands here when the phone syncs.", href: "/train?body=runs", action: "Runs" },
  { key: "kb",     kind: "kb",       name: "Functional 30", short: "Func",   routineKey: "gym-kb",     day: "sat", what: "AMRAP 30 · 11 moves · then 3 × 20 incline bench", how: "Press Start in the player; the round count is the log.", href: "/train/kb1", action: "Start" },
];

export const sessionByKey = (k: SessionKey) => PROGRAM.find((s) => s.key === k)!;
export const sessionByRoutine = (rk: string) => PROGRAM.find((s) => s.routineKey === rk) ?? null;

/**
 * Which program session a Routine row is · by its key, or by its NAME when Ali made the row himself
 * (2026-10-05: he deleted the seeded Push and Pull rows and created his own "Push" and "Pull",
 * kind routine, Mon and Wed · a row called Push IS the push day). The name test is the first word.
 */
export function sessionOfRow(row: { routineKey?: string | null; title: string }): ProgramSession | null {
  if (row.routineKey) { const byKey = PROGRAM.find((s) => s.routineKey === row.routineKey); if (byKey) return byKey; }
  const t = row.title.trim().toLowerCase();
  if (/^push\b/.test(t)) return sessionByKey("push");
  if (/^pull\b/.test(t)) return sessionByKey("pull");
  if (/^sprint\b|^interval/.test(t)) return sessionByKey("sprint");
  if (/^long run\b|^long\b/.test(t)) return sessionByKey("long");
  if (/^functional\b|^kettlebell\b|^kb\b/.test(t)) return sessionByKey("kb");
  return null;
}

/** The week's days as planned · session key per weekday (null = rest), from the Routine rows' weekdays or the seed. */
export type WeekDays = Record<DayCode, SessionKey | null>;

/**
 * ONE-OFF WEEK LAYOUTS, keyed by the week's Monday (Ali 2026-10-08, late: "exceptionally this week
 * Push today, Pull tomorrow, the run and the bell over the weekend · next week as if nothing
 * happened"). A week listed here replaces those days; every other week follows the Routine rows.
 * The entry can be deleted once the week is over, it then does nothing.
 */
export const WEEK_OVERRIDES: Record<string, Partial<WeekDays>> = {
  "2026-10-05": { mon: null, wed: null, thu: "push", fri: "pull", sat: "long", sun: "kb" },
};
export function daysForWeek(days: WeekDays, monday: string): WeekDays {
  const o = WEEK_OVERRIDES[monday];
  return o ? { ...days, ...o } : days;
}
export function weekDaysFrom(rows: { routineKey: string | null; title: string; weekdays?: string[] | null }[] | null): WeekDays {
  const out: WeekDays = { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null };
  for (const s of PROGRAM) {
    const row = rows?.find((r) => sessionOfRow(r)?.key === s.key);
    const days = row ? (row.weekdays ?? []) : rows ? [] : [s.day]; // rows loaded but no row = not planned
    for (const d of days) if (d in out && out[d as DayCode] === null) out[d as DayCode] = s.key;
  }
  return out;
}
