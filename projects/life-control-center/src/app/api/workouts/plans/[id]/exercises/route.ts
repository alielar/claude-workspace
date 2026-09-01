/**
 * GET  /api/workouts/plans/[id]/exercises  · list exercises in a plan
 * POST /api/workouts/plans/[id]/exercises  · add exercise to plan
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { workoutPlans, programs, planExercises, exerciseDb } from "@/db/schema";
import { eq, and } from "drizzle-orm";

async function verifyPlanOwnership(planId: number, userId: string) {
  const [row] = await db
    .select({ planId: workoutPlans.id })
    .from(workoutPlans)
    .innerJoin(programs, eq(workoutPlans.programId, programs.id))
    .where(and(eq(workoutPlans.id, planId), eq(programs.userId, userId)))
    .limit(1);
  return !!row;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const planId = parseInt(id);
  if (isNaN(planId) || !(await verifyPlanOwnership(planId, session.user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rows = await db
    .select({
      id: planExercises.id,
      sortOrder: planExercises.sortOrder,
      setConfig: planExercises.setConfig,
      exerciseId: exerciseDb.id,
      name: exerciseDb.name,
      primaryMuscle: exerciseDb.primaryMuscle,
      secondaryMuscles: exerciseDb.secondaryMuscles,
      equipment: exerciseDb.equipment,
      weightIncrement: exerciseDb.weightIncrement,
      videoUrl: exerciseDb.videoUrl,
      videoType: exerciseDb.videoType,
    })
    .from(planExercises)
    .innerJoin(exerciseDb, eq(planExercises.exerciseId, exerciseDb.id))
    .where(eq(planExercises.planId, planId))
    .orderBy(planExercises.sortOrder);

  return NextResponse.json(
    rows.map((r) => ({
      ...r,
      secondaryMuscles: r.secondaryMuscles ? JSON.parse(r.secondaryMuscles) : [],
      setConfig: r.setConfig ? JSON.parse(r.setConfig) : [],
    }))
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const planId = parseInt(id);
  if (isNaN(planId) || !(await verifyPlanOwnership(planId, session.user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { exerciseId, sortOrder, setConfig } = await req.json();
  if (!exerciseId) return NextResponse.json({ error: "exerciseId required" }, { status: 400 });

  // Get current max sort_order if not provided
  let order = sortOrder;
  if (order === undefined) {
    const existing = await db
      .select({ sortOrder: planExercises.sortOrder })
      .from(planExercises)
      .where(eq(planExercises.planId, planId))
      .orderBy(planExercises.sortOrder);
    order = existing.length > 0 ? (existing[existing.length - 1].sortOrder + 1) : 0;
  }

  const [row] = await db
    .insert(planExercises)
    .values({
      planId,
      exerciseId,
      sortOrder: order,
      setConfig: setConfig ? JSON.stringify(setConfig) : "[]",
    })
    .returning();

  return NextResponse.json(row, { status: 201 });
}
