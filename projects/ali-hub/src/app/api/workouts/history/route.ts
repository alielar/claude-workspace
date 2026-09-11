/**
 * GET /api/workouts/history
 *
 * Returns the user's gym session history with per-session set counts and volume.
 * Query params:
 *   ?limit=N   (default 50)
 *   ?offset=N  (default 0)
 *   ?from=YYYY-MM-DD  (inclusive, filter by date)
 *   ?to=YYYY-MM-DD    (inclusive, filter by date)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { gymSessions, gymSets } from "@/db/schema";
import { eq, desc, sql, and, gte, lte } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "50");
  const offset = Number(req.nextUrl.searchParams.get("offset") ?? "0");
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");

  const conditions = [eq(gymSessions.userId, session.user.id)];
  if (from) conditions.push(gte(gymSessions.date, from));
  if (to) conditions.push(lte(gymSessions.date, to));

  // Only return sessions that have at least 1 set (JOIN ensures this)
  const sessionsWithSets = await db
    .select({
      id: gymSessions.id,
      workoutName: gymSessions.workoutName,
      date: gymSessions.date,
      durationSeconds: gymSessions.durationSeconds,
      notes: gymSessions.notes,
      createdAt: gymSessions.createdAt,
      setCount: sql<number>`count(${gymSets.id})`.as("set_count"),
      totalVolume: sql<number>`sum(coalesce(${gymSets.weightKg}, 0) * coalesce(${gymSets.reps}, 0))`.as("total_volume"),
    })
    .from(gymSessions)
    .innerJoin(gymSets, eq(gymSets.sessionId, gymSessions.id))
    .where(and(...conditions))
    .groupBy(gymSessions.id)
    .orderBy(desc(gymSessions.date))
    .limit(limit)
    .offset(offset);

  if (sessionsWithSets.length === 0) return NextResponse.json([]);

  const sessions = sessionsWithSets;
  const aggMap = new Map(sessions.map((s) => [s.id, { setCount: s.setCount, totalVolume: s.totalVolume }]));
  const sessionIds = sessions.map((s) => s.id);

  // If ?detail=true, include per-exercise set data
  const detail = req.nextUrl.searchParams.get("detail") === "true";

  let setsMap: Record<number, Array<{ exerciseName: string; setNumber: number; weightKg: number | null; reps: number | null; setType: string }>> = {};
  if (detail && sessionIds.length > 0) {
    const allSets = await db
      .select({
        sessionId: gymSets.sessionId,
        exerciseName: gymSets.exerciseName,
        setNumber: gymSets.setNumber,
        weightKg: gymSets.weightKg,
        reps: gymSets.reps,
        setType: gymSets.setType,
      })
      .from(gymSets)
      .where(sql`${gymSets.sessionId} in (${sql.join(sessionIds.map((id) => sql`${id}`), sql`,`)})`)
      .orderBy(gymSets.setNumber);
    for (const s of allSets) {
      if (!setsMap[s.sessionId]) setsMap[s.sessionId] = [];
      setsMap[s.sessionId].push(s);
    }
  }

  const result = sessions.map((s) => {
    const agg = aggMap.get(s.id);
    const sessionName = s.workoutName.match(/\((.+)\)/)?.[1] ?? s.workoutName;
    return {
      id: s.id,
      sessionName,
      workoutName: s.workoutName,
      date: s.date,
      startedAt: s.createdAt?.getTime() ?? Date.now(),
      durationSeconds: s.durationSeconds,
      notes: s.notes,
      setCount: agg?.setCount ?? 0,
      totalVolume: Math.round(agg?.totalVolume ?? 0),
      ...(detail ? { sets: setsMap[s.id] ?? [] } : {}),
    };
  });

  return NextResponse.json(result);
}
