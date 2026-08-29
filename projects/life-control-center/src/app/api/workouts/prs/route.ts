/**
 * GET /api/workouts/prs
 * Returns all personal records for the user from exercisePrs table.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { exercisePrs, exerciseDb } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prs = await db
    .select({
      id: exercisePrs.id,
      exerciseId: exercisePrs.exerciseId,
      exerciseName: exercisePrs.exerciseName,
      muscleGroup: exerciseDb.primaryMuscle,
      bestWeightKg: exercisePrs.bestWeightKg,
      bestReps: exercisePrs.bestReps,
      estimated1rm: exercisePrs.estimated1rm,
      achievedAt: exercisePrs.achievedAt,
    })
    .from(exercisePrs)
    .leftJoin(exerciseDb, eq(exercisePrs.exerciseId, exerciseDb.id))
    .where(eq(exercisePrs.userId, session.user.id))
    .orderBy(exercisePrs.exerciseName);

  return NextResponse.json(prs);
}
