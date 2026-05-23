/**
 * POST /api/workouts/seed-history
 * Seeds April 2026 with ~19 gym sessions (5/week pattern) and progressive weights.
 * Uses the user's existing exercise_db entries. Skips if April already has data.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { gymSessions, gymSets, exerciseDb, programs, workoutPlans, planExercises } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

// Workout day schedule for April 2026 (5 days/week, Mon-Fri, skip weekends)
// April 1 = Wednesday, so: 1,2,3,4 (Wed-Fri+Mon?), etc.
// Actual April 2026 calendar:
// W1: Wed 1, Thu 2, Fri 3
// W2: Mon 7, Tue 8, Wed 9, Thu 10, Fri 11
// W3: Mon 14, Tue 15, Wed 16, Thu 17, Fri 18
// W4: Mon 21, Tue 22, Wed 23, Thu 24, Fri 25
// W5: Mon 28, Tue 29, Wed 30

const APRIL_TRAINING_DAYS = [
  1, 2, 3,           // W1: Wed-Fri (3 days)
  7, 8, 9, 10, 11,   // W2: Mon-Fri (5 days)
  14, 15, 16, 17, 18, // W3: Mon-Fri (5 days)
  21, 22, 23, 24, 25, // W4: Mon-Fri (5 days)
  28, 29,             // W5: Mon-Tue (2 days - partial)
];

// Take ~19 days from this list
const SEED_DAYS = APRIL_TRAINING_DAYS.slice(0, 20);

// Rotation pattern: cycles through plans in order
function getRotation(plans: { id: number; name: string }[]): { id: number; name: string }[] {
  if (plans.length === 0) return [];
  const rotation: { id: number; name: string }[] = [];
  for (let i = 0; i < SEED_DAYS.length; i++) {
    rotation.push(plans[i % plans.length]);
  }
  return rotation;
}

// Progressive weight: starts at baseWeight and adds increment each session for same exercise
function progressiveWeight(baseKg: number, sessionIndex: number, increment: number): number {
  return Math.round((baseKg + sessionIndex * increment) * 10) / 10;
}

// Base weights for common exercises (kg) - realistic beginner-intermediate
const BASE_WEIGHTS: Record<string, number> = {
  "low incline dumbbell press": 20,
  "dumbbell press": 20,
  "incline dumbbell press": 18,
  "dumbbell fly": 12,
  "seated dumbbell overhead press": 14,
  "dumbbell shoulder press": 14,
  "cable triceps pushdown": 25,
  "seated dumbbell lateral raise": 8,
  "dumbbell lateral raise": 8,
  "dumbbell rear delt fly": 8,
  "dumbbell wrist curl": 10,
  "cable lat pulldown": 40,
  "dumbbell row": 20,
  "dumbbell pullover": 16,
  "dumbbell bicep curl": 12,
  "dumbbell curl": 12,
  "incline dumbbell curl": 10,
  "dumbbell shrug": 22,
  "goblet squat": 20,
  "dumbbell lunge": 14,
  "dumbbell reverse lunge": 14,
  "bulgarian split squat": 12,
  "calf raise": 0,
  "dumbbell romanian deadlift": 18,
  "romanian deadlift": 18,
  "russian twist": 8,
};

function getBaseWeight(exerciseName: string): number {
  const lower = exerciseName.toLowerCase();
  for (const [key, weight] of Object.entries(BASE_WEIGHTS)) {
    if (lower.includes(key)) return weight;
  }
  return 10; // default
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // Check if April 2026 already has sessions
  const [existing] = await db
    .select({ count: sql<number>`count(*)` })
    .from(gymSessions)
    .where(
      and(
        eq(gymSessions.userId, userId),
        sql`${gymSessions.date} >= '2026-04-01'`,
        sql`${gymSessions.date} <= '2026-04-30'`
      )
    );

  if ((existing?.count ?? 0) > 0) {
    return NextResponse.json({ message: "April 2026 already has sessions", count: existing.count });
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

  // Track how many times each exercise has been hit (for progressive overload)
  const exerciseHitCount = new Map<number, number>();

  const rotation = getRotation(plans);
  let sessionsCreated = 0;

  for (let i = 0; i < SEED_DAYS.length && i < rotation.length; i++) {
    const day = SEED_DAYS[i];
    const plan = rotation[i];
    const date = `2026-04-${String(day).padStart(2, "0")}`;
    const exercises = planExMap.get(plan.id) ?? [];

    if (exercises.length === 0) continue;

    // Vary duration: 35-65 min
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
      const weight = progressiveWeight(baseWeight, hits, 1.25);

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
    message: `Seeded ${sessionsCreated} sessions in April 2026`,
    count: sessionsCreated,
  });
}
