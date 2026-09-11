/**
 * GET /api/workouts/session/active
 * Returns the most recent unfinished session (durationSeconds IS NULL), if any.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { gymSessions } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [active] = await db
    .select({
      id: gymSessions.id,
      workoutName: gymSessions.workoutName,
      date: gymSessions.date,
    })
    .from(gymSessions)
    .where(and(
      eq(gymSessions.userId, session.user.id),
      sql`${gymSessions.durationSeconds} IS NULL`,
    ))
    .orderBy(desc(gymSessions.createdAt))
    .limit(1);

  if (!active) return NextResponse.json({ session: null });
  return NextResponse.json({ session: active });
}
