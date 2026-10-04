/**
 * The coach · objectives, the weekly numbers, the "Head" skill (spec §7c item 15, planned with Ali
 * 2026-10-04: "5K under 20 minutes, a toned body, feel strong · Watch numbers only for the machine ·
 * report Sunday evening · coach tone · a mental side for the physical training").
 *
 * Pure and client-safe: everything here runs from the phone's cached copies (health summary, the
 * kettlebell overview) and again on the server when the Sunday report is written, so both read the
 * same numbers. Fixed rules; the only AI is the report's prose (coach/server.ts).
 *
 *   Objectives · a few goals with a number and a date, progress computed live from the data:
 *     run5k          best 5 km time (runs of 4.5 km or more, pace × 5) · the ladder to 20:00
 *     strengthWeeks  weeks since the program start with 3 strength sessions (Push · Pull · Kettlebell)
 *     kbRounds       best Kettlebell 30 rounds in the last 8 weeks
 *     vo2max         Apple's estimate (needs VO2 max in the HAE automation)
 *   Head · one mental skill a week for the physical training (Mind stays memory and speaking):
 *     picked by what the week's numbers show, else rotated.
 */

import type { HealthSummary, WorkoutRow } from "@/lib/health/summary";
import { avg, isoWeekOf, metricKey, metricValue, METRIC_INFO, paceOf, workoutKind } from "@/lib/health/client";
import type { TrainSession } from "@/lib/train/types";

export type ObjectiveKind = "run5k" | "strengthWeeks" | "kbRounds" | "vo2max";
export type Objective = {
  id: string;                 // stable key · the seed uses the kind, custom ones a client id
  kind: ObjectiveKind;
  title: string;
  target: number;             // seconds for run5k, weeks, rounds, VO2 points
  due: string;                // YYYY-MM-DD
  startedAt: string;          // YYYY-MM-DD · progress is measured from here
  startValue: number | null;  // where it stood when set (null = unknown yet)
  note: string | null;
  done: boolean;
  updatedAt: number;
};

export type ProgressState = "on" | "behind" | "done" | "wait";
export type Progress = {
  value: number | null;       // the current measure in the objective's unit
  valueLabel: string;         // "27:28" · "4 of 12 weeks" · "2 rounds" · "41.2"
  targetLabel: string;        // "25:00" · "12 weeks" · "4 rounds" · "43"
  pct: number;                // 0..1 of the way from start to target
  state: ProgressState;
  line: string;               // one plain sentence on where it stands
};

export type ProgressData = { today: string; workouts: WorkoutRow[]; kb: TrainSession[]; metrics?: HealthSummary["metrics"] | null };

/** The Speediance + kettlebell program started on Monday 2026-10-05 (train/insights.ts). */
export const PROGRAM_START_DAY = "2026-10-05";
export const KB_WEEKS = 8;

export const fmtSec = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
export const shiftDay = (date: string, n: number) => { const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = (date: string) => (new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7; // Mon = 0
export const mondayOf = (date: string) => shiftDay(date, -dow(date));
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const daysBetween = (a: string, b: string) => Math.round((new Date(b + "T12:00:00Z").getTime() - new Date(a + "T12:00:00Z").getTime()) / 86400_000);

// ─── Measures ─────────────────────────────────────────────────────────────────

/** Best 5 km time from the runs of the last `days` (4.5 km or more · pace × 5) · null when none. */
export function best5k(workouts: WorkoutRow[], today: string, days = 60): { sec: number; date: string } | null {
  const since = shiftDay(today, -days);
  let best: { sec: number; date: string } | null = null;
  for (const w of workouts) {
    if (workoutKind(w.type) !== "run" || w.date < since || w.date > today) continue;
    const p = paceOf(w);
    if (!p || (w.distanceKm ?? 0) < 4.5) continue;
    const sec = Math.round(p * 5);
    if (!best || sec < best.sec) best = { sec, date: w.date };
  }
  return best;
}

/** Days with a strength session (a Watch strength workout or a finished kettlebell session). */
export function strengthDays(workouts: WorkoutRow[], kb: TrainSession[]): Set<string> {
  const s = new Set<string>();
  for (const w of workouts) if (workoutKind(w.type) === "strength") s.add(w.date);
  for (const k of kb) if (k.finishedAt !== null) s.add(k.date);
  return s;
}

/** Weeks from `from` to the last FULL week before `today` with at least `n` strength days. */
export function strengthWeeksSince(workouts: WorkoutRow[], kb: TrainSession[], from: string, today: string, n = 3): { hit: number; elapsed: number; thisWeek: number } {
  const days = strengthDays(workouts, kb);
  const perWeek = new Map<string, number>();
  for (const d of days) if (d >= from && d <= today) perWeek.set(isoWeekOf(d), (perWeek.get(isoWeekOf(d)) ?? 0) + 1);
  const thisMon = mondayOf(today);
  let hit = 0, elapsed = 0;
  for (let mon = mondayOf(from); mon < thisMon; mon = shiftDay(mon, 7)) { elapsed++; if ((perWeek.get(isoWeekOf(mon)) ?? 0) >= n) hit++; }
  return { hit, elapsed, thisWeek: perWeek.get(isoWeekOf(today)) ?? 0 };
}

export function bestRounds(kb: TrainSession[], today: string, weeks = KB_WEEKS): number | null {
  const since = shiftDay(today, -7 * weeks);
  const xs = kb.filter((s) => s.finishedAt !== null && s.rounds !== null && s.date >= since).map((s) => s.rounds!);
  return xs.length ? Math.max(...xs) : null;
}

export function latestMetric(metrics: HealthSummary["metrics"] | null | undefined, key: string): { value: number; date: string } | null {
  if (!metrics) return null;
  const hit = Object.entries(metrics).find(([n]) => metricKey(n) === key);
  if (!hit) return null;
  const info = METRIC_INFO[key];
  for (let i = hit[1].points.length - 1; i >= 0; i--) {
    const v = metricValue(hit[1].points[i], info, hit[1].units);
    if (v !== null) return { value: v, date: hit[1].points[i].date };
  }
  return null;
}

// ─── Objectives ───────────────────────────────────────────────────────────────

/** Ali's goals as objectives (2026-10-04) · targets from the data on the day they are seeded, editable after. */
export function seedObjectives(d: ProgressData): Objective[] {
  const now = Date.now();
  const b5 = best5k(d.workouts, d.today, 90);
  const kbBest = bestRounds(d.kb, d.today, 26);
  const vo2 = latestMetric(d.metrics, "vo2_max");
  return [
    { id: "run5k", kind: "run5k", title: "5 km under 25:00", target: 25 * 60, due: "2026-12-31", startedAt: d.today, startValue: b5?.sec ?? null, note: "The first step of the ladder to 20:00 · then 22:30, then 20:00.", done: false, updatedAt: now },
    { id: "strengthWeeks", kind: "strengthWeeks", title: "12 weeks with 3 strength sessions", target: 12, due: "2026-12-27", startedAt: PROGRAM_START_DAY, startValue: 0, note: "Push, Pull and the Saturday kettlebell · the week counts when all three are in.", done: false, updatedAt: now },
    { id: "kbRounds", kind: "kbRounds", title: `Kettlebell 30 · ${Math.max(4, (kbBest ?? 2) + 2)} rounds`, target: Math.max(4, (kbBest ?? 2) + 2), due: "2026-12-31", startedAt: d.today, startValue: kbBest, note: "Same bell, less rest between rounds first.", done: false, updatedAt: now },
    { id: "vo2max", kind: "vo2max", title: vo2 ? `VO2 max ${Math.round(vo2.value + 2)}` : "VO2 max up 2 points", target: vo2 ? Math.round(vo2.value + 2) : 0, due: "2027-03-31", startedAt: d.today, startValue: vo2?.value ?? null, note: vo2 ? "Apple's estimate · it moves over months, the easy runs move it most." : "Needs VO2 max in the ALI sleep automation of Health Auto Export.", done: false, updatedAt: now },
  ];
}

export function objectiveProgress(o: Objective, d: ProgressData): Progress {
  const weeksLeft = Math.max(0, daysBetween(d.today, o.due)) / 7;
  const span = Math.max(1, daysBetween(o.startedAt, o.due));
  const elapsedFrac = clamp01(daysBetween(o.startedAt, d.today) / span);
  const pace = (pct: number): ProgressState => (pct >= 1 ? "done" : pct + 0.15 >= elapsedFrac ? "on" : "behind");
  if (o.done) return { value: null, valueLabel: "done", targetLabel: "", pct: 1, state: "done", line: "Done." };

  if (o.kind === "run5k") {
    const b = best5k(d.workouts, d.today, 60);
    const start = o.startValue ?? b?.sec ?? null;
    if (!b || start === null) return { value: null, valueLabel: "no 5 km yet", targetLabel: fmtSec(o.target), pct: 0, state: "wait", line: "Run 5 km or more once and the clock starts." };
    const pct = start <= o.target ? 1 : clamp01((start - b.sec) / (start - o.target));
    const gap = b.sec - o.target;
    const line = gap <= 0 ? `${fmtSec(b.sec)} on ${b.date.slice(5)} · under the bar. Time for the next step.` : `Best ${fmtSec(b.sec)}, ${fmtSec(gap)} to cut in ${Math.ceil(weeksLeft)} weeks · about ${Math.round(gap / 5 / Math.max(1, weeksLeft))} s a km a week.`;
    return { value: b.sec, valueLabel: fmtSec(b.sec), targetLabel: fmtSec(o.target), pct, state: gap <= 0 ? "done" : pace(pct), line };
  }
  if (o.kind === "strengthWeeks") {
    const s = strengthWeeksSince(d.workouts, d.kb, o.startedAt, d.today);
    const pct = clamp01(s.hit / Math.max(1, o.target));
    const missed = s.elapsed - s.hit;
    const state: ProgressState = s.hit >= o.target ? "done" : missed >= 2 ? "behind" : "on";
    const line = s.elapsed === 0 ? `Week one · ${s.thisWeek} of 3 so far.` : `${s.hit} of ${s.elapsed} weeks hit${missed ? `, ${missed} missed` : ""} · this week ${s.thisWeek} of 3.`;
    return { value: s.hit, valueLabel: `${s.hit} of ${o.target} weeks`, targetLabel: `${o.target} weeks`, pct, state, line };
  }
  if (o.kind === "kbRounds") {
    const best = bestRounds(d.kb, d.today);
    const start = o.startValue ?? 0;
    if (best === null) return { value: null, valueLabel: "no session yet", targetLabel: `${o.target} rounds`, pct: 0, state: "wait", line: "The Saturday session sets the first number." };
    const pct = o.target <= start ? 1 : clamp01((best - start) / (o.target - start));
    const gap = o.target - best;
    return { value: best, valueLabel: `${best} rounds`, targetLabel: `${o.target} rounds`, pct, state: gap <= 0 ? "done" : pace(pct), line: gap <= 0 ? `${best} rounds · the bar is yours. Raise it.` : `Best ${best} in ${KB_WEEKS} weeks, ${gap} to go · one more round a month does it.` };
  }
  // vo2max
  const v = latestMetric(d.metrics, "vo2_max");
  if (!v || !o.target) return { value: null, valueLabel: "no data", targetLabel: o.target ? String(o.target) : "", pct: 0, state: "wait", line: "Add VO2 max to the ALI sleep automation in Health Auto Export and it appears here." };
  const start = o.startValue ?? v.value;
  const pct = o.target <= start ? 1 : clamp01((v.value - start) / (o.target - start));
  return { value: v.value, valueLabel: v.value.toFixed(1), targetLabel: String(o.target), pct, state: v.value >= o.target ? "done" : pace(pct), line: `${v.value.toFixed(1)} now, ${o.target} by ${o.due.slice(5)} · easy runs at talking pace move it most.` };
}

/** The next rung of the 5 km ladder once one is done (Ali: the far goal is 20:00). */
export function nextRun5k(o: Objective): { title: string; target: number; due: string } | null {
  if (o.kind !== "run5k") return null;
  const next = o.target > 22 * 60 + 30 ? 22 * 60 + 30 : o.target > 20 * 60 ? 20 * 60 : null;
  if (next === null) return null;
  const due = shiftDay(o.due, next === 20 * 60 ? 182 : 91);
  return { title: `5 km under ${fmtSec(next)}`, target: next, due };
}

// ─── The week's numbers (the report's raw material, the same on phone and server) ───

export type WeekNumbers = {
  week: string; from: string; to: string;
  runs: { n: number; km: number; sec: number; pace: number | null; longestKm: number; hardest: { date: string; hrAvg: number | null; hrMax: number | null } | null };
  strength: { n: number; min: number; hrAvg: number | null };
  kb: { rounds: number | null; date: string | null; best: number | null };
  strengthDays: number;
  sessionDays: number;
  threeInRow: boolean;
  sleep: { avgMin: number | null; shortNights: number; nights: number };
  restingHr: { week: number | null; before: number | null };
  hrv: { week: number | null; before: number | null };
  exerciseMin: number | null;
  prev: { runsKm: number; runsN: number; strengthN: number; kbRounds: number | null; sleepAvgMin: number | null };
};

export function weekNumbers(d: ProgressData & { nights: { date: string; totalMin: number | null }[] }, weekOf: string): WeekNumbers {
  const from = mondayOf(weekOf), to = shiftDay(from, 6);
  const pFrom = shiftDay(from, -7), pTo = shiftDay(from, -1);
  const inW = (date: string, a: string, b: string) => date >= a && date <= b;
  const wo = d.workouts.filter((w) => inW(w.date, from, to) && w.date <= d.today);
  const pwo = d.workouts.filter((w) => inW(w.date, pFrom, pTo));
  const runs = wo.filter((w) => workoutKind(w.type) === "run"), pruns = pwo.filter((w) => workoutKind(w.type) === "run");
  const str = wo.filter((w) => workoutKind(w.type) === "strength"), pstr = pwo.filter((w) => workoutKind(w.type) === "strength");
  const km = (xs: WorkoutRow[]) => Math.round(xs.reduce((s, r) => s + (r.distanceKm ?? 0), 0) * 10) / 10;
  const sec = runs.reduce((s, r) => s + (r.durationSec ?? 0), 0);
  const hardest = runs.slice().sort((a, b) => (b.hrAvg ?? 0) - (a.hrAvg ?? 0))[0] ?? null;
  const kbW = d.kb.filter((s) => s.finishedAt !== null && inW(s.date, from, to)).sort((a, b) => (b.rounds ?? 0) - (a.rounds ?? 0))[0] ?? null;
  const pkb = d.kb.filter((s) => s.finishedAt !== null && inW(s.date, pFrom, pTo)).sort((a, b) => (b.rounds ?? 0) - (a.rounds ?? 0))[0] ?? null;
  const sDays = strengthDays(wo, d.kb.filter((s) => inW(s.date, from, to)));
  const allDays = new Set([...wo.map((w) => w.date), ...d.kb.filter((s) => s.finishedAt !== null && inW(s.date, from, to)).map((s) => s.date)]);
  let threeInRow = false;
  for (const day of allDays) if (allDays.has(shiftDay(day, 1)) && allDays.has(shiftDay(day, 2))) threeInRow = true;
  const nightsW = d.nights.filter((n) => inW(n.date, from, to) && n.totalMin !== null);
  const nightsP = d.nights.filter((n) => inW(n.date, pFrom, pTo) && n.totalMin !== null);
  const series = (key: string, a: string, b: string) => {
    const hit = d.metrics ? Object.entries(d.metrics).find(([n]) => metricKey(n) === key) : undefined;
    if (!hit) return null;
    const vals = hit[1].points.filter((p) => inW(p.date, a, b)).map((p) => metricValue(p, METRIC_INFO[key], hit[1].units)).filter((v): v is number => v !== null);
    return key === "apple_exercise_time" ? (vals.length ? vals.reduce((s, v) => s + v, 0) : null) : avg(vals);
  };
  const r1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);
  return {
    week: isoWeekOf(from), from, to,
    runs: { n: runs.length, km: km(runs), sec, pace: km(runs) > 0.2 && sec ? Math.round(sec / km(runs)) : null, longestKm: Math.max(0, ...runs.map((r) => r.distanceKm ?? 0)), hardest: hardest ? { date: hardest.date, hrAvg: hardest.hrAvg, hrMax: hardest.hrMax } : null },
    strength: { n: str.length, min: Math.round(str.reduce((s, w) => s + (w.durationSec ?? 0), 0) / 60), hrAvg: r1(avg(str.map((w) => w.hrAvg).filter((v): v is number => v !== null))) },
    kb: { rounds: kbW?.rounds ?? null, date: kbW?.date ?? null, best: bestRounds(d.kb, d.today) },
    strengthDays: sDays.size,
    sessionDays: allDays.size,
    threeInRow,
    sleep: { avgMin: r1(avg(nightsW.map((n) => n.totalMin!))), shortNights: nightsW.filter((n) => n.totalMin! < 390).length, nights: nightsW.length },
    restingHr: { week: r1(series("resting_heart_rate", from, to)), before: r1(series("resting_heart_rate", shiftDay(from, -28), pTo)) },
    hrv: { week: r1(series("heart_rate_variability", from, to)), before: r1(series("heart_rate_variability", shiftDay(from, -28), pTo)) },
    exerciseMin: r1(series("apple_exercise_time", from, to)),
    prev: { runsKm: km(pruns), runsN: pruns.length, strengthN: pstr.length, kbRounds: pkb?.rounds ?? null, sleepAvgMin: r1(avg(nightsP.map((n) => n.totalMin!))) },
  };
}

// ─── Head · the mental skill of the week ──────────────────────────────────────

export type HeadSkill = { key: string; title: string; cue: string; text: string };

/** Mental skills for physical training · plain, one line to remember, how to practise it this week. */
export const HEAD_SKILLS: HeadSkill[] = [
  { key: "startSlow", title: "Start slower than it feels", cue: "The first kilometre decides the last one.", text: "Run the first kilometre twenty seconds slower than you think you can. The urge to go out fast is adrenaline, not fitness. If the last kilometre is your fastest, the mind won the run." },
  { key: "talkTest", title: "Easy means talking pace", cue: "If you cannot say a full sentence, it is not an easy run.", text: "Most runs are meant to be easy and most people run them too hard. Say a sentence out loud every few minutes. Slowing down on easy days is what lets you go fast on the day that counts." },
  { key: "showUp", title: "Show up tired, do the short version", cue: "The session you skip teaches you to skip.", text: "On a tired day the goal is not the program, it is the door. Warm up and do the first third. Most of the time the rest follows; when it does not, the habit is still intact and that was the point." },
  { key: "oneMore", title: "One more round, not a heavier bell", cue: "Progress is the next rep, not the next weight.", text: "When the kettlebell session is below your best, the thought to fight is that you need more. You need less rest. Before the clock starts, decide the one rest you will cut and keep every other thing the same." },
  { key: "restIsTraining", title: "Rest is where the training lands", cue: "The body adapts on the day off.", text: "Three days in a row feels like discipline and reads like strain in the numbers. Take the rest day as seriously as a session. Sleep is the only supplement that works every time." },
  { key: "process", title: "Chase the process, not the clock", cue: "You cannot run 20 minutes today. You can run today.", text: "A far goal is motivating from a distance and crushing up close. This week the goal is three strength sessions and two runs, nothing else. The clock is a by-product of weeks like this one stacked up." },
  { key: "nightBefore", title: "The session starts the night before", cue: "Bedtime is the first set.", text: "Short nights showed up before the sessions this week. Pick the bedtime that gives you seven and a half hours before the alarm and treat it as part of training, not as a nice-to-have." },
  { key: "visualise", title: "See the session before it starts", cue: "Thirty seconds with eyes closed, the whole thing done.", text: "Before Saturday's kettlebell, sit for thirty seconds and run the session in your head: the first swing, the sixth round when it burns, the last rep. The body follows a picture it has already seen." },
  { key: "nameIt", title: "Name the discomfort", cue: "This is hard. This is supposed to be hard.", text: "In the hard part of a run or a round, say to yourself what is happening: legs heavy, breathing loud, mind asking to stop. Named, it is a sensation. Unnamed, it is a reason to quit." },
  { key: "countBreaths", title: "Count breaths through the hard part", cue: "Ten breaths. Then ten more.", text: "When the effort peaks, stop thinking about the finish and count ten breaths. Then count ten more. The hard part is always shorter than it feels, and counting gives the mind one job." },
];

const skill = (key: string) => HEAD_SKILLS.find((s) => s.key === key)!;
const ROTATION = ["visualise", "nameIt", "countBreaths", "startSlow", "process", "talkTest"];

/** This week's skill: the first rule that fires, else the rotation by week number. */
export function headSkillFor(n: WeekNumbers, ctx: { missedSessions: number; run5kPct: number | null }): HeadSkill {
  const hard = n.runs.hardest && ((n.runs.hardest.hrAvg ?? 0) >= 170 || (n.runs.hardest.hrMax ?? 0) >= 185);
  if (n.threeInRow) return skill("restIsTraining");
  if (n.sleep.nights >= 3 && n.sleep.avgMin !== null && n.sleep.avgMin < 390) return skill("nightBefore");
  if (ctx.missedSessions >= 2) return skill("showUp");
  if (n.kb.rounds !== null && n.kb.best !== null && n.kb.rounds < n.kb.best) return skill("oneMore");
  if (n.runs.n >= 2 && hard && n.runs.pace !== null) return skill("startSlow");
  if (ctx.run5kPct !== null && ctx.run5kPct < 0.2 && n.runs.n > 0) return skill("process");
  const wk = Number(n.week.split("-W")[1] ?? 1);
  return skill(ROTATION[wk % ROTATION.length]);
}

export type CoachReport = {
  week: string; from: string; to: string;
  headline: string;           // the first line · the push body
  text: string;               // markdown · "## " sections
  head: HeadSkill;
  numbers: WeekNumbers;
  objectives: { id: string; title: string; valueLabel: string; targetLabel: string; pct: number; state: ProgressState }[];
  createdAt: number;
};
