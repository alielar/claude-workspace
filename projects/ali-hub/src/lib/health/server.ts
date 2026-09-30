/**
 * Apple Watch data · storage (server only). Tables self-create on first use (the
 * same DDL is in POST /api/admin/migrate) so tomorrow's first HAE post cannot
 * hit a missing table. Every write is an upsert keyed by day / HealthKit id, so
 * HAE re-sending the last 7 days every hour is harmless.
 */

import { db } from "@/db";
import { healthMetrics, healthSleep, healthWorkouts, healthWorkoutSeries } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { parseHaePayload, sleepScore, type Parsed, type SleepNight } from "./types";

export const HEALTH_DDL = [
  `CREATE TABLE IF NOT EXISTS health_sleep (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    sleep_start INTEGER, sleep_end INTEGER, in_bed_start INTEGER, in_bed_end INTEGER,
    total_min INTEGER, core_min INTEGER, deep_min INTEGER, rem_min INTEGER, awake_min INTEGER, in_bed_min INTEGER,
    score INTEGER, source TEXT,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    UNIQUE(user_id, date))`,
  `CREATE TABLE IF NOT EXISTS health_workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    hk_id TEXT NOT NULL UNIQUE,
    date TEXT NOT NULL, type TEXT NOT NULL,
    start_ms INTEGER NOT NULL, end_ms INTEGER, duration_sec INTEGER,
    distance_km REAL, active_kcal INTEGER, total_kcal INTEGER,
    hr_avg INTEGER, hr_min INTEGER, hr_max INTEGER,
    steps INTEGER, elevation_m INTEGER, intensity_met REAL, source TEXT,
    raw TEXT NOT NULL DEFAULT '{}',
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000))`,
  `CREATE TABLE IF NOT EXISTS health_workout_series (
    hk_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    route TEXT, hr TEXT, splits TEXT,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000))`,
  `CREATE TABLE IF NOT EXISTS health_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL, metric TEXT NOT NULL,
    qty REAL, min REAL, avg REAL, max REAL, units TEXT,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    UNIQUE(user_id, date, metric))`,
  // The last few raw posts, for checking what HAE really sends (docs and reality differ).
  `CREATE TABLE IF NOT EXISTS health_raw (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    received_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    automation TEXT, bytes INTEGER NOT NULL, summary TEXT NOT NULL, body TEXT NOT NULL)`,
];

let ready: Promise<void> | null = null;
export function ensureHealthTables(): Promise<void> {
  ready ??= (async () => {
    for (const ddl of HEALTH_DDL) { try { await db.run(sql.raw(ddl)); } catch { /* exists */ } }
  })();
  return ready;
}

export type IngestResult = { sleep: number; workouts: number; metrics: number; skipped: number };

/** `COALESCE(excluded.x, x)` · a later, thinner post (HAE "since last sync") never blanks a value we already have. */
function keepKnown<T extends Record<string, unknown>>(row: T, skip: string[]): Record<string, unknown> {
  const set: Record<string, unknown> = {};
  for (const k of Object.keys(row)) {
    if (skip.includes(k)) continue;
    const col = k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
    set[k] = k === "updatedAt" ? row[k] : sql.raw(`COALESCE(excluded.${col}, ${col})`);
  }
  return set;
}

export async function storeParsed(userId: string, p: Parsed): Promise<IngestResult> {
  await ensureHealthTables();
  const now = Date.now();
  for (const n0 of p.sleep) {
    // Merge with the stored night first so the score is computed from everything known
    // (a thin repost without stages must not overwrite a fuller night's score).
    const [prev] = await db.select().from(healthSleep).where(and(eq(healthSleep.userId, userId), eq(healthSleep.date, n0.date))).limit(1);
    const n: SleepNight = { ...n0 };
    if (prev) {
      for (const k of ["sleepStart", "sleepEnd", "inBedStart", "inBedEnd", "totalMin", "coreMin", "deepMin", "remMin", "awakeMin", "inBedMin", "source"] as const) {
        if (n[k] === null && prev[k] !== null) (n as Record<string, unknown>)[k] = prev[k];
      }
    }
    n.score = sleepScore(n);
    const row = {
      userId, date: n.date, sleepStart: n.sleepStart, sleepEnd: n.sleepEnd, inBedStart: n.inBedStart, inBedEnd: n.inBedEnd,
      totalMin: n.totalMin, coreMin: n.coreMin, deepMin: n.deepMin, remMin: n.remMin, awakeMin: n.awakeMin, inBedMin: n.inBedMin,
      score: n.score, source: n.source, updatedAt: now,
    };
    const { userId: _u, date: _d, ...set } = row; void _u; void _d;
    await db.insert(healthSleep).values(row).onConflictDoUpdate({ target: [healthSleep.userId, healthSleep.date], set });
  }
  for (const w of p.workouts) {
    const row = {
      userId, hkId: w.hkId, date: w.date, type: w.type, startMs: w.startMs, endMs: w.endMs, durationSec: w.durationSec,
      distanceKm: w.distanceKm, activeKcal: w.activeKcal, totalKcal: w.totalKcal, hrAvg: w.hrAvg, hrMin: w.hrMin, hrMax: w.hrMax,
      steps: w.steps, elevationM: w.elevationM, intensityMet: w.intensityMet, source: w.source, raw: JSON.stringify(w.raw), updatedAt: now,
    };
    await db.insert(healthWorkouts).values(row).onConflictDoUpdate({ target: healthWorkouts.hkId, set: keepKnown(row, ["userId", "hkId"]) });
    if (w.series) {
      // A thinner repost (HAE "since last sync" without the route) must not blank a trace we already hold.
      const sr = {
        hkId: w.hkId, userId,
        route: w.series.route.length ? JSON.stringify(w.series.route) : null,
        hr: w.series.hr.length ? JSON.stringify(w.series.hr) : null,
        splits: w.series.splits.length ? JSON.stringify(w.series.splits) : null,
        updatedAt: now,
      };
      await db.insert(healthWorkoutSeries).values(sr).onConflictDoUpdate({ target: healthWorkoutSeries.hkId, set: keepKnown(sr, ["userId", "hkId"]) });
    }
  }
  // Metrics in chunks of 60 rows per statement · one round trip each instead of one per row (the 30 s timeout, 2026-09-30).
  const rows = p.metrics.map((m) => ({ userId, date: m.date, metric: m.metric, qty: m.qty, min: m.min, avg: m.avg, max: m.max, units: m.units, updatedAt: now }));
  for (let i = 0; i < rows.length; i += 60) {
    const chunk = rows.slice(i, i + 60);
    await db.insert(healthMetrics).values(chunk).onConflictDoUpdate({ target: [healthMetrics.userId, healthMetrics.date, healthMetrics.metric], set: keepKnown(chunk[0], ["userId", "date", "metric"]) });
  }
  return { sleep: p.sleep.length, workouts: p.workouts.length, metrics: p.metrics.length, skipped: p.skipped.length };
}

/** Keep the last 30 raw posts (bodies capped at 1.5 MB · a sleep post with 12 metrics is ~800 KB) for debugging the payload shape. */
export async function logRaw(automation: string | null, body: string, summary: string): Promise<void> {
  await ensureHealthTables();
  try {
    await db.run(sql`INSERT INTO health_raw (automation, bytes, summary, body) VALUES (${automation}, ${body.length}, ${summary}, ${body.slice(0, 1_500_000)})`);
    await db.run(sql`DELETE FROM health_raw WHERE id NOT IN (SELECT id FROM health_raw ORDER BY id DESC LIMIT 30)`);
  } catch { /* debugging aid only */ }
}

/** The last raw posts, reduced to what each one carried (metric names + sample counts, workout types) · for checking the HAE automation set-up. */
export async function rawPosts(limit = 12): Promise<Array<{ receivedAt: number; automation: string | null; summary: string; bytes: number; metrics: Record<string, number>; workouts: string[]; sleep: unknown[] }>> {
  await ensureHealthTables();
  const rows = await db.all<{ received_at: number; automation: string | null; summary: string; bytes: number; body: string }>(sql`SELECT received_at, automation, summary, bytes, body FROM health_raw ORDER BY id DESC LIMIT ${limit}`).catch(() => []);
  return rows.map((r) => {
    const metrics: Record<string, number> = {}; const workouts: string[] = []; const sleep: unknown[] = [];
    try {
      const j = JSON.parse(r.body) as { data?: { metrics?: Array<{ name?: string; data?: unknown[] }>; workouts?: Array<{ name?: string }> } };
      for (const m of j.data?.metrics ?? []) if (m?.name) metrics[m.name] = Array.isArray(m.data) ? m.data.length : 0;
      // The sleep rows as sent (first 3) · the one place to see HAE's real sleep shape when the parser skips them.
      for (const m of j.data?.metrics ?? []) if (m?.name === "sleep_analysis" && Array.isArray(m.data)) sleep.push(...m.data.slice(0, 3));
      for (const w of j.data?.workouts ?? []) if (w?.name) workouts.push(w.name);
    } catch {
      // Body capped at 200 KB (a run with its route is ~1 MB) · fall back to the ingest summary "sleep n · workouts n · metrics n".
      const sl = /sleep (\d+)/.exec(r.summary), wo = /workouts (\d+)/.exec(r.summary);
      if (sl && Number(sl[1]) > 0) metrics.sleep_analysis = Number(sl[1]);
      for (let i = 0; i < Number(wo?.[1] ?? 0); i++) workouts.push("workout");
    }
    return { receivedAt: r.received_at, automation: r.automation, summary: r.summary, bytes: r.bytes, metrics, workouts, sleep };
  });
}

/**
 * What the pipe has really carried, read from the last raw posts · the one honest answer to
 * "why is there no sleep / no run": HAE's automations post only what they were told to.
 * A REST automation has ONE Data Type (Health Metrics or Workouts), so sleep needs the
 * sleep_analysis metric selected and workouts need a second automation.
 */
export type PipeStatus = {
  posts: number;                // raw posts kept (max 30)
  lastAt: number | null;        // ms of the newest post
  automations: string[];        // names seen (HAE's automation-name header)
  carried: string[];            // metric names seen across the kept posts
  sleepSeen: boolean;           // any post carried sleep_analysis
  workoutsSeen: boolean;        // any post carried a workout
};

export async function pipeStatus(): Promise<PipeStatus> {
  const posts = await rawPosts(30);
  const carried = new Set<string>(), automations = new Set<string>();
  let sleepSeen = false, workoutsSeen = false;
  for (const p of posts) {
    if (p.automation) automations.add(p.automation);
    for (const m of Object.keys(p.metrics)) { carried.add(m); if (m === "sleep_analysis") sleepSeen = true; }
    if (p.workouts.length) workoutsSeen = true;
  }
  return { posts: posts.length, lastAt: posts[0]?.receivedAt ?? null, automations: [...automations], carried: [...carried].sort(), sleepSeen, workoutsSeen };
}

export type HealthStatus = {
  pipe: PipeStatus;
  lastSleep: { date: string; totalMin: number | null; score: number | null; receivedAt: number } | null;
  lastWorkout: { date: string; type: string; receivedAt: number } | null;
  lastMetric: { date: string; metric: string; receivedAt: number } | null;
  lastPost: { receivedAt: number; automation: string | null; summary: string } | null;
  nights: number;
  workouts: number;
};

export async function healthStatus(userId: string): Promise<HealthStatus> {
  await ensureHealthTables();
  const [s] = await db.select().from(healthSleep).where(eq(healthSleep.userId, userId)).orderBy(desc(healthSleep.date)).limit(1);
  const [w] = await db.select().from(healthWorkouts).where(eq(healthWorkouts.userId, userId)).orderBy(desc(healthWorkouts.startMs)).limit(1);
  const [m] = await db.select().from(healthMetrics).where(and(eq(healthMetrics.userId, userId))).orderBy(desc(healthMetrics.updatedAt)).limit(1);
  // One scalar row · selecting FROM health_sleep returned nothing while there was no night, so both counts read 0.
  const cnt = await db.get<{ nights: number; workouts: number }>(sql`SELECT (SELECT COUNT(*) FROM health_sleep WHERE user_id = ${userId}) AS nights, (SELECT COUNT(*) FROM health_workouts WHERE user_id = ${userId}) AS workouts`)
    .catch(() => ({ nights: 0, workouts: 0 }));
  const raw = await db.all<{ received_at: number; automation: string | null; summary: string }>(sql`SELECT received_at, automation, summary FROM health_raw ORDER BY id DESC LIMIT 1`).catch(() => []);
  const pipe = await pipeStatus();
  return {
    pipe,
    lastSleep: s ? { date: s.date, totalMin: s.totalMin, score: s.score, receivedAt: s.updatedAt } : null,
    lastWorkout: w ? { date: w.date, type: w.type, receivedAt: w.updatedAt } : null,
    lastMetric: m ? { date: m.date, metric: m.metric, receivedAt: m.updatedAt } : null,
    lastPost: raw[0] ? { receivedAt: raw[0].received_at, automation: raw[0].automation, summary: raw[0].summary } : null,
    nights: Number(cnt?.nights ?? 0),
    workouts: Number(cnt?.workouts ?? 0),
  };
}

/**
 * Re-parse the kept raw posts with today's parser and store them again (every write is an upsert).
 * For when the parser learns a shape after the phone already posted it (the `asleep: 0` night, 2026-09-30).
 */
export async function replayRaw(userId: string, limit = 30): Promise<{ posts: number; sleep: number; workouts: number; metrics: number; skipped: string[] }> {
  await ensureHealthTables();
  const rows = await db.all<{ body: string }>(sql`SELECT body FROM health_raw ORDER BY id DESC LIMIT ${limit}`).catch(() => []);
  const out = { posts: 0, sleep: 0, workouts: 0, metrics: 0, skipped: [] as string[] };
  for (const r of rows) {
    let body: unknown;
    try { body = JSON.parse(r.body); } catch { continue; } // truncated (kept before the cap was raised)
    const parsed = parseHaePayload(body);
    const res = await storeParsed(userId, parsed);
    out.posts++; out.sleep += res.sleep; out.workouts += res.workouts; out.metrics += res.metrics;
    out.skipped.push(...parsed.skipped.slice(0, 3));
  }
  return out;
}
