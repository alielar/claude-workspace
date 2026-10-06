/**
 * Apple Watch data · read side (server only). What the Health tab and the Train
 * tab's Body half show: the last 30 nights, the last 30 days of each daily
 * metric, the last 60 workouts without their heavy arrays, and one workout with
 * its route, heart-rate trace and splits.
 */

import { db } from "@/db";
import { healthMetrics, healthSleep, healthWorkouts, healthWorkoutSeries } from "@/db/schema";
import { and, desc, eq, gte } from "drizzle-orm";
import { ensureHealthTables, pipeStatus, type PipeStatus } from "./server";
import type { HrPoint, IntervalSeg, RoutePoint, Split } from "./types";

export type NightRow = {
  date: string; sleepStart: number | null; sleepEnd: number | null; inBedStart: number | null; inBedEnd: number | null;
  totalMin: number | null; coreMin: number | null; deepMin: number | null; remMin: number | null; awakeMin: number | null; inBedMin: number | null;
  score: number | null;
};
export type MetricPoint = { date: string; qty: number | null; min: number | null; avg: number | null; max: number | null };
export type WorkoutRow = {
  hkId: string; date: string; type: string; startMs: number; endMs: number | null; durationSec: number | null;
  distanceKm: number | null; activeKcal: number | null; totalKcal: number | null; hrAvg: number | null; hrMin: number | null; hrMax: number | null;
  steps: number | null; elevationM: number | null; source: string | null; hasRoute: boolean;
};
export type HealthSummary = {
  nights: NightRow[];                       // newest first, 30
  metrics: Record<string, { units: string | null; points: MetricPoint[] }>; // points oldest first, 30 days
  workouts: WorkoutRow[];                   // newest first, 60
  pipe: PipeStatus;                         // what Health Auto Export has really posted
  generatedAt: number;
};
export type WorkoutDetail = WorkoutRow & { route: RoutePoint[]; hr: HrPoint[]; splits: Split[]; intervals: IntervalSeg[] };

function ymdDaysAgo(days: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() - days * 86400000));
}

export async function healthSummary(userId: string): Promise<HealthSummary> {
  await ensureHealthTables();
  const since = ymdDaysAgo(31);
  const [nights, metricRows, workouts, withRoute, pipe] = await Promise.all([
    db.select().from(healthSleep).where(eq(healthSleep.userId, userId)).orderBy(desc(healthSleep.date)).limit(30),
    db.select().from(healthMetrics).where(and(eq(healthMetrics.userId, userId), gte(healthMetrics.date, since))).orderBy(healthMetrics.date),
    db.select({
      hkId: healthWorkouts.hkId, date: healthWorkouts.date, type: healthWorkouts.type, startMs: healthWorkouts.startMs, endMs: healthWorkouts.endMs,
      durationSec: healthWorkouts.durationSec, distanceKm: healthWorkouts.distanceKm, activeKcal: healthWorkouts.activeKcal, totalKcal: healthWorkouts.totalKcal,
      hrAvg: healthWorkouts.hrAvg, hrMin: healthWorkouts.hrMin, hrMax: healthWorkouts.hrMax, steps: healthWorkouts.steps, elevationM: healthWorkouts.elevationM, source: healthWorkouts.source,
    }).from(healthWorkouts).where(eq(healthWorkouts.userId, userId)).orderBy(desc(healthWorkouts.startMs)).limit(60),
    db.select({ hkId: healthWorkoutSeries.hkId }).from(healthWorkoutSeries).where(eq(healthWorkoutSeries.userId, userId)),
    pipeStatus(),
  ]);
  const routed = new Set(withRoute.map((r) => r.hkId));
  const metrics: HealthSummary["metrics"] = {};
  for (const m of metricRows) {
    (metrics[m.metric] ??= { units: m.units, points: [] }).points.push({ date: m.date, qty: m.qty, min: m.min, avg: m.avg, max: m.max });
  }
  return {
    nights: nights.map((n) => ({
      date: n.date, sleepStart: n.sleepStart, sleepEnd: n.sleepEnd, inBedStart: n.inBedStart, inBedEnd: n.inBedEnd,
      totalMin: n.totalMin, coreMin: n.coreMin, deepMin: n.deepMin, remMin: n.remMin, awakeMin: n.awakeMin, inBedMin: n.inBedMin, score: n.score,
    })),
    metrics,
    workouts: workouts.map((w) => ({ ...w, hasRoute: routed.has(w.hkId) })),
    pipe,
    generatedAt: Date.now(),
  };
}

export async function workoutDetail(userId: string, hkId: string): Promise<WorkoutDetail | null> {
  await ensureHealthTables();
  const [w] = await db.select().from(healthWorkouts).where(and(eq(healthWorkouts.userId, userId), eq(healthWorkouts.hkId, hkId))).limit(1);
  if (!w) return null;
  const [s] = await db.select().from(healthWorkoutSeries).where(eq(healthWorkoutSeries.hkId, hkId)).limit(1);
  const parse = <T,>(v: string | null): T[] => { try { return v ? (JSON.parse(v) as T[]) : []; } catch { return []; } };
  return {
    hkId: w.hkId, date: w.date, type: w.type, startMs: w.startMs, endMs: w.endMs, durationSec: w.durationSec,
    distanceKm: w.distanceKm, activeKcal: w.activeKcal, totalKcal: w.totalKcal, hrAvg: w.hrAvg, hrMin: w.hrMin, hrMax: w.hrMax,
    steps: w.steps, elevationM: w.elevationM, source: w.source, hasRoute: !!s?.route,
    route: parse<RoutePoint>(s?.route ?? null), hr: parse<HrPoint>(s?.hr ?? null), splits: parse<Split>(s?.splits ?? null),
    intervals: parse<IntervalSeg>(s?.intervals ?? null),
  };
}
