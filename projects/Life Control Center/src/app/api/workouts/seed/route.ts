/**
 * POST /api/workouts/seed
 * Seeds the database with the full PPL program from workout-seed.ts.
 * Only runs once — skips if a program already exists for the user.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  workoutPrograms,
  workoutSessions,
  exercises,
  setTemplates,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { PROGRAM_SESSIONS, WEEKLY_ROTATION } from "@/lib/workout-seed";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // Check if program already seeded
  const existing = await db
    .select()
    .from(workoutPrograms)
    .where(eq(workoutPrograms.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json({ message: "Already seeded", programId: existing[0].id });
  }

  // Create program
  const [program] = await db
    .insert(workoutPrograms)
    .values({
      userId,
      name: "PPL Hypertrophy",
      rotationOrder: JSON.stringify(WEEKLY_ROTATION),
    })
    .returning();

  // Create sessions and their exercises
  for (const sessionData of PROGRAM_SESSIONS) {
    const [ws] = await db
      .insert(workoutSessions)
      .values({
        programId: program.id,
        name: sessionData.name,
        type: sessionData.type,
        defaultRestSeconds: sessionData.defaultRestSeconds,
        sortOrder: sessionData.sortOrder,
      })
      .returning();

    for (let ei = 0; ei < sessionData.exercises.length; ei++) {
      const exData = sessionData.exercises[ei];
      const [ex] = await db
        .insert(exercises)
        .values({
          sessionId: ws.id,
          name: exData.name,
          muscleGroup: exData.muscleGroup,
          apiLookupName: exData.apiLookupName,
          sortOrder: ei,
        })
        .returning();

      if (exData.sets.length > 0) {
        await db.insert(setTemplates).values(
          exData.sets.map((s) => ({
            exerciseId: ex.id,
            setNumber: s.setNumber,
            setType: s.setType,
            repRangeMin: s.repRangeMin,
            repRangeMax: s.repRangeMax,
            durationSeconds: s.durationSeconds,
            rirTarget: s.rirTarget,
            restSeconds: s.restSeconds,
          }))
        );
      }
    }
  }

  return NextResponse.json({ message: "Seeded successfully", programId: program.id });
}
