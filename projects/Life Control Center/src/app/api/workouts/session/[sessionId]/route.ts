/**
 * GET  /api/workouts/session/[sessionId]
 *   Returns session metadata + plan exercises with set configs + logged sets so far
 *   + prefill from last session for each exercise
 *
 * PATCH /api/workouts/session/[sessionId]
 *   Update session: { durationSeconds?, notes?, finished?: true }
 *   When finished=true, updates PR table if any set is a new Epley 1RM best.
 *
 * DELETE /api/workouts/session/[sessionId]
 *   Hard-delete (abandon session + all its sets)
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
  exercisePrs,
} from "@/db/schema";
import { eq, and, desc, max } from "drizzle-orm";
import { autoCheck } from "@/lib/checklist/autoCheck";
import { recomputePRs } from "@/lib/workouts/recomputePRs";

async function verifySession(sessionId: number, userId: string) {
  const [row] = await db
    .select({ id: gymSessions.id, planId: gymSessions.planId })
    .from(gymSessions)
    .where(and(eq(gymSessions.id, sessionId), eq(gymSessions.userId, userId)))
    .limit(1);
  return row ?? null;
}

function epley1rm(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { sessionId: sid } = await params;
  const sessionId = parseInt(sid);
  if (isNaN(sessionId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const gymSession = await verifySession(sessionId, session.user.id);
  if (!gymSession) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Session metadata
  const [meta] = await db
    .select()
    .from(gymSessions)
    .where(eq(gymSessions.id, sessionId))
    .limit(1);

  // Plan exercises (workout) — if plan exists
  let workoutExercises: {
    planExerciseId: number;
    exerciseId: number;
    name: string;
    primaryMuscle: string | null;
    equipment: string | null;
    weightIncrement: number;
    trackingType: string;
    sortOrder: number;
    setConfig: Array<{ type: string; repMin: number; repMax: number; restS: number }>;
  }[] = [];

  if (gymSession.planId) {
    const rows = await db
      .select({
        planExerciseId: planExercises.id,
        exerciseId: exerciseDb.id,
        name: exerciseDb.name,
        primaryMuscle: exerciseDb.primaryMuscle,
        equipment: exerciseDb.equipment,
        weightIncrement: exerciseDb.weightIncrement,
        trackingType: exerciseDb.trackingType,
        sortOrder: planExercises.sortOrder,
        setConfig: planExercises.setConfig,
      })
      .from(planExercises)
      .innerJoin(exerciseDb, eq(planExercises.exerciseId, exerciseDb.id))
      .where(eq(planExercises.planId, gymSession.planId))
      .orderBy(planExercises.sortOrder);

    workoutExercises = rows.map((r) => ({
      ...r,
      setConfig: (() => {
        try { return JSON.parse(r.setConfig); } catch { return []; }
      })(),
    }));
  }

  // Sets already logged in this session
  const loggedSets = await db
    .select()
    .from(gymSets)
    .where(eq(gymSets.sessionId, sessionId))
    .orderBy(gymSets.setNumber);

  // Prefill: single query for all exercises — find last session's sets per exercise
  const prefillMap: Record<number, Array<{ setNumber: number; weightKg: number | null; reps: number | null; setType: string }>> = {};

  if (workoutExercises.length > 0) {
    const allPrefillSets = await db
      .select({
        exerciseId: gymSets.exerciseId,
        setNumber: gymSets.setNumber,
        weightKg: gymSets.weightKg,
        reps: gymSets.reps,
        setType: gymSets.setType,
        sessionId: gymSets.sessionId,
        createdAt: gymSets.createdAt,
      })
      .from(gymSets)
      .innerJoin(gymSessions, eq(gymSets.sessionId, gymSessions.id))
      .where(eq(gymSessions.userId, session.user.id!))
      .orderBy(desc(gymSets.createdAt));

    // Group by exerciseId → sessionId → sets
    const byExerciseSession = new Map<number, Map<number, typeof allPrefillSets>>();
    const exerciseIdSet = new Set(workoutExercises.map((e) => e.exerciseId));

    for (const s of allPrefillSets) {
      if (!s.exerciseId || !exerciseIdSet.has(s.exerciseId)) continue;
      if (s.sessionId === sessionId) continue;
      if (!byExerciseSession.has(s.exerciseId)) byExerciseSession.set(s.exerciseId, new Map());
      const sessMap = byExerciseSession.get(s.exerciseId)!;
      if (!sessMap.has(s.sessionId)) sessMap.set(s.sessionId, []);
      sessMap.get(s.sessionId)!.push(s);
    }

    for (const [exId, sessMap] of byExerciseSession) {
      // Pick session with highest createdAt
      let bestSessId = -1;
      let bestTime = 0;
      for (const [sessId, sets] of sessMap) {
        const t = sets[0]?.createdAt?.getTime() ?? 0;
        if (t > bestTime) { bestTime = t; bestSessId = sessId; }
      }
      if (bestSessId !== -1) {
        prefillMap[exId] = sessMap.get(bestSessId)!.sort((a, b) => a.setNumber - b.setNumber);
      }
    }
  }

  // PRs for exercises in this session (for real-time PR detection in UI)
  const exerciseIds = workoutExercises.map((e) => e.exerciseId);
  const prRows = exerciseIds.length > 0
    ? await db
        .select({ exerciseId: exercisePrs.exerciseId, estimated1rm: exercisePrs.estimated1rm })
        .from(exercisePrs)
        .where(eq(exercisePrs.userId, session.user.id))
    : [];

  const prMap: Record<number, number> = {};
  for (const pr of prRows) {
    if (pr.exerciseId) prMap[pr.exerciseId] = pr.estimated1rm ?? 0;
  }

  return NextResponse.json({
    session: meta,
    exercises: workoutExercises,
    loggedSets,
    prefillMap,
    prMap,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { sessionId: sid } = await params;
  const sessionId = parseInt(sid);
  if (isNaN(sessionId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const gymSession = await verifySession(sessionId, session.user.id);
  if (!gymSession) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const update: Partial<typeof gymSessions.$inferInsert> = {};
  if (body.durationSeconds !== undefined) update.durationSeconds = body.durationSeconds;
  if (body.notes !== undefined) update.notes = body.notes;

  await db.update(gymSessions).set(update).where(eq(gymSessions.id, sessionId));

  // When finishing, update PRs
  if (body.finished) {
    const sets = await db
      .select()
      .from(gymSets)
      .where(eq(gymSets.sessionId, sessionId));

    // Group by exerciseId
    const byExercise: Record<number, typeof sets> = {};
    for (const s of sets) {
      if (!s.exerciseId) continue;
      if (!byExercise[s.exerciseId]) byExercise[s.exerciseId] = [];
      byExercise[s.exerciseId].push(s);
    }

    const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());

    for (const [exIdStr, exSets] of Object.entries(byExercise)) {
      const exId = Number(exIdStr);
      let best1rm = 0;
      let bestWeight = 0;
      let bestReps = 0;

      for (const s of exSets) {
        if (!s.weightKg || !s.reps) continue;
        const e1rm = epley1rm(s.weightKg, s.reps);
        if (e1rm > best1rm) {
          best1rm = e1rm;
          bestWeight = s.weightKg;
          bestReps = s.reps;
        }
      }

      if (best1rm === 0) continue;

      // Check existing PR
      const [existing] = await db
        .select()
        .from(exercisePrs)
        .where(and(eq(exercisePrs.userId, session.user.id!), eq(exercisePrs.exerciseId, exId)))
        .limit(1);

      const exName = exSets[0].exerciseName;

      if (!existing) {
        await db.insert(exercisePrs).values({
          userId: session.user.id!,
          exerciseId: exId,
          exerciseName: exName,
          bestWeightKg: bestWeight,
          bestReps: bestReps,
          estimated1rm: best1rm,
          achievedAt: todayStr,
        });
      } else if (best1rm > (existing.estimated1rm ?? 0)) {
        await db
          .update(exercisePrs)
          .set({ bestWeightKg: bestWeight, bestReps: bestReps, estimated1rm: best1rm, achievedAt: todayStr })
          .where(eq(exercisePrs.id, existing.id));
      }
    }
  }

  // Wire autoCheck when session is finished
  if (body.finished) {
    await autoCheck(session.user.id, "workout").catch(() => {});
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { sessionId: sid } = await params;
  const sessionId = parseInt(sid);
  if (isNaN(sessionId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const gymSession = await verifySession(sessionId, session.user.id);
  if (!gymSession) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Collect exercise IDs from this session before deleting (for PR recomputation)
  const sessionSets = await db
    .select({ exerciseId: gymSets.exerciseId })
    .from(gymSets)
    .where(eq(gymSets.sessionId, sessionId));
  const affectedExerciseIds = [...new Set(sessionSets.map((s) => s.exerciseId).filter((id): id is number => id !== null))];

  // gymSets cascade-delete via FK
  await db.delete(gymSessions).where(eq(gymSessions.id, sessionId));

  // Recompute PRs for affected exercises
  if (affectedExerciseIds.length > 0) {
    await recomputePRs(session.user.id, affectedExerciseIds).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
