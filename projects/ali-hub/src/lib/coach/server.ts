/**
 * The coach · server side (spec §7c item 15, Ali 2026-10-04).
 *   train_objectives · Ali's goals (seeded once from coach/types.ts seedObjectives, editable, upsert by id)
 *   train_reports    · one weekly report per ISO week: the numbers (fixed rules), the Head skill,
 *                      and the ONLY AI prose in training: a coach's 300 words through askAI
 *                      (Gemini first, Haiku second · one call a week, about 3 cents a month).
 * The Sunday 20:00 push comes from the reminders tick (ensureCoachReport + pushReport).
 */

import { db } from "@/db";
import { healthMetrics, healthSleep, healthWorkouts, kbSessions } from "@/db/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { ensureHealthTables } from "@/lib/health/server";
import type { HealthSummary, WorkoutRow } from "@/lib/health/summary";
import { fmtMin, fmtPace, isoWeekOf } from "@/lib/health/client";
import { rowToSession } from "@/lib/train/rows";
import type { TrainSession } from "@/lib/train/types";
import { askAI, lastAiError } from "@/lib/news/summarize";
import { noDash } from "@/lib/utils";
import { sendToUser } from "@/lib/push/server";
import { checklistToday } from "@/lib/checklist/day";
import { fmtSec, headSkillFor, mondayOf, objectiveProgress, PROGRAM_START_DAY, seedObjectives, shiftDay, weekNumbers, type CoachReport, type Objective, type ProgressData, type WeekNumbers } from "./types";

export const COACH_DDL = [
  `CREATE TABLE IF NOT EXISTS train_objectives (
    id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL, title TEXT NOT NULL, target REAL NOT NULL, due TEXT NOT NULL, started_at TEXT NOT NULL,
    start_value REAL, note TEXT, done INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    PRIMARY KEY (user_id, id))`,
  `CREATE TABLE IF NOT EXISTS train_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week TEXT NOT NULL, content TEXT NOT NULL, pushed_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_train_report ON train_reports(user_id, week)`,
];

let ready: Promise<void> | null = null;
export function ensureCoachTables(): Promise<void> {
  ready ??= (async () => { for (const ddl of COACH_DDL) { try { await db.run(sql.raw(ddl)); } catch { /* exists */ } } })();
  return ready;
}

type ObjRow = { id: string; kind: string; title: string; target: number; due: string; started_at: string; start_value: number | null; note: string | null; done: number; deleted: number; updated_at: number };
const objOf = (r: ObjRow): Objective => ({ id: r.id, kind: r.kind as Objective["kind"], title: r.title, target: r.target, due: r.due, startedAt: r.started_at, startValue: r.start_value, note: r.note, done: !!r.done, updatedAt: r.updated_at });

// ─── Data ─────────────────────────────────────────────────────────────────────

export type CoachData = ProgressData & { nights: { date: string; totalMin: number | null }[]; metrics: HealthSummary["metrics"] };

const ymdDaysAgo = (days: number) => shiftDay(checklistToday(), -days);

/** 100 days of workouts and kettlebell sessions, 60 nights, 60 days of metrics · what objectives and the report need. */
export async function coachData(userId: string): Promise<CoachData> {
  await ensureHealthTables();
  const since = ymdDaysAgo(100), since60 = ymdDaysAgo(60);
  const [workouts, kb, nights, metricRows] = await Promise.all([
    db.select({
      hkId: healthWorkouts.hkId, date: healthWorkouts.date, type: healthWorkouts.type, startMs: healthWorkouts.startMs, endMs: healthWorkouts.endMs,
      durationSec: healthWorkouts.durationSec, distanceKm: healthWorkouts.distanceKm, activeKcal: healthWorkouts.activeKcal, totalKcal: healthWorkouts.totalKcal,
      hrAvg: healthWorkouts.hrAvg, hrMin: healthWorkouts.hrMin, hrMax: healthWorkouts.hrMax, steps: healthWorkouts.steps, elevationM: healthWorkouts.elevationM, source: healthWorkouts.source,
    }).from(healthWorkouts).where(and(eq(healthWorkouts.userId, userId), gte(healthWorkouts.date, since))).orderBy(desc(healthWorkouts.startMs)),
    db.select().from(kbSessions).where(and(eq(kbSessions.userId, userId), gte(kbSessions.date, since))),
    db.select({ date: healthSleep.date, totalMin: healthSleep.totalMin }).from(healthSleep).where(and(eq(healthSleep.userId, userId), gte(healthSleep.date, since60))),
    db.select().from(healthMetrics).where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.date, since60))).orderBy(healthMetrics.date),
  ]);
  const metrics: HealthSummary["metrics"] = {};
  for (const m of metricRows) (metrics[m.metric] ??= { units: m.units, points: [] }).points.push({ date: m.date, qty: m.qty, min: m.min, avg: m.avg, max: m.max });
  const rows: WorkoutRow[] = workouts.map((w) => ({ ...w, hasRoute: false }));
  const sessions: TrainSession[] = kb.map(rowToSession);
  return { today: checklistToday(), workouts: rows, kb: sessions, nights, metrics };
}

// ─── Objectives ───────────────────────────────────────────────────────────────

const KIND_ORDER: Objective["kind"][] = ["run5k", "strengthWeeks", "kbRounds", "vo2max"];

export async function listObjectives(userId: string, data?: CoachData): Promise<Objective[]> {
  await ensureCoachTables();
  const rows = await db.all<ObjRow>(sql`SELECT id, kind, title, target, due, started_at, start_value, note, done, deleted, updated_at FROM train_objectives WHERE user_id = ${userId} ORDER BY created_at`);
  if (rows.length) return rows.filter((r) => !r.deleted).map(objOf).sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.due.localeCompare(b.due));
  // First visit: seed Ali's goals from the data of the day (targets stay editable).
  const seed = seedObjectives(data ?? (await coachData(userId)));
  for (const o of seed) await upsertObjective(userId, o);
  return seed;
}

export async function upsertObjective(userId: string, o: Objective & { deleted?: boolean }): Promise<void> {
  await ensureCoachTables();
  await db.run(sql`INSERT INTO train_objectives (id, user_id, kind, title, target, due, started_at, start_value, note, done, deleted, updated_at)
    VALUES (${o.id}, ${userId}, ${o.kind}, ${noDash(o.title).slice(0, 120)}, ${o.target}, ${o.due}, ${o.startedAt}, ${o.startValue}, ${o.note ? noDash(o.note).slice(0, 300) : null}, ${o.done ? 1 : 0}, ${o.deleted ? 1 : 0}, ${o.updatedAt})
    ON CONFLICT(user_id, id) DO UPDATE SET kind = excluded.kind, title = excluded.title, target = excluded.target, due = excluded.due, started_at = excluded.started_at,
      start_value = excluded.start_value, note = excluded.note, done = excluded.done, deleted = excluded.deleted, updated_at = excluded.updated_at
    WHERE excluded.updated_at >= train_objectives.updated_at`);
}

// ─── Reports ──────────────────────────────────────────────────────────────────

type ReportRow = { week: string; content: string; pushed_at: number | null; created_at: number };
const J = <T,>(s: string, fallback: T): T => { try { return JSON.parse(s) as T; } catch { return fallback; } };

export async function getCoachReport(userId: string, week: string): Promise<CoachReport | null> {
  await ensureCoachTables();
  const [r] = await db.all<ReportRow>(sql`SELECT week, content, pushed_at, created_at FROM train_reports WHERE user_id = ${userId} AND week = ${week} LIMIT 1`);
  return r ? J<CoachReport | null>(r.content, null) : null;
}

export async function listCoachReports(userId: string, n = 12): Promise<{ week: string; from: string; to: string; headline: string; createdAt: number }[]> {
  await ensureCoachTables();
  const rows = await db.all<ReportRow>(sql`SELECT week, content, pushed_at, created_at FROM train_reports WHERE user_id = ${userId} ORDER BY week DESC LIMIT ${n}`);
  return rows.map((r) => { const c = J<CoachReport | null>(r.content, null); return { week: r.week, from: c?.from ?? "", to: c?.to ?? "", headline: c?.headline ?? "", createdAt: r.created_at }; });
}

/** The last failure of the writer, for the page's one quiet line. */
export let lastCoachError: string | null = null;

const line = (n: WeekNumbers, missed: number, planned: number) => [
  `Week ${n.from} to ${n.to}. Sessions done: ${n.sessionDays} days with a session (${planned ? `${planned - missed} of ${planned} planned, ${missed} missed` : "no plan to judge against"}), strength days ${n.strengthDays}.`,
  `Runs: ${n.runs.n} (${n.runs.km} km, ${n.runs.pace ? `average pace ${fmtPace(n.runs.pace)}` : "no pace"}, longest ${n.runs.longestKm.toFixed(1)} km${n.runs.hardest ? `, hardest run ${n.runs.hardest.hrAvg ?? "?"} bpm average, ${n.runs.hardest.hrMax ?? "?"} max` : ""}). Last week: ${n.prev.runsN} runs, ${n.prev.runsKm} km.`,
  `Strength on the Watch: ${n.strength.n} sessions, ${n.strength.min} min${n.strength.hrAvg ? `, ${n.strength.hrAvg} bpm average` : ""}. Last week: ${n.prev.strengthN}.`,
  `Kettlebell 30: ${n.kb.rounds !== null ? `${n.kb.rounds} rounds on ${n.kb.date}` : "not done"}${n.kb.best !== null ? ` (best in 8 weeks: ${n.kb.best})` : ""}. Last week: ${n.prev.kbRounds ?? "not done"}.`,
  `Sleep: ${n.sleep.avgMin !== null ? `${fmtMin(Math.round(n.sleep.avgMin))} a night over ${n.sleep.nights} nights, ${n.sleep.shortNights} under 6 h 30` : "no nights recorded"}${n.prev.sleepAvgMin !== null ? `; last week ${fmtMin(Math.round(n.prev.sleepAvgMin))}` : ""}.`,
  `Resting heart rate: ${n.restingHr.week ?? "?"} this week vs ${n.restingHr.before ?? "?"} the month before. HRV: ${n.hrv.week ?? "?"} vs ${n.hrv.before ?? "?"}. Exercise minutes: ${n.exerciseMin ?? "?"}.${n.threeInRow ? ` Training days in a row with no rest between: ${n.rowDays.join(", ")}.` : ""}`,
].join("\n");

/**
 * Build (once) the report of the week containing `weekOf` · numbers and the Head skill are fixed rules,
 * the prose is one askAI call. With `force` the prose is rewritten. Null only when the writer fails
 * (the page then shows the numbers and the skill from the phone, and the tick tries again).
 */
export async function ensureCoachReport(userId: string, weekOf: string, opts: { force?: boolean; planned?: number; missed?: number } = {}): Promise<CoachReport | null> {
  await ensureCoachTables();
  const week = isoWeekOf(mondayOf(weekOf));
  if (!opts.force) { const have = await getCoachReport(userId, week); if (have) return have; }
  const data = await coachData(userId);
  const objectives = await listObjectives(userId, data);
  const n = weekNumbers(data, weekOf);
  const progress = objectives.filter((o) => !o.done).map((o) => ({ o, p: objectiveProgress(o, data) }));
  const run5k = progress.find((x) => x.o.kind === "run5k");
  const head = headSkillFor(n, { missedSessions: opts.missed ?? 0, run5kPct: run5k && run5k.p.state !== "wait" ? run5k.p.pct : null });
  const objLines = progress.map(({ o, p }) => `- ${o.title} (by ${o.due}): ${p.valueLabel} now, target ${p.targetLabel} · ${p.state === "wait" ? "no data yet" : p.state} · ${p.line}`).join("\n");
  const beforeProgram = n.to < PROGRAM_START_DAY;
  const prompt = `You are Ali's training coach. Write his weekly training report for the week below. He is 30s, trains five days a week (Push and Pull on a Speediance machine, a sprint run, a long run, Kettlebell 30 on Saturday), wears an Apple Watch, and his goals are a 5 km under 20 minutes one day, a toned body and feeling strong. Tone: a coach who knows him, direct and warm, no cheerleading, no filler, no jargon. Plain words, short sentences. A number only when it carries the point. Never an em dash: commas and full stops only. Never invent a number that is not below.

THE WEEK'S NUMBERS (fixed, from the Watch and the app):
${line(n, opts.missed ?? 0, opts.planned ?? 0)}
${beforeProgram ? `THE PROGRAM (Mon Push · Tue Sprint run · Wed Pull · Fri Long run · Sat Kettlebell 30) STARTS ON MONDAY ${PROGRAM_START_DAY}: this week came BEFORE it, so nothing was missed or skipped · describe what he did, judge nothing, and point him at the first week.` : opts.planned ? "" : "No plan is given for this week: count what he did, never call anything missed or skipped."}

OBJECTIVES:
${objLines || "- none set"}

HEAD SKILL OF THE WEEK (chosen by rule, you explain it in his context): ${head.title} · "${head.cue}" · ${head.text}

Write 220 to 300 words in markdown with EXACTLY five sections, in this order, each ONE short paragraph. The headings are exactly these five words or phrases and nothing more: "## The week", "## Recovery", "## Objectives", "## Head", "## Next week".
The week = what he did, honestly, against the plan when there is one. Recovery = what sleep and the night numbers say about how the body took it. Objectives = where the goals stand, one sentence each, the 5 km first; say "no data yet" where it says so, never scold for it. Head = the skill above, tied to something that happened this week. Next week = ONE firm instruction, the single most useful change, then one line on what to keep. The instruction must FIT THE PROGRAM, which is five sessions a week (Mon Push · Tue Sprint run · Wed Pull · Fri Long run · Sat Kettlebell 30, rest on Thursday and Sunday): never tell him to train less than it or to skip a program day unless the recovery numbers above are clearly off; "rest" means the two rest days and the sleep around the sessions. Never claim a trend across weeks you were not given numbers for.

Answer with JSON only: {"headline": "one line of at most 12 words that sums the week, for a notification", "text": "the markdown"}`;
  const raw = await askAI(prompt, 1800);
  const m = raw ? /\{[\s\S]*\}/.exec(raw) : null;
  let out: { headline?: string; text?: string } | null = null;
  try { out = m ? (JSON.parse(m[0]) as { headline?: string; text?: string }) : null; } catch { out = null; }
  if (!out?.text || (out.text.match(/^## /gm) ?? []).length < 4) { lastCoachError = lastAiError ?? "the writer answered badly"; return null; }
  const report: CoachReport = {
    week, from: n.from, to: n.to,
    headline: noDash(String(out.headline ?? "")).slice(0, 120) || `${n.sessionDays} training days · ${n.runs.km} km · ${n.kb.rounds ?? 0} rounds`,
    text: noDash(out.text), head, numbers: n,
    objectives: progress.map(({ o, p }) => ({ id: o.id, title: o.title, valueLabel: p.valueLabel, targetLabel: p.targetLabel, pct: p.pct, state: p.state })),
    createdAt: Date.now(),
  };
  await db.run(sql`INSERT INTO train_reports (user_id, week, content) VALUES (${userId}, ${week}, ${JSON.stringify(report)})
    ON CONFLICT(user_id, week) DO UPDATE SET content = excluded.content`);
  lastCoachError = null;
  return report;
}

/** The Sunday push · once per report (pushed_at). */
export async function pushCoachReport(userId: string, report: CoachReport): Promise<boolean> {
  const [r] = await db.all<{ pushed_at: number | null }>(sql`SELECT pushed_at FROM train_reports WHERE user_id = ${userId} AND week = ${report.week} LIMIT 1`);
  if (!r || r.pushed_at) return false;
  await db.run(sql`UPDATE train_reports SET pushed_at = ${Date.now()} WHERE user_id = ${userId} AND week = ${report.week}`);
  await sendToUser(userId, { title: "Your week in training", body: report.headline, tag: `coach-${report.week}`, url: "/train/report" });
  return true;
}

export { fmtSec };
