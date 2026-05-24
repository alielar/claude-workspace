/**
 * POST /api/workouts/seed-history
 *
 * Seeds historical gym sessions only. Does NOT create workout plans or exercises.
 * Plans must already exist — this just backfills session history.
 *
 * Date range: March 16 → May 23, 2026
 * Frequency: Exactly 5 sessions per week, random day distribution
 * Rotation: Push / Pull / Legs / Push / Pull cycling
 * Idempotent: skips dates that already have sessions
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  gymSessions, gymSets, exerciseDb,
  programs, workoutPlans, planExercises,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

// ── Generate exactly 5 random training days per week ────────────────────────

function trainingDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const d = new Date(start + "T12:00:00Z");
  const endD = new Date(end + "T12:00:00Z");

  // Collect all days grouped by ISO week
  const weeks: string[][] = [];
  let currentWeek: string[] = [];
  let lastWeekKey = "";

  const iter = new Date(d);
  while (iter <= endD) {
    // ISO week key: year + week number
    const dayOfYear = Math.floor((iter.getTime() - new Date(Date.UTC(iter.getUTCFullYear(), 0, 1)).getTime()) / 86400000);
    const weekKey = `${iter.getUTCFullYear()}-${Math.ceil((dayOfYear + new Date(Date.UTC(iter.getUTCFullYear(), 0, 1)).getUTCDay() + 1) / 7)}`;

    if (weekKey !== lastWeekKey && currentWeek.length > 0) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
    lastWeekKey = weekKey;
    currentWeek.push(iter.toISOString().slice(0, 10));
    iter.setUTCDate(iter.getUTCDate() + 1);
  }
  if (currentWeek.length > 0) weeks.push(currentWeek);

  // Seeded random: pick exactly 5 days from each week (or all if fewer than 5 days in partial week)
  // Use a deterministic shuffle based on the week index for reproducibility
  for (let wi = 0; wi < weeks.length; wi++) {
    const week = weeks[wi];
    const count = Math.min(5, week.length);

    // Fisher-Yates with seeded pseudo-random (deterministic per week)
    const shuffled = [...week];
    let seed = wi * 7919 + 42;
    for (let i = shuffled.length - 1; i > 0; i--) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const j = seed % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const picked = shuffled.slice(0, count).sort();
    dates.push(...picked);
  }

  return dates;
}

// Base weights for exercises (kg)
const BASE_WEIGHTS: Record<string, number> = {
  "incline dumbbell press": 20, "flat dumbbell press": 22, "cable fly": 15,
  "dumbbell overhead press": 14, "dumbbell lateral raise": 8,
  "cable triceps pushdown": 25,
  "cable lat pulldown": 40, "dumbbell row": 20,
  "cable seated row": 35, "rear delt fly": 8,
  "dumbbell bicep curl": 12, "hammer curl": 10,
  "goblet squat": 20, "romanian deadlift": 18,
  "bulgarian split squat": 12, "leg curl": 30,
  "calf raise": 40, "leg extension": 30,
};

function getBaseWeight(name: string): number {
  const lower = name.toLowerCase();
  for (const [key, weight] of Object.entries(BASE_WEIGHTS)) {
    if (lower.includes(key)) return weight;
  }
  return 10;
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // ── Require existing program + plans ──────────────────────────────────────
  const [prog] = await db
    .select({ id: programs.id })
    .from(programs)
    .where(and(eq(programs.userId, userId), eq(programs.isActive, true)))
    .limit(1);

  if (!prog) {
    return NextResponse.json({ error: "No active program found. Create workouts first." }, { status: 400 });
  }

  const plans = await db
    .select({ id: workoutPlans.id, name: workoutPlans.name })
    .from(workoutPlans)
    .where(eq(workoutPlans.programId, prog.id))
    .orderBy(workoutPlans.sortOrder);

  if (plans.length === 0) {
    return NextResponse.json({ error: "No workout plans found. Create workouts first." }, { status: 400 });
  }

  // ── Generate dates: Mar 16 → May 23, exactly 5/week ──────────────────────
  const allDates = trainingDates("2026-03-16", "2026-05-23");

  // Skip dates that already have sessions (idempotent)
  const existingRows = await db
    .select({ date: gymSessions.date })
    .from(gymSessions)
    .where(
      and(
        eq(gymSessions.userId, userId),
        sql`${gymSessions.date} >= '2026-03-16'`,
        sql`${gymSessions.date} <= '2026-05-23'`
      )
    );
  const existingDates = new Set(existingRows.map((r) => r.date));
  const datesToSeed = allDates.filter((d) => !existingDates.has(d));

  if (datesToSeed.length === 0) {
    return NextResponse.json({
      message: "All dates already have sessions",
      sessionsCreated: 0,
    });
  }

  // ── Get exercises for each plan ───────────────────────────────────────────
  const planExMap = new Map<number, { exerciseId: number; name: string; setConfig: string }[]>();
  for (const plan of plans) {
    const rows = await db
      .select({
        exerciseId: planExercises.exerciseId,
        name: exerciseDb.name,
        setConfig: planExercises.setConfig,
      })
      .from(planExercises)
      .innerJoin(exerciseDb, eq(planExercises.exerciseId, exerciseDb.id))
      .where(eq(planExercises.planId, plan.id))
      .orderBy(planExercises.sortOrder);
    planExMap.set(plan.id, rows);
  }

  // ── Seed sessions ─────────────────────────────────────────────────────────
  const exerciseHitCount = new Map<number, number>();
  let sessionsCreated = 0;

  for (let i = 0; i < datesToSeed.length; i++) {
    const date = datesToSeed[i];
    const plan = plans[i % plans.length];
    const exercises = planExMap.get(plan.id) ?? [];
    if (exercises.length === 0) continue;

    const durationSeconds = (40 + Math.floor(Math.random() * 25)) * 60;

    const [newSession] = await db
      .insert(gymSessions)
      .values({
        userId,
        planId: plan.id,
        programId: prog.id,
        workoutName: plan.name,
        originalTemplateName: plan.name,
        date,
        durationSeconds,
      })
      .returning();

    let setNumber = 0;

    for (const ex of exercises) {
      const hits = exerciseHitCount.get(ex.exerciseId) ?? 0;
      exerciseHitCount.set(ex.exerciseId, hits + 1);

      const baseWeight = getBaseWeight(ex.name);
      const weight = Math.round((baseWeight + hits * 1.25) * 10) / 10;

      let setConfigs: { type: string; repMin: number; repMax: number }[] = [];
      try {
        const parsed = JSON.parse(ex.setConfig);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setConfigs = parsed.map((s: { type?: string; repMin?: number; repMax?: number }) => ({
            type: s.type ?? "standard",
            repMin: s.repMin ?? 8,
            repMax: s.repMax ?? 12,
          }));
        }
      } catch { /* use default */ }

      if (setConfigs.length === 0) {
        setConfigs = [
          { type: "standard", repMin: 8, repMax: 12 },
          { type: "standard", repMin: 8, repMax: 12 },
          { type: "standard", repMin: 8, repMax: 12 },
        ];
      }

      for (const sc of setConfigs) {
        setNumber++;
        const reps = sc.repMin + Math.floor(Math.random() * (sc.repMax - sc.repMin + 1));

        await db.insert(gymSets).values({
          sessionId: newSession.id,
          exerciseId: ex.exerciseId,
          exerciseName: ex.name,
          setNumber,
          setType: sc.type,
          weightKg: weight > 0 ? weight : null,
          reps,
        });
      }
    }

    sessionsCreated++;
  }

  return NextResponse.json({
    message: `Seeded ${sessionsCreated} sessions from March 16 to May 23, 2026`,
    sessionsCreated,
  });
}
