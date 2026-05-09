/**
 * POST /api/workouts/log
 * Save a completed workout with all set logs.
 * Also updates PRs and computes progression suggestions.
 *
 * GET /api/workouts/log
 * Return last N workout logs for the user.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { workoutLogs, setLogs, personalRecords } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { epley1rm } from "@/lib/utils";

// ─── POST: save a finished workout ───────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const body = await req.json();
  const {
    sessionId,
    startedAt,
    finishedAt,
    notes,
    exerciseLogs, // [{ exerciseId, sets: [{ setNumber, setType, weightKg, repsLogged, durationSeconds, rirLogged, restSeconds }] }]
  } = body;

  // 1. Create the workout log
  const durationSeconds = Math.round((finishedAt - startedAt) / 1000);
  const [log] = await db
    .insert(workoutLogs)
    .values({
      userId,
      sessionId,
      startedAt: new Date(startedAt),
      finishedAt: new Date(finishedAt),
      durationSeconds,
      notes,
    })
    .returning();

  // 2. Insert all set logs
  const allSetLogs = exerciseLogs.flatMap((ex: any) =>
    ex.sets.map((s: any) => ({
      workoutLogId: log.id,
      exerciseId: ex.exerciseId,
      setNumber: s.setNumber,
      setType: s.setType,
      weightKg: s.weightKg,
      repsLogged: s.repsLogged,
      durationSeconds: s.durationSeconds,
      rirLogged: s.rirLogged,
      restSeconds: s.restSeconds,
      completedAt: new Date(),
    }))
  );

  if (allSetLogs.length > 0) {
    await db.insert(setLogs).values(allSetLogs);
  }

  // 3. Update PRs for each exercise
  for (const ex of exerciseLogs) {
    const workingSets = ex.sets.filter(
      (s: any) => s.setType === "standard" && s.weightKg && s.repsLogged
    );
    if (workingSets.length === 0) continue;

    // Find the best set by estimated 1RM
    const best = workingSets.reduce((acc: any, s: any) => {
      const e1rm = epley1rm(s.weightKg, s.repsLogged);
      return e1rm > epley1rm(acc.weightKg, acc.repsLogged) ? s : acc;
    });

    const current1rm = epley1rm(best.weightKg, best.repsLogged);

    // Check existing PR
    const existingPR = await db
      .select()
      .from(personalRecords)
      .where(
        and(
          eq(personalRecords.userId, userId),
          eq(personalRecords.exerciseId, ex.exerciseId)
        )
      )
      .limit(1);

    if (existingPR.length === 0 || current1rm > (existingPR[0].estimated1rm ?? 0)) {
      if (existingPR.length === 0) {
        await db.insert(personalRecords).values({
          userId,
          exerciseId: ex.exerciseId,
          bestWeightKg: best.weightKg,
          bestReps: best.repsLogged,
          estimated1rm: current1rm,
          achievedAt: new Date(),
        });
      } else {
        await db
          .update(personalRecords)
          .set({
            bestWeightKg: best.weightKg,
            bestReps: best.repsLogged,
            estimated1rm: current1rm,
            achievedAt: new Date(),
          })
          .where(eq(personalRecords.id, existingPR[0].id));
      }
    }
  }

  return NextResponse.json({ logId: log.id });
}

// ─── GET: recent workout logs ─────────────────────────────────────────────────

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const logs = await db
    .select()
    .from(workoutLogs)
    .where(eq(workoutLogs.userId, session.user.id))
    .orderBy(desc(workoutLogs.startedAt))
    .limit(20);

  return NextResponse.json(logs);
}
