/**
 * GET /api/workouts/last-session — returns the most recent completed gym session.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { gymSessions } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [last] = await db
    .select({
      id: gymSessions.id,
      date: gymSessions.date,
      workoutName: gymSessions.workoutName,
      planId: gymSessions.planId,
    })
    .from(gymSessions)
    .where(eq(gymSessions.userId, session.user.id))
    .orderBy(desc(gymSessions.date))
    .limit(1);

  if (!last) {
    return NextResponse.json(null);
  }

  return NextResponse.json(last);
}
