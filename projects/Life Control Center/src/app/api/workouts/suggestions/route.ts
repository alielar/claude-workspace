/**
 * GET /api/workouts/suggestions?planId=X
 *
 * Returns progressive overload suggestions for each exercise in a plan,
 * based on the most recent completed session of that plan type.
 *
 * Returns: { [exerciseName]: ProgressionSuggestion }
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  gymSessions,
  gymSets,
  planExercises,
  exerciseDb,
  workoutPlans,
  programs,
} from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { computeProgressionSuggestion } from "@/lib/progressive-overload";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const planId = parseInt(req.nextUrl.searchParams.get("planId") ?? "0");
  if (!planId) return NextResponse.json({});

  // Verify plan ownership
  const [plan] = await db
    .select({ id: workoutPlans.id, name: workoutPlans.name })
    .from(workoutPlans)
    .innerJoin(programs, eq(workoutPlans.programId, programs.id))
    .where(and(eq(workoutPlans.id, planId), eq(programs.userId, userId)))
    .limit(1);
  if (!plan) return NextResponse.json({});

  // Most recent completed session for this plan
  const [lastSession] = await db
    .select({ id: gymSessions.id })
    .from(gymSessions)
    .where(and(eq(gymSessions.planId, planId), eq(gymSessions.userId, userId)))
    .orderBy(desc(gymSessions.date))
    .limit(1);

  if (!lastSession) return NextResponse.json({});

  // Sets from that session
  const sets = await db
    .select()
    .from(gymSets)
    .where(eq(gymSets.sessionId, lastSession.id));

  // Plan exercises with set configs (for repRangeMax)
  const planExs = await db
    .select({
      exerciseId: planExercises.exerciseId,
      exerciseName: exerciseDb.name,
      setConfig: planExercises.setConfig,
    })
    .from(planExercises)
    .innerJoin(exerciseDb, eq(planExercises.exerciseId, exerciseDb.id))
    .where(eq(planExercises.planId, planId))
    .orderBy(planExercises.sortOrder);

  const suggestions: Record<string, ReturnType<typeof computeProgressionSuggestion>> = {};

  for (const ex of planExs) {
    let config: Array<{ repMin: number; repMax: number; type: string }> = [];
    try { config = JSON.parse(ex.setConfig); } catch { config = []; }

    const exSets = sets
      .filter((s) => s.exerciseId === ex.exerciseId)
      .map((s, idx) => ({
        setType: (s.setType ?? "standard") as "standard" | "drop" | "warmup",
        weightKg: s.weightKg,
        repsLogged: s.reps,
        rirLogged: s.rir,
        repRangeMax: config[idx]?.repMax ?? null,
      }));

    if (exSets.length > 0) {
      suggestions[ex.exerciseName] = computeProgressionSuggestion(ex.exerciseName, exSets);
    }
  }

  return NextResponse.json(suggestions);
}
