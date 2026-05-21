/**
 * GET  /api/workouts/plans?programId=X  — list plans in a program
 * POST /api/workouts/plans               — create a plan
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { workoutPlans, programs } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const programId = req.nextUrl.searchParams.get("programId");
  if (!programId) return NextResponse.json({ error: "programId required" }, { status: 400 });
  const progId = parseInt(programId);

  // Verify ownership
  const [prog] = await db
    .select({ id: programs.id })
    .from(programs)
    .where(and(eq(programs.id, progId), eq(programs.userId, session.user.id)))
    .limit(1);
  if (!prog) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const plans = await db
    .select()
    .from(workoutPlans)
    .where(eq(workoutPlans.programId, progId))
    .orderBy(workoutPlans.sortOrder);

  return NextResponse.json(plans);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { programId, name, type, sortOrder } = await req.json();
  if (!programId || !name?.trim()) {
    return NextResponse.json({ error: "programId and name required" }, { status: 400 });
  }

  // Verify ownership
  const [prog] = await db
    .select({ id: programs.id })
    .from(programs)
    .where(and(eq(programs.id, programId), eq(programs.userId, session.user.id)))
    .limit(1);
  if (!prog) return NextResponse.json({ error: "Program not found" }, { status: 404 });

  const [plan] = await db
    .insert(workoutPlans)
    .values({ programId, name: name.trim(), type: type ?? "strength", sortOrder: sortOrder ?? 0 })
    .returning();

  return NextResponse.json(plan, { status: 201 });
}
