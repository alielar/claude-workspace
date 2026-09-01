/**
 * GET    /api/workouts/programs/[id]  · get one program with its plans
 * PATCH  /api/workouts/programs/[id]  · update name/description/cycles/isActive
 * DELETE /api/workouts/programs/[id]  · delete program (cascades to plans)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { programs, workoutPlans, planExercises, exerciseDb } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const progId = parseInt(id);
  if (isNaN(progId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const [prog] = await db
    .select()
    .from(programs)
    .where(and(eq(programs.id, progId), eq(programs.userId, session.user.id)))
    .limit(1);

  if (!prog) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const plans = await db
    .select()
    .from(workoutPlans)
    .where(eq(workoutPlans.programId, progId))
    .orderBy(workoutPlans.sortOrder);

  const plansWithExercises = await Promise.all(
    plans.map(async (plan) => {
      const exRows = await db
        .select({
          id: planExercises.id,
          sortOrder: planExercises.sortOrder,
          setConfig: planExercises.setConfig,
          exerciseId: exerciseDb.id,
          exerciseName: exerciseDb.name,
          primaryMuscle: exerciseDb.primaryMuscle,
        })
        .from(planExercises)
        .innerJoin(exerciseDb, eq(planExercises.exerciseId, exerciseDb.id))
        .where(eq(planExercises.planId, plan.id))
        .orderBy(planExercises.sortOrder);
      return { ...plan, exercises: exRows };
    })
  );

  return NextResponse.json({ ...prog, plans: plansWithExercises });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const progId = parseInt(id);
  if (isNaN(progId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const body = await req.json();
  const update: Partial<typeof programs.$inferInsert> = {};
  if (body.name !== undefined) update.name = body.name;
  if (body.description !== undefined) update.description = body.description;
  if (body.cycles !== undefined) update.cycles = body.cycles;
  if (body.isActive !== undefined) update.isActive = body.isActive;

  await db
    .update(programs)
    .set(update)
    .where(and(eq(programs.id, progId), eq(programs.userId, session.user.id)));

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const progId = parseInt(id);
  if (isNaN(progId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  await db
    .delete(programs)
    .where(and(eq(programs.id, progId), eq(programs.userId, session.user.id)));

  return NextResponse.json({ ok: true });
}
