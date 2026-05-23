/**
 * POST /api/workouts/seed-history
 * Seeds March 16 → May 31 2026 with gym sessions (5/week, Mon–Fri).
 * Uses the user's existing exercise_db and workout plans.
 * Progressive weights: +1.25 kg per exercise encounter.
 * Skips dates that already have sessions.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { gymSessions, gymSets, exerciseDb, programs, workoutPlans, planExercises } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

// Build weekday dates (Mon–Fri) between two YYYY-MM-DD strings inclusive
function weekdays(start: string, end: string): string[] {
  const dates: string[] = [];
  const d = new Date(start + "T12:00:00Z");
  const endD = new Date(end + "T12:00:00Z");
  while (d <= endD) {
    const dow = d.getUTCDay(); // 0=Sun..6=Sat
    if (dow >= 1 && dow <= 5) {
      dates.push(d.toISOString().slice(0, 10));
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

// Base weights for common exercises (kg)
const BASE_WEIGHTS: Record<string, number> = {
  "incline dumbbell press": 20,
  "dumbbell press": 20,
  "dumbbell fly": 12,
  "dumbbell overhead press": 14,
  "dumbbell shoulder press": 14,
  "cable triceps pushdown": 25,
  "triceps pushdown": 25,
  "dumbbell lateral raise": 8,
  "lateral raise": 8,
  "rear delt": 8,
  "dumbbell wrist curl": 10,
  "wrist curl": 10,
  "cable lat pulldown": 40,
  "lat pulldown": 40,
  "dumbbell row": 20,
  "dumbbell pullover": 16,
  "dumbbell bicep curl": 12,
  "dumbbell curl": 12,
  "incline dumbbell curl": 10,
  "hammer curl": 10,
  "dumbbell shrug": 22,
  "goblet squat": 20,
  "dumbbell lunge": 14,
  "reverse lunge": 14,
  "bulgarian split squat": 12,
  "calf raise": 0,
  "romanian deadlift": 18,
  "russian twist": 8,
  "push-up": 0,
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

  // All weekdays Mar 16 → May 31
  const allDates = weekdays("2026-03-16", "2026-05-31");

  // Find dates that already have sessions
  const existingRows = await db
    .select({ date: gymSessions.date })
    .from(gymSessions)
    .where(
      and(
        eq(gymSessions.userId, userId),
        sql`${gymSessions.date} >= '2026-03-16'`,
        sql`${gymSessions.date} <= '2026-05-31'`
      )
    );
  const existingDates = new Set(existingRows.map((r) => r.date));
  const datesToSeed = allDates.filter((d) => !existingDates.has(d));

  if (datesToSeed.length === 0) {
    return NextResponse.json({ message: "All dates already have sessions", count: 0 });
  }

  // Get active program and plans
  const [prog] = await db
    .select({ id: programs.id })
    .from(programs)
    .where(and(eq(programs.userId, userId), eq(programs.isActive, true)))
    .limit(1);

  if (!prog) {
    return NextResponse.json({ error: "No active program found" }, { status: 400 });
  }

  const plans = await db
    .select({ id: workoutPlans.id, name: workoutPlans.name })
    .from(workoutPlans)
    .where(eq(workoutPlans.programId, prog.id))
    .orderBy(workoutPlans.sortOrder);

  if (plans.length === 0) {
    return NextResponse.json({ error: "No workout plans found" }, { status: 400 });
  }

  // Get exercises for each plan
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

  // Progressive overload tracking
  const exerciseHitCount = new Map<number, number>();
  let sessionsCreated = 0;

  for (let i = 0; i < datesToSeed.length; i++) {
    const date = datesToSeed[i];
    const plan = plans[i % plans.length];
    const exercises = planExMap.get(plan.id) ?? [];
    if (exercises.length === 0) continue;

    // Vary duration: 35–65 min
    const durationSeconds = (35 + Math.floor(Math.random() * 30)) * 60;

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

      // Parse set config or default to 3 standard sets
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
          { type: "warmup", repMin: 12, repMax: 15 },
          { type: "standard", repMin: 8, repMax: 12 },
          { type: "standard", repMin: 8, repMax: 12 },
          { type: "standard", repMin: 8, repMax: 12 },
        ];
      }

      for (const sc of setConfigs) {
        setNumber++;
        const reps = sc.repMin + Math.floor(Math.random() * (sc.repMax - sc.repMin + 1));
        const setWeight = sc.type === "warmup" ? Math.round(weight * 0.6 * 2) / 2 : weight;

        await db.insert(gymSets).values({
          sessionId: newSession.id,
          exerciseId: ex.exerciseId,
          exerciseName: ex.name,
          setNumber,
          setType: sc.type,
          weightKg: setWeight > 0 ? setWeight : null,
          reps,
        });
      }
    }

    sessionsCreated++;
  }

  return NextResponse.json({
    message: `Seeded ${sessionsCreated} sessions from March 16 to May 31, 2026`,
    count: sessionsCreated,
  });
}
