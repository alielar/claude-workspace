/**
 * POST /api/workouts/seed-legs-core — Creates Legs & Core plan for Wednesday.
 * Exercises: legs with dumbbells + core with cable crunches and hanging leg raises.
 * Idempotent — checks if plan already exists.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { programs, workoutPlans, exerciseDb, planExercises } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

type ExerciseDef = {
  name: string;
  primaryMuscle: string;
  equipment: string;
  trackingType: string;
  sets: { type: string; repMin: number; repMax: number; restS: number }[];
};

const LEGS_EXERCISES: ExerciseDef[] = [
  {
    name: "Dumbbell Goblet Squat",
    primaryMuscle: "quads",
    equipment: "dumbbell",
    trackingType: "reps_weight",
    sets: [
      { type: "warmup", repMin: 10, repMax: 15, restS: 60 },
      { type: "standard", repMin: 8, repMax: 12, restS: 90 },
      { type: "standard", repMin: 8, repMax: 12, restS: 90 },
      { type: "standard", repMin: 8, repMax: 12, restS: 90 },
    ],
  },
  {
    name: "Dumbbell Romanian Deadlift",
    primaryMuscle: "hamstrings",
    equipment: "dumbbell",
    trackingType: "reps_weight",
    sets: [
      { type: "warmup", repMin: 10, repMax: 12, restS: 60 },
      { type: "standard", repMin: 8, repMax: 12, restS: 90 },
      { type: "standard", repMin: 8, repMax: 12, restS: 90 },
      { type: "standard", repMin: 8, repMax: 12, restS: 90 },
    ],
  },
  {
    name: "Dumbbell Bulgarian Split Squat",
    primaryMuscle: "quads",
    equipment: "dumbbell",
    trackingType: "reps_weight",
    sets: [
      { type: "standard", repMin: 8, repMax: 12, restS: 90 },
      { type: "standard", repMin: 8, repMax: 12, restS: 90 },
      { type: "standard", repMin: 8, repMax: 12, restS: 90 },
    ],
  },
  {
    name: "Dumbbell Walking Lunge",
    primaryMuscle: "quads",
    equipment: "dumbbell",
    trackingType: "reps_weight",
    sets: [
      { type: "standard", repMin: 10, repMax: 14, restS: 90 },
      { type: "standard", repMin: 10, repMax: 14, restS: 90 },
      { type: "standard", repMin: 10, repMax: 14, restS: 90 },
    ],
  },
  {
    name: "Standing Single Leg Calf Raise",
    primaryMuscle: "calves",
    equipment: "bodyweight",
    trackingType: "reps_only",
    sets: [
      { type: "standard", repMin: 12, repMax: 20, restS: 45 },
      { type: "standard", repMin: 12, repMax: 20, restS: 45 },
      { type: "standard", repMin: 12, repMax: 20, restS: 45 },
    ],
  },
];

const CORE_EXERCISES: ExerciseDef[] = [
  {
    name: "Cable Crunch",
    primaryMuscle: "abs",
    equipment: "cable",
    trackingType: "reps_weight",
    sets: [
      { type: "standard", repMin: 10, repMax: 15, restS: 45 },
      { type: "standard", repMin: 10, repMax: 15, restS: 45 },
      { type: "standard", repMin: 10, repMax: 15, restS: 45 },
    ],
  },
  {
    name: "Hanging Knee Raise",
    primaryMuscle: "abs",
    equipment: "bodyweight",
    trackingType: "reps_only",
    sets: [
      { type: "standard", repMin: 10, repMax: 15, restS: 45 },
      { type: "standard", repMin: 10, repMax: 15, restS: 45 },
      { type: "standard", repMin: 10, repMax: 15, restS: 45 },
    ],
  },
  {
    name: "Hanging Straight Leg Raise",
    primaryMuscle: "abs",
    equipment: "bodyweight",
    trackingType: "reps_only",
    sets: [
      { type: "standard", repMin: 8, repMax: 12, restS: 45 },
      { type: "standard", repMin: 8, repMax: 12, restS: 45 },
      { type: "standard", repMin: 8, repMax: 12, restS: 45 },
    ],
  },
  {
    name: "Weighted Russian Twist",
    primaryMuscle: "obliques",
    equipment: "dumbbell",
    trackingType: "reps_weight",
    sets: [
      { type: "standard", repMin: 10, repMax: 15, restS: 30 },
      { type: "standard", repMin: 10, repMax: 15, restS: 30 },
    ],
  },
  {
    name: "Plank Hold",
    primaryMuscle: "core",
    equipment: "bodyweight",
    trackingType: "time_only",
    sets: [
      { type: "standard", repMin: 30, repMax: 60, restS: 30 },
      { type: "standard", repMin: 30, repMax: 60, restS: 30 },
    ],
  },
];

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Find active program
  const [program] = await db
    .select()
    .from(programs)
    .where(and(eq(programs.userId, userId), eq(programs.isActive, true)))
    .limit(1);

  if (!program) {
    return NextResponse.json({ error: "No active program found" }, { status: 400 });
  }

  // Check if Legs & Core plan already exists
  const existing = await db
    .select()
    .from(workoutPlans)
    .where(and(eq(workoutPlans.programId, program.id), eq(workoutPlans.name, "Legs & Core")))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json({ message: "Legs & Core plan already exists", planId: existing[0].id });
  }

  // Create the plan
  const [plan] = await db
    .insert(workoutPlans)
    .values({
      programId: program.id,
      name: "Legs & Core",
      type: "strength",
      sortOrder: 5,
      assignedDays: JSON.stringify(["wed"]),
      targetMuscles: JSON.stringify(["quads", "hamstrings", "glutes", "calves", "abs", "core"]),
    })
    .returning();

  // Insert all exercises
  const allExercises = [...LEGS_EXERCISES, ...CORE_EXERCISES];
  let sortOrder = 0;

  for (const ex of allExercises) {
    // Check if exercise already exists in DB
    const [existingEx] = await db
      .select()
      .from(exerciseDb)
      .where(and(eq(exerciseDb.userId, userId), eq(exerciseDb.name, ex.name)))
      .limit(1);

    let exerciseId: number;
    if (existingEx) {
      exerciseId = existingEx.id;
    } else {
      const [newEx] = await db
        .insert(exerciseDb)
        .values({
          userId,
          name: ex.name,
          primaryMuscle: ex.primaryMuscle,
          equipment: ex.equipment,
          trackingType: ex.trackingType,
        })
        .returning();
      exerciseId = newEx.id;
    }

    await db.insert(planExercises).values({
      planId: plan.id,
      exerciseId,
      sortOrder: sortOrder++,
      setConfig: JSON.stringify(ex.sets),
    });
  }

  return NextResponse.json({
    success: true,
    planId: plan.id,
    planName: "Legs & Core",
    assignedDay: "Wednesday",
    exerciseCount: allExercises.length,
    exercises: allExercises.map(e => e.name),
  });
}
