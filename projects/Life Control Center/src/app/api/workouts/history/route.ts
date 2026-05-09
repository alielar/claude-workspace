/**
 * GET /api/workouts/history
 *
 * Returns the user's workout history enriched with session name and set count.
 * Query params:
 *   ?limit=N   (default 30)
 *   ?offset=N  (default 0)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { workoutLogs, workoutSessions, setLogs } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "30");
  const offset = Number(req.nextUrl.searchParams.get("offset") ?? "0");

  // Get logs with session name
  const logs = await db
    .select({
      id: workoutLogs.id,
      sessionId: workoutLogs.sessionId,
      sessionName: workoutSessions.name,
      startedAt: workoutLogs.startedAt,
      finishedAt: workoutLogs.finishedAt,
      durationSeconds: workoutLogs.durationSeconds,
      notes: workoutLogs.notes,
    })
    .from(workoutLogs)
    .innerJoin(workoutSessions, eq(workoutLogs.sessionId, workoutSessions.id))
    .where(eq(workoutLogs.userId, session.user.id))
    .orderBy(desc(workoutLogs.startedAt))
    .limit(limit)
    .offset(offset);

  // Count total sets per log
  const setCounts = await db
    .select({
      workoutLogId: setLogs.workoutLogId,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(setLogs)
    .groupBy(setLogs.workoutLogId);

  const setCountMap = new Map(setCounts.map((r) => [r.workoutLogId, r.count]));

  const enriched = logs.map((log) => ({
    ...log,
    setCount: setCountMap.get(log.id) ?? 0,
  }));

  return NextResponse.json(enriched);
}
