/**
 * GET /api/workouts/prs
 * Returns all personal records for the user, joined with exercise name.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { personalRecords, exercises } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prs = await db
    .select({
      id: personalRecords.id,
      exerciseId: personalRecords.exerciseId,
      exerciseName: exercises.name,
      muscleGroup: exercises.muscleGroup,
      bestWeightKg: personalRecords.bestWeightKg,
      bestReps: personalRecords.bestReps,
      estimated1rm: personalRecords.estimated1rm,
      achievedAt: personalRecords.achievedAt,
    })
    .from(personalRecords)
    .innerJoin(exercises, eq(personalRecords.exerciseId, exercises.id))
    .where(eq(personalRecords.userId, session.user.id))
    .orderBy(exercises.name);

  return NextResponse.json(prs);
}
