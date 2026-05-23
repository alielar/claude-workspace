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

  const sessions = await db
    .select({
      id: gymSessions.id,
      workoutName: gymSessions.workoutName,
      date: gymSessions.date,
      durationSeconds: gymSessions.durationSeconds,
      notes: gymSessions.notes,
      createdAt: gymSessions.createdAt,
    })
    .from(gymSessions)
    .where(and(...conditions))
    .orderBy(desc(gymSessions.date))
    .limit(limit)
    .offset(offset);

  if (sessions.length === 0) return NextResponse.json([]);

  // Aggregate set counts and volume per session
  const sessionIds = sessions.map((s) => s.id);
  const aggRows = await db
    .select({
      sessionId: gymSets.sessionId,
      setCount: sql<number>`count(*)`.as("set_count"),
      totalVolume: sql<number>`sum(coalesce(weight_kg, 0) * coalesce(reps, 0))`.as("total_volume"),
    })
    .from(gymSets)
    .where(sql`${gymSets.sessionId} in (${sql.join(sessionIds.map((id) => sql`${id}`), sql`,`)})`)
    .groupBy(gymSets.sessionId);

  const aggMap = new Map(aggRows.map((r) => [r.sessionId, r]));

  const result = sessions.map((s) => {
    const agg = aggMap.get(s.id);
    // Extract short name for backward compat: "Beta (Push)" → "Push"
    const sessionName = s.workoutName.match(/\((.+)\)/)?.[1] ?? s.workoutName;
    return {
      id: s.id,
      sessionName,
      workoutName: s.workoutName,
      date: s.date,
      // Backward compat: startedAt as ms timestamp
      startedAt: s.createdAt?.getTime() ?? Date.now(),
      durationSeconds: s.durationSeconds,
      notes: s.notes,
      setCount: agg?.setCount ?? 0,
      totalVolume: Math.round(agg?.totalVolume ?? 0),
    };
  });

  return NextResponse.json(result);
}
