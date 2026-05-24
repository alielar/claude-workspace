/**
 * POST /api/workouts/seed-history
 *
 * Comprehensive seed: creates workout plans + exercises if none exist,
 * then seeds gym sessions from March 16 → today (5–6 sessions/week).
 * Progressive weights: +1.25 kg per exercise encounter.
 * Idempotent: skips dates that already have sessions.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  gymSessions, gymSets, exerciseDb,
  programs, workoutPlans, planExercises,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

// ── Training dates (5–6 per week, Mon–Sat, skip some Saturdays) ──────────────

function trainingDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const d = new Date(start + "T12:00:00Z");
  const endD = new Date(end + "T12:00:00Z");

  while (d <= endD) {
    const dow = d.getUTCDay(); // 0=Sun..6=Sat
    const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil((((d.getTime() - jan1.getTime()) / 86400000) + jan1.getUTCDay() + 1) / 7);

    if (dow >= 1 && dow <= 5) {
      dates.push(d.toISOString().slice(0, 10));
    } else if (dow === 6 && weekNum % 3 !== 0) {
      dates.push(d.toISOString().slice(0, 10));
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

// ── Exercise definitions for Push / Pull / Legs ──────────────────────────────

const PLAN_DEFS = [
  {
    name: "Push",
    assignedDays: ["mon", "thu"],
    targetMuscles: ["chest", "front_delts", "side_delts", "triceps"],
    exercises: [
      { name: "Incline Dumbbell Press", muscle: "chest", equipment: "dumbbell", sets: 4, repMin: 8, repMax: 12 },
      { name: "Flat Dumbbell Press", muscle: "chest", equipment: "dumbbell", sets: 3, repMin: 8, repMax: 12 },
      { name: "Cable Fly", muscle: "chest", equipment: "cable", sets: 3, repMin: 10, repMax: 15 },
      { name: "Dumbbell Overhead Press", muscle: "front_delts", equipment: "dumbbell", sets: 3, repMin: 8, repMax: 12 },
      { name: "Dumbbell Lateral Raise", muscle: "side_delts", equipment: "dumbbell", sets: 4, repMin: 12, repMax: 15 },
      { name: "Cable Triceps Pushdown", muscle: "triceps", equipment: "cable", sets: 3, repMin: 10, repMax: 15 },
    ],
  },
  {
    name: "Pull",
    assignedDays: ["tue", "fri"],
    targetMuscles: ["lats", "upper_back", "traps", "biceps", "rear_delts"],
    exercises: [
      { name: "Cable Lat Pulldown", muscle: "lats", equipment: "cable", sets: 4, repMin: 8, repMax: 12 },
      { name: "Dumbbell Row", muscle: "upper_back", equipment: "dumbbell", sets: 3, repMin: 8, repMax: 12 },
      { name: "Cable Seated Row", muscle: "upper_back", equipment: "cable", sets: 3, repMin: 10, repMax: 12 },
      { name: "Rear Delt Fly", muscle: "rear_delts", equipment: "dumbbell", sets: 3, repMin: 12, repMax: 15 },
      { name: "Dumbbell Bicep Curl", muscle: "biceps", equipment: "dumbbell", sets: 3, repMin: 10, repMax: 12 },
      { name: "Hammer Curl", muscle: "biceps", equipment: "dumbbell", sets: 3, repMin: 10, repMax: 12 },
    ],
  },
  {
    name: "Legs",
    assignedDays: ["wed", "sat"],
    targetMuscles: ["quads", "hamstrings", "glutes", "calves"],
    exercises: [
      { name: "Goblet Squat", muscle: "quads", equipment: "dumbbell", sets: 4, repMin: 8, repMax: 12 },
      { name: "Romanian Deadlift", muscle: "hamstrings", equipment: "dumbbell", sets: 3, repMin: 8, repMax: 12 },
      { name: "Bulgarian Split Squat", muscle: "quads", equipment: "dumbbell", sets: 3, repMin: 8, repMax: 12 },
      { name: "Leg Curl", muscle: "hamstrings", equipment: "machine", sets: 3, repMin: 10, repMax: 15 },
      { name: "Calf Raise", muscle: "calves", equipment: "machine", sets: 4, repMin: 12, repMax: 20 },
      { name: "Leg Extension", muscle: "quads", equipment: "machine", sets: 3, repMin: 10, repMax: 15 },
    ],
  },
];

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

function todayMadrid(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // Clean up abandoned sessions (0 sets, older than 24h)
  await db
    .delete(gymSessions)
    .where(
      and(
        eq(gymSessions.userId, userId),
        sql`${gymSessions.id} NOT IN (SELECT DISTINCT session_id FROM gym_sets)`,
        sql`${gymSessions.createdAt} < (unixepoch() * 1000 - 86400000)`
      )
    );

  // ── Step 1: Ensure program exists ─────────────────────────────────────────
  let [prog] = await db
    .select({ id: programs.id })
    .from(programs)
    .where(and(eq(programs.userId, userId), eq(programs.isActive, true)))
    .limit(1);

  if (!prog) {
    const [newProg] = await db
      .insert(programs)
      .values({ userId, name: "My Program", isActive: true })
      .returning();
    prog = { id: newProg.id };
  }

  // ── Step 2: Ensure workout plans + exercises exist ────────────────────────
  const existingPlans = await db
    .select({ id: workoutPlans.id, name: workoutPlans.name })
    .from(workoutPlans)
    .where(eq(workoutPlans.programId, prog.id))
    .orderBy(workoutPlans.sortOrder);

  let plans = existingPlans;

  if (plans.length === 0) {
    // Create plans, exercises, and link them
    for (let i = 0; i < PLAN_DEFS.length; i++) {
      const def = PLAN_DEFS[i];

      // Create plan
      const [plan] = await db
        .insert(workoutPlans)
        .values({
          programId: prog.id,
          name: def.name,
          type: "strength",
          sortOrder: i,
          assignedDays: JSON.stringify(def.assignedDays),
          targetMuscles: JSON.stringify(def.targetMuscles),
        })
        .returning();

      // Create exercises and link to plan
      for (let j = 0; j < def.exercises.length; j++) {
        const exDef = def.exercises[j];

        // Check if exercise already exists in user's library
        const [existing] = await db
          .select({ id: exerciseDb.id })
          .from(exerciseDb)
          .where(and(eq(exerciseDb.userId, userId), eq(exerciseDb.name, exDef.name)))
          .limit(1);

        let exerciseId: number;
        if (existing) {
          exerciseId = existing.id;
        } else {
          const [newEx] = await db
            .insert(exerciseDb)
            .values({
              userId,
              name: exDef.name,
              primaryMuscle: exDef.muscle,
              equipment: exDef.equipment,
              trackingType: "reps_weight",
              weightIncrement: 2.5,
            })
            .returning();
          exerciseId = newEx.id;
        }

        // Link exercise to plan
        const setConfig = JSON.stringify(
          Array.from({ length: exDef.sets }, () => ({
            type: "standard",
            repMin: exDef.repMin,
            repMax: exDef.repMax,
          }))
        );

        await db.insert(planExercises).values({
          planId: plan.id,
          exerciseId,
          sortOrder: j,
          setConfig,
        });
      }
    }

    // Re-fetch plans after creation
    plans = await db
      .select({ id: workoutPlans.id, name: workoutPlans.name })
      .from(workoutPlans)
      .where(eq(workoutPlans.programId, prog.id))
      .orderBy(workoutPlans.sortOrder);
  }

  if (plans.length === 0) {
    return NextResponse.json({ error: "Failed to create plans" }, { status: 500 });
  }

  // ── Step 3: Seed gym sessions Mar 16 → yesterday ─────────────────────────
  const today = todayMadrid();
  // Seed up to yesterday (don't seed today — user might train today)
  const yesterday = new Date(today + "T12:00:00Z");
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const endDate = yesterday.toISOString().slice(0, 10);

  const allDates = trainingDates("2026-03-16", endDate);

  // Find dates that already have sessions
  const existingRows = await db
    .select({ date: gymSessions.date })
    .from(gymSessions)
    .where(
      and(
        eq(gymSessions.userId, userId),
        sql`${gymSessions.date} >= '2026-03-16'`,
        sql`${gymSessions.date} <= ${endDate}`
      )
    );
  const existingDates = new Set(existingRows.map((r) => r.date));
  const datesToSeed = allDates.filter((d) => !existingDates.has(d));

  if (datesToSeed.length === 0) {
    return NextResponse.json({
      message: "Plans exist, all dates already seeded",
      plansCount: plans.length,
      sessionsCreated: 0,
    });
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
    message: `Seeded ${sessionsCreated} sessions from March 16 to ${endDate}`,
    plansCount: plans.length,
    sessionsCreated,
  });
}
