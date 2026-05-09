/**
 * GET /api/workouts/sessions/[id]
 * Returns a session with all exercises and set templates.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { workoutSessions, exercises, setTemplates } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const sessionId = parseInt(id);

  const [ws] = await db
    .select()
    .from(workoutSessions)
    .where(eq(workoutSessions.id, sessionId));

  if (!ws) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const exList = await db
    .select()
    .from(exercises)
    .where(eq(exercises.sessionId, sessionId))
    .orderBy(exercises.sortOrder);

  const exWithSets = await Promise.all(
    exList.map(async (ex) => {
      const sets = await db
        .select()
        .from(setTemplates)
        .where(eq(setTemplates.exerciseId, ex.id))
        .orderBy(setTemplates.setNumber);
      return { ...ex, sets };
    })
  );

  return NextResponse.json({ ...ws, exercises: exWithSets });
}
