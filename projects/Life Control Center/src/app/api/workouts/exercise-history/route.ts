/**
 * GET /api/workouts/exercise-history?exerciseId=X
 *
 * Returns set logs for a specific exercise across all workout sessions,
 * ordered by date. Used to render per-exercise progress charts.
 *
 * Returns: [{ date, weightKg, repsLogged, rirLogged, estimated1rm }]
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { setLogs, workoutLogs, exercises } from "@/db/schema";
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
      startedAt: workoutLogs.startedAt,
      setType: setLogs.setType,
      weightKg: setLogs.weightKg,
      repsLogged: setLogs.repsLogged,
      rirLogged: setLogs.rirLogged,
      setNumber: setLogs.setNumber,
    })
    .from(setLogs)
    .innerJoin(workoutLogs, eq(setLogs.workoutLogId, workoutLogs.id))
    .where(
      and(
        eq(setLogs.exerciseId, exerciseId),
        eq(workoutLogs.userId, session.user.id)
      )
    )
    .orderBy(desc(workoutLogs.startedAt))
    .limit(200);

  // Group by session date — keep only working sets, pick best set per session
  const byDate = new Map<
    string,
    { date: string; bestWeightKg: number; repsLogged: number; rirLogged: number | null; estimated1rm: number }
  >();

  for (const row of rows) {
    if (row.setType !== "standard" || !row.weightKg || !row.repsLogged) continue;
    const date = new Date(row.startedAt!).toISOString().split("T")[0];
    const e1rm = epley1rm(row.weightKg, row.repsLogged);

    const existing = byDate.get(date);
    if (!existing || e1rm > existing.estimated1rm) {
      byDate.set(date, {
        date,
        bestWeightKg: row.weightKg,
        repsLogged: row.repsLogged,
        rirLogged: row.rirLogged,
        estimated1rm: e1rm,
      });
    }
  }

  return NextResponse.json(Array.from(byDate.values()).reverse());
}
