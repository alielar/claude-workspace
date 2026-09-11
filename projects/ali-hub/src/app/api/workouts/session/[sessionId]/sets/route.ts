/**
 * POST /api/workouts/session/[sessionId]/sets
 * Log a set for this session.
 *
 * Body: {
 *   exerciseId: number;
 *   exerciseName: string;
 *   setNumber: number;
 *   setType: "standard" | "warmup" | "drop" | "failure";
 *   weightKg?: number;
 *   reps?: number;
 *   durationSeconds?: number;
 * }
 *
 * DELETE /api/workouts/session/[sessionId]/sets?setId=N
 * Remove a logged set.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { gymSessions, gymSets } from "@/db/schema";
import { eq, and } from "drizzle-orm";

async function verifySession(sessionId: number, userId: string) {
  const [row] = await db
    .select({ id: gymSessions.id })
    .from(gymSessions)
    .where(and(eq(gymSessions.id, sessionId), eq(gymSessions.userId, userId)))
    .limit(1);
  return !!row;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { sessionId: sid } = await params;
  const sessionId = parseInt(sid);
  if (isNaN(sessionId) || !(await verifySession(sessionId, session.user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const { exerciseId, exerciseName, setNumber, setType, weightKg, reps, durationSeconds } = body;

  if (!exerciseName || setNumber === undefined) {
    return NextResponse.json({ error: "exerciseName and setNumber required" }, { status: 400 });
  }

  const ins = await db.insert(gymSets).values({
    sessionId,
    exerciseId: exerciseId ?? null,
    exerciseName,
    setNumber,
    setType: setType ?? "standard",
    weightKg: weightKg ?? null,
    reps: reps ?? null,
    rir: null, // RIR no longer tracked; column kept for historical data
    durationSeconds: durationSeconds ?? null,
  });

  return NextResponse.json({ setId: Number(ins.lastInsertRowid) });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { sessionId: sid } = await params;
  const sessionId = parseInt(sid);
  if (isNaN(sessionId) || !(await verifySession(sessionId, session.user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const setIdStr = req.nextUrl.searchParams.get("setId");
  const setId = parseInt(setIdStr ?? "");
  if (isNaN(setId)) return NextResponse.json({ error: "setId required" }, { status: 400 });

  await db.delete(gymSets).where(and(eq(gymSets.id, setId), eq(gymSets.sessionId, sessionId)));
  return NextResponse.json({ ok: true });
}
