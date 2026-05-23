/**
 * GET  /api/workouts/plans  — list all plans for the current user
 * POST /api/workouts/plans  — create a new plan (auto-creates program if needed)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { workoutPlans, programs, planExercises, exerciseDb } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get or find active program
  const [prog] = await db
    .select({ id: programs.id })
    .from(programs)
    .where(and(eq(programs.userId, session.user.id), eq(programs.isActive, true)))
    .limit(1);

  if (!prog) return NextResponse.json([]);

  const plans = await db
    .select()
    .from(workoutPlans)
    .where(eq(workoutPlans.programId, prog.id))
    .orderBy(workoutPlans.sortOrder);

  // Attach exercise count for each plan
  const result = await Promise.all(
    plans.map(async (p) => {
      const [row] = await db
        .select({ count: sql<number>`count(*)` })
        .from(planExercises)
        .where(eq(planExercises.planId, p.id));
      return {
        ...p,
        assignedDays: p.assignedDays ? JSON.parse(p.assignedDays) : [],
        targetMuscles: p.targetMuscles ? JSON.parse(p.targetMuscles) : [],
        exerciseCount: row?.count ?? 0,
      };
    })
  );

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { name, targetMuscles, assignedDays } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  // Auto-create program if none exists
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

  // Count existing plans for sort order
  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(workoutPlans)
    .where(eq(workoutPlans.programId, prog.id));

  const [plan] = await db
    .insert(workoutPlans)
    .values({
      programId: prog.id,
      name: name.trim(),
      type: "strength",
      sortOrder: countRow?.count ?? 0,
      assignedDays: assignedDays?.length ? JSON.stringify(assignedDays) : null,
      targetMuscles: targetMuscles?.length ? JSON.stringify(targetMuscles) : null,
    })
    .returning();

  return NextResponse.json({
    ...plan,
    assignedDays: assignedDays ?? [],
    targetMuscles: targetMuscles ?? [],
    exerciseCount: 0,
  }, { status: 201 });
}
