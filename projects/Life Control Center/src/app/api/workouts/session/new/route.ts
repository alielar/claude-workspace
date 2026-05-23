/**
 * POST /api/workouts/session/new
 * Creates a new gym_session for the given planId and returns the session ID.
 *
 * Body: { planId: number }
 * Response: { sessionId: number }
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { gymSessions, workoutPlans, programs } from "@/db/schema";
import { eq, and } from "drizzle-orm";

function todayMadrid(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { planId } = await req.json();
  if (!planId) return NextResponse.json({ error: "planId required" }, { status: 400 });

  // Verify the plan belongs to this user
  const [plan] = await db
    .select({ id: workoutPlans.id, name: workoutPlans.name, programId: workoutPlans.programId })
    .from(workoutPlans)
    .innerJoin(programs, eq(workoutPlans.programId, programs.id))
    .where(and(eq(workoutPlans.id, planId), eq(programs.userId, userId)))
    .limit(1);

  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

  const ins = await db.insert(gymSessions).values({
    userId,
    planId: plan.id,
    programId: plan.programId,
    workoutName: plan.name,
    originalTemplateName: plan.name,
    date: todayMadrid(),
  });

  return NextResponse.json({ sessionId: Number(ins.lastInsertRowid) });
}
