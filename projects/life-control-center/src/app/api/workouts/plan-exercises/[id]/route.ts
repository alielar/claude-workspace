/**
 * PATCH  /api/workouts/plan-exercises/[id]  · update sortOrder or setConfig
 * DELETE /api/workouts/plan-exercises/[id]  · remove exercise from plan
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { planExercises, workoutPlans, programs } from "@/db/schema";
import { eq, and } from "drizzle-orm";

async function verifyOwnership(peId: number, userId: string) {
  const [row] = await db
    .select({ id: planExercises.id })
    .from(planExercises)
    .innerJoin(workoutPlans, eq(planExercises.planId, workoutPlans.id))
    .innerJoin(programs, eq(workoutPlans.programId, programs.id))
    .where(and(eq(planExercises.id, peId), eq(programs.userId, userId)))
    .limit(1);
  return !!row;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const peId = parseInt(id);
  if (isNaN(peId) || !(await verifyOwnership(peId, session.user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const update: Partial<typeof planExercises.$inferInsert> = {};
  if (body.sortOrder !== undefined) update.sortOrder = body.sortOrder;
  if (body.setConfig !== undefined) update.setConfig = JSON.stringify(body.setConfig);

  await db.update(planExercises).set(update).where(eq(planExercises.id, peId));
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const peId = parseInt(id);
  if (isNaN(peId) || !(await verifyOwnership(peId, session.user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.delete(planExercises).where(eq(planExercises.id, peId));
  return NextResponse.json({ ok: true });
}
