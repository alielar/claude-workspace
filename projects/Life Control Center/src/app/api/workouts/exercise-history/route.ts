/**
 * GET /api/workouts/exercise-history?exerciseId=X
 *
 * Returns logged sets for a specific exercise across all gym sessions,
 * ordered by date. Used to render per-exercise progress charts.
 *
 * Returns: [{ date, bestWeightKg, repsLogged, rirLogged, estimated1rm }]
 * One entry per session date — best set (highest Epley 1RM) is kept.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { gymSets, gymSessions } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { epley1rm } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const exerciseId = Number(req.nextUrl.searchParams.get("exerciseId"));
  if (isNaN(exerciseId)) {
    return NextResponse.json({ error: "exerciseId required" }, { status: 400 });
  }

  const rows = await db
    .select({
      date: gymSessions.date,
      setType: gymSets.setType,
      weightKg: gymSets.weightKg,
      reps: gymSets.reps,
      rir: gymSets.rir,
      setNumber: gymSets.setNumber,
    })
    .from(gymSets)
    .innerJoin(gymSessions, eq(gymSets.sessionId, gymSessions.id))
    .where(
      and(
        eq(gymSets.exerciseId, exerciseId),
        eq(gymSessions.userId, session.user.id)
      )
    )
    .orderBy(desc(gymSessions.date))
    .limit(300);

  // Group by session date — keep only working sets, pick best set per session
  const byDate = new Map<
    string,
    { date: string; bestWeightKg: number; repsLogged: number; rirLogged: number | null; estimated1rm: number }
  >();

  for (const row of rows) {
    if (row.setType !== "standard" || !row.weightKg || !row.reps) continue;
    const e1rm = epley1rm(row.weightKg, row.reps);
    const existing = byDate.get(row.date);
    if (!existing || e1rm > existing.estimated1rm) {
      byDate.set(row.date, {
        date: row.date,
        bestWeightKg: row.weightKg,
        repsLogged: row.reps,
        rirLogged: row.rir,
        estimated1rm: e1rm,
      });
    }
  }

  return NextResponse.json(Array.from(byDate.values()).reverse());
}
