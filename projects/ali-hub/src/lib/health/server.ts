/**
 * Apple Watch data · storage (server only). Tables self-create on first use (the
 * same DDL is in POST /api/admin/migrate) so tomorrow's first HAE post cannot
 * hit a missing table. Every write is an upsert keyed by day / HealthKit id, so
 * HAE re-sending the last 7 days every hour is harmless.
 */

import { db } from "@/db";
import { healthMetrics, healthSleep, healthWorkouts } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { sleepScore, type Parsed, type SleepNight } from "./types";

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
  }
  for (const m of p.metrics) {
    const row = { userId, date: m.date, metric: m.metric, qty: m.qty, min: m.min, avg: m.avg, max: m.max, units: m.units, updatedAt: now };
    await db.insert(healthMetrics).values(row).onConflictDoUpdate({ target: [healthMetrics.userId, healthMetrics.date, healthMetrics.metric], set: keepKnown(row, ["userId", "date", "metric"]) });
  }
  return { sleep: p.sleep.length, workouts: p.workouts.length, metrics: p.metrics.length, skipped: p.skipped.length };
}

/** Keep the last 30 raw posts (bodies capped at 200 KB) for debugging the payload shape. */
export async function logRaw(automation: string | null, body: string, summary: string): Promise<void> {
  await ensureHealthTables();
  try {
    await db.run(sql`INSERT INTO health_raw (automation, bytes, summary, body) VALUES (${automation}, ${body.length}, ${summary}, ${body.slice(0, 200_000)})`);
    await db.run(sql`DELETE FROM health_raw WHERE id NOT IN (SELECT id FROM health_raw ORDER BY id DESC LIMIT 30)`);
  } catch { /* debugging aid only */ }
}

export type HealthStatus = {
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
  const [cnt] = await db.select({ nights: sql<number>`(SELECT COUNT(*) FROM health_sleep WHERE user_id = ${userId})`, workouts: sql<number>`(SELECT COUNT(*) FROM health_workouts WHERE user_id = ${userId})` }).from(healthSleep).limit(1)
    .catch(() => [{ nights: 0, workouts: 0 }]);
  const raw = await db.all<{ received_at: number; automation: string | null; summary: string }>(sql`SELECT received_at, automation, summary FROM health_raw ORDER BY id DESC LIMIT 1`).catch(() => []);
  return {
    lastSleep: s ? { date: s.date, totalMin: s.totalMin, score: s.score, receivedAt: s.updatedAt } : null,
    lastWorkout: w ? { date: w.date, type: w.type, receivedAt: w.updatedAt } : null,
    lastMetric: m ? { date: m.date, metric: m.metric, receivedAt: m.updatedAt } : null,
    lastPost: raw[0] ? { receivedAt: raw[0].received_at, automation: raw[0].automation, summary: raw[0].summary } : null,
    nights: Number(cnt?.nights ?? 0),
    workouts: Number(cnt?.workouts ?? 0),
  };
}
