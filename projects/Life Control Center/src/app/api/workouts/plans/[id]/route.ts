/**
 * GET    /api/workouts/plans/[id]  — get one plan with exercises
 * PATCH  /api/workouts/plans/[id]  — update name/type/sortOrder
 * DELETE /api/workouts/plans/[id]  — delete plan
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
  if (isNaN(planId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  if (!(await verifyPlanOwnership(planId, session.user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [plan] = await db
    .select()
    .from(workoutPlans)
    .where(eq(workoutPlans.id, planId))
    .limit(1);

  const exercises = await db
    .select({
      id: planExercises.id,
      sortOrder: planExercises.sortOrder,
      setConfig: planExercises.setConfig,
      exerciseId: exerciseDb.id,
      exerciseName: exerciseDb.name,
      primaryMuscle: exerciseDb.primaryMuscle,
      equipment: exerciseDb.equipment,
    })
    .from(planExercises)
    .innerJoin(exerciseDb, eq(planExercises.exerciseId, exerciseDb.id))
    .where(eq(planExercises.planId, planId))
    .orderBy(planExercises.sortOrder);

  return NextResponse.json({ ...plan, exercises });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const planId = parseInt(id);
  if (isNaN(planId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  if (!(await verifyPlanOwnership(planId, session.user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const update: Partial<typeof workoutPlans.$inferInsert> = {};
  if (body.name !== undefined) update.name = body.name;
  if (body.type !== undefined) update.type = body.type;
  if (body.sortOrder !== undefined) update.sortOrder = body.sortOrder;

  await db.update(workoutPlans).set(update).where(eq(workoutPlans.id, planId));
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const planId = parseInt(id);
  if (isNaN(planId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  if (!(await verifyPlanOwnership(planId, session.user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.delete(workoutPlans).where(eq(workoutPlans.id, planId));
  return NextResponse.json({ ok: true });
}
