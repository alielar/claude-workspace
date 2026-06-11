/**
 * POST /api/workouts/seed-program
 *
 * Seeds the new 4-day workout program (Push/Pull/Legs/Upper).
 * - Creates new exercises that don't exist yet
 * - Updates existing exercises with alternativeGroupId
 * - Creates 4 workout plans with correct set configs
 * - Sets the program as active
 *
 * Idempotent: checks if program "4-Day Split" already exists.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { programs, workoutPlans, exerciseDb, planExercises } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// ── Types ────────────────────────────────────────────────────────────────────

interface ExerciseDef {
  name: string;
  primaryMuscle: string;
  secondaryMuscles?: string[];
  equipment: string;
  trackingType: string;
  weightIncrement: number;
  alternativeGroupId: string;
  notes?: string;
}

interface PlanExerciseDef {
  /** Exercise name — must match an ExerciseDef name */
  name: string;
  sets: { type: string; repMin: number; repMax: number; restS: number }[];
}

// ── Exercise Definitions ─────────────────────────────────────────────────────
// All exercises (both primary dumbbell ones and machine/barbell alternatives)

const ALL_EXERCISES: ExerciseDef[] = [
  // ── incline_chest_press group ──
  {
    name: "Low Incline Dumbbell Press",
    primaryMuscle: "chest", secondaryMuscles: ["front_delts", "triceps"],
    equipment: "dumbbell", trackingType: "reps_weight", weightIncrement: 2.5,
    alternativeGroupId: "incline_chest_press",
  },
  {
    name: "Close Grip Barbell Incline Bench Press",
    primaryMuscle: "chest", secondaryMuscles: ["front_delts", "triceps"],
    equipment: "barbell", trackingType: "reps_weight", weightIncrement: 5,
    alternativeGroupId: "incline_chest_press",
    notes: "Use a grip just outside shoulder width. Bring the bar to the high point of your chest.",
  },
  {
    name: "Incline Barbell Bench Press",
    primaryMuscle: "chest", secondaryMuscles: ["front_delts", "triceps"],
    equipment: "barbell", trackingType: "reps_weight", weightIncrement: 5,
    alternativeGroupId: "incline_chest_press",
    notes: "Standard incline bench. Controlled descent, slight pause on the chest.",
  },

  // ── shoulder_press group ──
  {
    name: "Seated Dumbbell Overhead Press",
    primaryMuscle: "front_delts", secondaryMuscles: ["side_delts", "triceps"],
    equipment: "dumbbell", trackingType: "reps_weight", weightIncrement: 2.5,
    alternativeGroupId: "shoulder_press",
  },
  {
    name: "Machine Shoulder Press",
    primaryMuscle: "front_delts", secondaryMuscles: ["side_delts", "triceps"],
    equipment: "machine", trackingType: "reps_weight", weightIncrement: 2.5,
    alternativeGroupId: "shoulder_press",
    notes: "Arms break parallel at the bottom. Don't fully lock out at the top for constant tension.",
  },

  // ── tricep_extension group ──
  {
    name: "Cable Triceps Pushdown",
    primaryMuscle: "triceps", secondaryMuscles: [],
    equipment: "cable", trackingType: "reps_weight", weightIncrement: 2.5,
    alternativeGroupId: "tricep_extension",
  },
  {
    name: "Cable Overhead Tricep Extension",
    primaryMuscle: "triceps", secondaryMuscles: [],
    equipment: "cable", trackingType: "reps_weight", weightIncrement: 2.5,
    alternativeGroupId: "tricep_extension",
    notes: "Face away from cable, extend arms forward over your head. Great long-head stretch.",
  },

  // ── chest_fly group ──
  {
    name: "Dumbbell Fly",
    primaryMuscle: "chest", secondaryMuscles: ["front_delts"],
    equipment: "dumbbell", trackingType: "reps_weight", weightIncrement: 2.5,
    alternativeGroupId: "chest_fly",
  },
  {
    name: "Bent Over Cable Fly",
    primaryMuscle: "chest", secondaryMuscles: ["front_delts"],
    equipment: "cable", trackingType: "reps_weight", weightIncrement: 2.5,
    alternativeGroupId: "chest_fly",
    notes: "Bend forward at the hips, fly in a straight downward motion for better stability.",
  },
  {
    name: "Seated Cable Fly",
    primaryMuscle: "chest", secondaryMuscles: ["front_delts"],
    equipment: "cable", trackingType: "reps_weight", weightIncrement: 2.5,
    alternativeGroupId: "chest_fly",
    notes: "Keep elbows up and think about hugging a tree to isolate the pecs.",
  },
  {
    name: "Pec Deck",
    primaryMuscle: "chest", secondaryMuscles: ["front_delts"],
    equipment: "machine", trackingType: "reps_weight", weightIncrement: 2.5,
    alternativeGroupId: "chest_fly",
  },

  // ── lateral_raise group ──
  {
    name: "Seated Dumbbell Lateral Raise",
    primaryMuscle: "side_delts", secondaryMuscles: [],
    equipment: "dumbbell", trackingType: "reps_weight", weightIncrement: 2.5,
    alternativeGroupId: "lateral_raise",
  },
  {
    name: "Standing Dumbbell Lateral Raise",
    primaryMuscle: "side_delts", secondaryMuscles: [],
    equipment: "dumbbell", trackingType: "reps_weight", weightIncrement: 2.5,
    alternativeGroupId: "lateral_raise",
  },
  {
    name: "Machine Lateral Raise",
    primaryMuscle: "side_delts", secondaryMuscles: [],
    equipment: "machine", trackingType: "reps_weight", weightIncrement: 2.5,
    alternativeGroupId: "lateral_raise",
    notes: "Sweep the arms out to the sides rather than lifting them up.",
  },
  {
    name: "High Cable Lateral Raise",
    primaryMuscle: "side_delts", secondaryMuscles: [],
    equipment: "cable", trackingType: "reps_weight", weightIncrement: 2.5,
    alternativeGroupId: "lateral_raise",
    notes: "Set cable at shoulder height for peak tension in the stretched position.",
  },

  // ── front_raise group ──
  {
    name: "Dumbbell Front Raise",
    primaryMuscle: "front_delts", secondaryMuscles: ["side_delts"],
    equipment: "dumbbell", trackingType: "reps_weight", weightIncrement: 2.5,
    alternativeGroupId: "front_raise",
    notes: "Slight internal rotation as you lift to engage more of the side delt.",
  },
  {
    name: "Plate Front Raise",
    primaryMuscle: "front_delts", secondaryMuscles: ["side_delts"],
    equipment: "other", trackingType: "reps_weight", weightIncrement: 2.5,
    alternativeGroupId: "front_raise",
    notes: "Hold the plate like a steering wheel and lift to eye level while turning it.",
  },

  // ── diamond_pushup group ──
  {
    name: "Close Grip Push-up",
    primaryMuscle: "triceps", secondaryMuscles: ["chest", "front_delts"],
    equipment: "bodyweight", trackingType: "reps_only", weightIncrement: 0,
    alternativeGroupId: "diamond_pushup",
    notes: "Hands touching to form a diamond shape under the chest. Controlled tempo.",
  },
  {
    name: "Push-up",
    primaryMuscle: "chest", secondaryMuscles: ["triceps", "front_delts"],
    equipment: "bodyweight", trackingType: "reps_only", weightIncrement: 0,
    alternativeGroupId: "diamond_pushup",
  },

  // ── vertical_pull group ──
  {
    name: "Cable Lat Pulldown",
    primaryMuscle: "lats", secondaryMuscles: ["upper_back", "biceps"],
    equipment: "cable", trackingType: "reps_weight", weightIncrement: 2.5,
    alternativeGroupId: "vertical_pull",
  },
  {
    name: "Pull-up",
    primaryMuscle: "lats", secondaryMuscles: ["upper_back", "biceps"],
    equipment: "bodyweight", trackingType: "reps_only", weightIncrement: 0,
    alternativeGroupId: "vertical_pull",
    notes: "Think chest to bar. Drive your elbows down and in.",
  },

  // ── horizontal_row group ──
  {
    name: "Dumbbell Bent Over Row",
    primaryMuscle: "upper_back", secondaryMuscles: ["lats", "biceps"],
    equipment: "dumbbell", trackingType: "reps_weight", weightIncrement: 2.5,
    alternativeGroupId: "horizontal_row",
    notes: "Two-arm row. Keep torso parallel to the floor, controlled negative.",
  },
  {
    name: "Single Arm Dumbbell Row",
    primaryMuscle: "upper_back", secondaryMuscles: ["lats", "biceps"],
    equipment: "dumbbell", trackingType: "reps_weight", weightIncrement: 2.5,
    alternativeGroupId: "horizontal_row",
  },
  {
    name: "Barbell Pendlay Row",
    primaryMuscle: "upper_back", secondaryMuscles: ["lats", "biceps"],
    equipment: "barbell", trackingType: "reps_weight", weightIncrement: 5,
    alternativeGroupId: "horizontal_row",
    notes: "Stand on a plate for extra range. Torso parallel to floor, pull to lower chest.",
  },

  // ── bicep_curl_stretch group ──
  {
    name: "Incline Dumbbell Curl",
    primaryMuscle: "biceps", secondaryMuscles: ["forearms"],
    equipment: "dumbbell", trackingType: "reps_weight", weightIncrement: 2.5,
    alternativeGroupId: "bicep_curl_stretch",
    notes: "Sit on incline bench, arms hanging behind body. Maximises stretched position.",
  },
  {
    name: "Bayesian Cable Curl",
    primaryMuscle: "biceps", secondaryMuscles: ["forearms"],
    equipment: "cable", trackingType: "reps_weight", weightIncrement: 2.5,
    alternativeGroupId: "bicep_curl_stretch",
    notes: "Stand facing away from cable. Maximises tension in the stretched position.",
  },
  {
    name: "Incline Hammer Curl",
    primaryMuscle: "biceps", secondaryMuscles: ["forearms"],
    equipment: "dumbbell", trackingType: "reps_weight", weightIncrement: 2.5,
    alternativeGroupId: "bicep_curl_stretch",
  },
  {
    name: "Preacher Curl",
    primaryMuscle: "biceps", secondaryMuscles: ["forearms"],
    equipment: "dumbbell", trackingType: "reps_weight", weightIncrement: 2.5,
    alternativeGroupId: "bicep_curl_stretch",
    notes: "Use an inclined bench as the preacher pad. Focus on the deep stretch at the bottom.",
  },

  // ── ab_crunch group ──
  {
    name: "Cable Crunch",
    primaryMuscle: "abs", secondaryMuscles: [],
    equipment: "cable", trackingType: "reps_weight", weightIncrement: 2.5,
    alternativeGroupId: "ab_crunch",
  },
  {
    name: "Weighted Crunch",
    primaryMuscle: "abs", secondaryMuscles: [],
    equipment: "dumbbell", trackingType: "reps_weight", weightIncrement: 2.5,
    alternativeGroupId: "ab_crunch",
    notes: "Hold weight on chest.",
  },

  // ── leg_raise group ──
  {
    name: "Hanging Knee Raise",
    primaryMuscle: "abs", secondaryMuscles: ["obliques"],
    equipment: "bodyweight", trackingType: "reps_only", weightIncrement: 0,
    alternativeGroupId: "leg_raise",
  },
  {
    name: "Hanging Straight Leg Raise",
    primaryMuscle: "abs", secondaryMuscles: ["obliques"],
    equipment: "bodyweight", trackingType: "reps_only", weightIncrement: 0,
    alternativeGroupId: "leg_raise",
  },
  {
    name: "Roman Chair Leg Raise",
    primaryMuscle: "abs", secondaryMuscles: ["obliques"],
    equipment: "machine", trackingType: "reps_only", weightIncrement: 0,
    alternativeGroupId: "leg_raise",
  },

  // ── squat group ──
  {
    name: "Dumbbell Goblet Squat",
    primaryMuscle: "quads", secondaryMuscles: ["glutes", "upper_back"],
    equipment: "dumbbell", trackingType: "reps_weight", weightIncrement: 2.5,
    alternativeGroupId: "squat",
  },
  {
    name: "Pendulum Squat",
    primaryMuscle: "quads", secondaryMuscles: ["glutes"],
    equipment: "machine", trackingType: "reps_weight", weightIncrement: 5,
    alternativeGroupId: "squat",
    notes: "Low back support with arcing movement. Leave 1-2 reps in tank for first two sets, failure on third.",
  },
  {
    name: "Barbell Squat",
    primaryMuscle: "quads", secondaryMuscles: ["glutes", "hamstrings"],
    equipment: "barbell", trackingType: "reps_weight", weightIncrement: 5,
    alternativeGroupId: "squat",
  },

  // ── rdl group ──
  {
    name: "Dumbbell Romanian Deadlift",
    primaryMuscle: "hamstrings", secondaryMuscles: ["glutes"],
    equipment: "dumbbell", trackingType: "reps_weight", weightIncrement: 2.5,
    alternativeGroupId: "rdl",
  },
  {
    name: "Barbell Romanian Deadlift",
    primaryMuscle: "hamstrings", secondaryMuscles: ["glutes"],
    equipment: "barbell", trackingType: "reps_weight", weightIncrement: 5,
    alternativeGroupId: "rdl",
    notes: "Push glutes straight back, stop just below the knees. Neutral spine throughout.",
  },

  // ── quad_isolation group ──
  {
    name: "Leg Extension",
    primaryMuscle: "quads", secondaryMuscles: [],
    equipment: "machine", trackingType: "reps_weight", weightIncrement: 2.5,
    alternativeGroupId: "quad_isolation",
    notes: "Set the seat back as far as possible. Lean back and pull on handles to stay locked in.",
  },
  {
    name: "Dumbbell Bulgarian Split Squat",
    primaryMuscle: "quads", secondaryMuscles: ["glutes", "hamstrings"],
    equipment: "dumbbell", trackingType: "reps_weight", weightIncrement: 2.5,
    alternativeGroupId: "quad_isolation",
  },
  {
    name: "Dumbbell Walking Lunge",
    primaryMuscle: "quads", secondaryMuscles: ["glutes", "hamstrings"],
    equipment: "dumbbell", trackingType: "reps_weight", weightIncrement: 2.5,
    alternativeGroupId: "quad_isolation",
  },

  // ── calf_raise group ──
  {
    name: "Single Leg Calf Raise",
    primaryMuscle: "calves", secondaryMuscles: [],
    equipment: "bodyweight", trackingType: "reps_only", weightIncrement: 0,
    alternativeGroupId: "calf_raise",
    notes: "Drop heels as low as possible for full stretch. 30s hold at bottom on last set.",
  },
  {
    name: "Standing Calf Raise Machine",
    primaryMuscle: "calves", secondaryMuscles: [],
    equipment: "machine", trackingType: "reps_weight", weightIncrement: 5,
    alternativeGroupId: "calf_raise",
    notes: "Hold the deep stretch at the bottom for 30 seconds on the last set.",
  },
];

// ── Workout Plan Definitions ─────────────────────────────────────────────────

const PUSH_EXERCISES: PlanExerciseDef[] = [
  {
    name: "Low Incline Dumbbell Press",
    sets: [
      // Undulating periodization: 8, 5, 15
      { type: "standard", repMin: 8, repMax: 8, restS: 120 },
      { type: "standard", repMin: 5, repMax: 5, restS: 150 },
      { type: "standard", repMin: 15, repMax: 15, restS: 90 },
    ],
  },
  {
    name: "Seated Dumbbell Overhead Press",
    sets: [
      { type: "standard", repMin: 10, repMax: 12, restS: 90 },
      { type: "standard", repMin: 10, repMax: 12, restS: 90 },
      { type: "standard", repMin: 10, repMax: 12, restS: 90 },
    ],
  },
  {
    name: "Cable Triceps Pushdown",
    sets: [
      { type: "standard", repMin: 6, repMax: 8, restS: 90 },
      { type: "standard", repMin: 6, repMax: 8, restS: 90 },
      { type: "standard", repMin: 6, repMax: 8, restS: 90 },
    ],
  },
  {
    name: "Dumbbell Fly",
    sets: [
      { type: "standard", repMin: 10, repMax: 12, restS: 60 },
      { type: "standard", repMin: 10, repMax: 12, restS: 60 },
      { type: "standard", repMin: 10, repMax: 12, restS: 60 },
    ],
  },
  {
    name: "Seated Dumbbell Lateral Raise",
    sets: [
      // 3 × 20: first 5 reps slow eccentrics, then 15 standard
      { type: "standard", repMin: 20, repMax: 20, restS: 60 },
      { type: "standard", repMin: 20, repMax: 20, restS: 60 },
      { type: "standard", repMin: 20, repMax: 20, restS: 60 },
    ],
  },
  {
    name: "Dumbbell Front Raise",
    sets: [
      { type: "standard", repMin: 15, repMax: 20, restS: 45 },
      { type: "standard", repMin: 15, repMax: 20, restS: 45 },
    ],
  },
  {
    name: "Close Grip Push-up",
    sets: [
      { type: "failure", repMin: 1, repMax: 99, restS: 0 },
    ],
  },
];

const PULL_EXERCISES: PlanExerciseDef[] = [
  {
    name: "Cable Lat Pulldown",
    sets: [
      { type: "failure", repMin: 6, repMax: 15, restS: 120 },
      { type: "failure", repMin: 6, repMax: 15, restS: 120 },
      { type: "failure", repMin: 6, repMax: 15, restS: 120 },
    ],
  },
  {
    name: "Dumbbell Bent Over Row",
    sets: [
      { type: "failure", repMin: 6, repMax: 12, restS: 120 },
      { type: "failure", repMin: 6, repMax: 12, restS: 120 },
      { type: "failure", repMin: 6, repMax: 12, restS: 120 },
    ],
  },
  {
    name: "Incline Dumbbell Curl",
    sets: [
      { type: "failure", repMin: 8, repMax: 12, restS: 60 },
      { type: "failure", repMin: 8, repMax: 12, restS: 60 },
      { type: "failure", repMin: 8, repMax: 12, restS: 60 },
    ],
  },
  {
    name: "Cable Crunch",
    sets: [
      { type: "standard", repMin: 10, repMax: 12, restS: 45 },
      { type: "standard", repMin: 10, repMax: 12, restS: 45 },
      { type: "standard", repMin: 10, repMax: 12, restS: 45 },
    ],
  },
  {
    name: "Hanging Knee Raise",
    sets: [
      { type: "standard", repMin: 10, repMax: 20, restS: 45 },
      { type: "standard", repMin: 10, repMax: 20, restS: 45 },
      { type: "standard", repMin: 10, repMax: 20, restS: 45 },
    ],
  },
];

const LEGS_EXERCISES: PlanExerciseDef[] = [
  {
    name: "Dumbbell Goblet Squat",
    sets: [
      { type: "standard", repMin: 6, repMax: 8, restS: 150 },
      { type: "standard", repMin: 6, repMax: 8, restS: 150 },
      { type: "failure", repMin: 6, repMax: 8, restS: 150 },
    ],
  },
  {
    name: "Dumbbell Romanian Deadlift",
    sets: [
      { type: "standard", repMin: 8, repMax: 10, restS: 120 },
      { type: "standard", repMin: 8, repMax: 10, restS: 120 },
      { type: "standard", repMin: 8, repMax: 10, restS: 120 },
    ],
  },
  {
    name: "Leg Extension",
    sets: [
      { type: "failure", repMin: 10, repMax: 15, restS: 60 },
      { type: "failure", repMin: 10, repMax: 15, restS: 60 },
    ],
  },
  {
    name: "Single Leg Calf Raise",
    sets: [
      { type: "standard", repMin: 8, repMax: 10, restS: 60 },
      { type: "standard", repMin: 8, repMax: 10, restS: 60 },
      { type: "standard", repMin: 8, repMax: 10, restS: 60 },
    ],
  },
  {
    name: "Cable Crunch",
    sets: [
      { type: "standard", repMin: 10, repMax: 12, restS: 45 },
      { type: "standard", repMin: 10, repMax: 12, restS: 45 },
      { type: "standard", repMin: 10, repMax: 12, restS: 45 },
    ],
  },
  {
    name: "Hanging Knee Raise",
    sets: [
      { type: "standard", repMin: 10, repMax: 20, restS: 45 },
      { type: "standard", repMin: 10, repMax: 20, restS: 45 },
      { type: "standard", repMin: 10, repMax: 20, restS: 45 },
    ],
  },
];

const UPPER_EXERCISES: PlanExerciseDef[] = [
  {
    name: "Low Incline Dumbbell Press",
    sets: [
      { type: "failure", repMin: 6, repMax: 12, restS: 120 },
      { type: "failure", repMin: 6, repMax: 12, restS: 120 },
      { type: "failure", repMin: 6, repMax: 12, restS: 120 },
    ],
  },
  {
    name: "Dumbbell Fly",
    sets: [
      { type: "failure", repMin: 10, repMax: 15, restS: 60 },
      { type: "failure", repMin: 10, repMax: 15, restS: 60 },
      { type: "failure", repMin: 10, repMax: 15, restS: 60 },
    ],
  },
  {
    name: "Seated Dumbbell Lateral Raise",
    sets: [
      { type: "standard", repMin: 8, repMax: 10, restS: 60 },
      { type: "standard", repMin: 8, repMax: 10, restS: 60 },
      { type: "standard", repMin: 8, repMax: 10, restS: 60 },
    ],
  },
  {
    name: "Cable Overhead Tricep Extension",
    sets: [
      { type: "failure", repMin: 8, repMax: 12, restS: 60 },
      { type: "failure", repMin: 8, repMax: 12, restS: 60 },
      { type: "failure", repMin: 8, repMax: 12, restS: 60 },
    ],
  },
  {
    name: "Preacher Curl",
    sets: [
      { type: "failure", repMin: 8, repMax: 12, restS: 60 },
      { type: "failure", repMin: 8, repMax: 12, restS: 60 },
      { type: "failure", repMin: 8, repMax: 12, restS: 60 },
    ],
  },
  {
    name: "Cable Crunch",
    sets: [
      { type: "standard", repMin: 10, repMax: 12, restS: 45 },
      { type: "standard", repMin: 10, repMax: 12, restS: 45 },
      { type: "standard", repMin: 10, repMax: 12, restS: 45 },
    ],
  },
  {
    name: "Hanging Knee Raise",
    sets: [
      { type: "standard", repMin: 10, repMax: 20, restS: 45 },
      { type: "standard", repMin: 10, repMax: 20, restS: 45 },
      { type: "standard", repMin: 10, repMax: 20, restS: 45 },
    ],
  },
];

// ── Route Handler ────────────────────────────────────────────────────────────

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Check idempotency
  const [existing] = await db
    .select()
    .from(programs)
    .where(and(eq(programs.userId, userId), eq(programs.name, "4-Day Split")))
    .limit(1);

  if (existing) {
    return NextResponse.json({ message: "4-Day Split program already exists", programId: existing.id });
  }

  // Deactivate all existing programs
  const allPrograms = await db.select().from(programs).where(eq(programs.userId, userId));
  for (const p of allPrograms) {
    await db.update(programs).set({ isActive: false }).where(eq(programs.id, p.id));
  }

  // Create new program
  const [program] = await db
    .insert(programs)
    .values({
      userId,
      name: "4-Day Split",
      description: "Push / Pull / Legs / Upper — Mon, Tue, Thu, Fri",
      cycles: 7,
      isActive: true,
    })
    .returning();

  // ── Upsert all exercises ──────────────────────────────────────────────────

  const exerciseIdMap: Record<string, number> = {};

  for (const def of ALL_EXERCISES) {
    // Check if exercise already exists (by name)
    const [existingEx] = await db
      .select()
      .from(exerciseDb)
      .where(and(eq(exerciseDb.userId, userId), eq(exerciseDb.name, def.name)))
      .limit(1);

    if (existingEx) {
      // Update with alternativeGroupId and any missing fields
      await db
        .update(exerciseDb)
        .set({
          alternativeGroupId: def.alternativeGroupId,
          primaryMuscle: def.primaryMuscle,
          secondaryMuscles: def.secondaryMuscles?.length ? JSON.stringify(def.secondaryMuscles) : existingEx.secondaryMuscles,
          equipment: def.equipment,
          notes: def.notes ?? existingEx.notes,
        })
        .where(eq(exerciseDb.id, existingEx.id));
      exerciseIdMap[def.name] = existingEx.id;
    } else {
      // Create new exercise
      const [newEx] = await db
        .insert(exerciseDb)
        .values({
          userId,
          name: def.name,
          primaryMuscle: def.primaryMuscle,
          secondaryMuscles: def.secondaryMuscles?.length ? JSON.stringify(def.secondaryMuscles) : null,
          equipment: def.equipment,
          trackingType: def.trackingType,
          weightIncrement: def.weightIncrement,
          alternativeGroupId: def.alternativeGroupId,
          notes: def.notes ?? null,
        })
        .returning();
      exerciseIdMap[def.name] = newEx.id;
    }
  }

  // Also update any existing exercises that match names with typos/differences
  // Map old names to new group IDs
  const nameToGroupFixes: Record<string, string> = {
    "Overhand Grip Cable Lat Pulldown": "vertical_pull",
    "Cable Straight Bar Triceps Pushdown": "tricep_extension",
    "Single Arm Elbow-in Dumbbell Row": "horizontal_row",
    "Standing Dumbbell Biceps Curl": "bicep_curl_stretch",
    "Dumbbell Pullover": "horizontal_row",
    "Goblet Squat": "squat",
    "Standing Single Leg Calf Raise": "calf_raise",
    "Standing on Ground Single Leg Bodyweight Calf Raise": "calf_raise",
    "Weighted Russian Twist": "ab_crunch",
    "Plank Hold": "ab_crunch",
  };

  for (const [name, groupId] of Object.entries(nameToGroupFixes)) {
    const rows = await db
      .select()
      .from(exerciseDb)
      .where(and(eq(exerciseDb.userId, userId), eq(exerciseDb.name, name)));
    for (const row of rows) {
      await db
        .update(exerciseDb)
        .set({ alternativeGroupId: groupId })
        .where(eq(exerciseDb.id, row.id));
    }
  }

  // ── Create workout plans ──────────────────────────────────────────────────

  const planDefs = [
    { name: "Push", days: ["mon"], muscles: ["chest", "front_delts", "side_delts", "triceps"], exercises: PUSH_EXERCISES, sortOrder: 0 },
    { name: "Pull", days: ["tue"], muscles: ["lats", "upper_back", "biceps", "abs"], exercises: PULL_EXERCISES, sortOrder: 1 },
    { name: "Legs", days: ["thu"], muscles: ["quads", "hamstrings", "calves", "abs"], exercises: LEGS_EXERCISES, sortOrder: 2 },
    { name: "Upper", days: ["fri"], muscles: ["chest", "front_delts", "side_delts", "triceps", "biceps", "abs"], exercises: UPPER_EXERCISES, sortOrder: 3 },
  ];

  const createdPlans: { name: string; id: number; exerciseCount: number }[] = [];

  for (const planDef of planDefs) {
    const [plan] = await db
      .insert(workoutPlans)
      .values({
        programId: program.id,
        name: planDef.name,
        type: "strength",
        sortOrder: planDef.sortOrder,
        assignedDays: JSON.stringify(planDef.days),
        targetMuscles: JSON.stringify(planDef.muscles),
      })
      .returning();

    let sortOrder = 0;
    for (const planEx of planDef.exercises) {
      const exerciseId = exerciseIdMap[planEx.name];
      if (!exerciseId) {
        console.error(`Exercise not found: ${planEx.name}`);
        continue;
      }

      await db.insert(planExercises).values({
        planId: plan.id,
        exerciseId,
        sortOrder: sortOrder++,
        setConfig: JSON.stringify(planEx.sets),
      });
    }

    createdPlans.push({ name: planDef.name, id: plan.id, exerciseCount: planDef.exercises.length });
  }

  return NextResponse.json({
    success: true,
    programId: program.id,
    programName: "4-Day Split",
    plans: createdPlans,
    exercisesCreatedOrUpdated: ALL_EXERCISES.length,
    alternativeGroups: [...new Set(ALL_EXERCISES.map((e) => e.alternativeGroupId))].length,
  });
}
