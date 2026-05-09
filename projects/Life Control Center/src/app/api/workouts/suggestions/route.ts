/**
 * GET /api/workouts/suggestions?sessionId=X
 * Returns progressive overload suggestions for each exercise
 * based on the most recent log of this session type.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  workoutLogs,
  setLogs,
  exercises,
  setTemplates,
  workoutSessions,
} from "@/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { computeProgressionSuggestion } from "@/lib/progressive-overload";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const sessionId = parseInt(req.nextUrl.searchParams.get("sessionId") ?? "0");
  if (!sessionId) return NextResponse.json({});

  // Get session name to find all logs of this session type (Push appears twice in rotation)
  const [ws] = await db
    .select()
    .from(workoutSessions)
    .where(eq(workoutSessions.id, sessionId));
  if (!ws) return NextResponse.json({});

  // All session IDs with the same name (e.g. both "Push" sessions)
  const sameSessions = await db
    .select({ id: workoutSessions.id })
    .from(workoutSessions)
    .where(eq(workoutSessions.name, ws.name));
  const sameSessionIds = sameSessions.map((s) => s.id);

  // Most recent log of this session type for this user
  const [recentLog] = await db
    .select()
    .from(workoutLogs)
    .where(
      and(
        eq(workoutLogs.userId, userId),
        inArray(workoutLogs.sessionId, sameSessionIds)
      )
    )
    .orderBy(desc(workoutLogs.startedAt))
    .limit(1);

  if (!recentLog) return NextResponse.json({});

  // Get set logs for that workout
  const logs = await db
    .select()
    .from(setLogs)
    .where(eq(setLogs.workoutLogId, recentLog.id));

  // Get exercises + set templates for this session (for repRangeMax)
  const exList = await db
    .select()
    .from(exercises)
    .where(eq(exercises.sessionId, sessionId))
    .orderBy(exercises.sortOrder);

  // Build a map of exerciseId → setNumber → repRangeMax from templates
  const allTemplates = await db
    .select()
    .from(setTemplates)
    .where(
      inArray(
        setTemplates.exerciseId,
        exList.map((e) => e.id)
      )
    );

  const templateMap = new Map<string, number | null>();
  for (const t of allTemplates) {
    templateMap.set(`${t.exerciseId}:${t.setNumber}`, t.repRangeMax ?? null);
  }

  // Compute suggestions per exercise
  const suggestions: Record<string, ReturnType<typeof computeProgressionSuggestion>> = {};
  for (const ex of exList) {
    const exSets = logs
      .filter((l) => l.exerciseId === ex.id)
      .map((l) => ({
        setType: l.setType as "standard" | "drop" | "warmup",
        weightKg: l.weightKg,
        repsLogged: l.repsLogged,
        rirLogged: l.rirLogged,
        repRangeMax: templateMap.get(`${ex.id}:${l.setNumber}`) ?? null,
      }));

    if (exSets.length > 0) {
      suggestions[ex.name] = computeProgressionSuggestion(ex.name, exSets);
    }
  }

  return NextResponse.json(suggestions);
}
