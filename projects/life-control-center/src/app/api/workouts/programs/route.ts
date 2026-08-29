/**
 * GET  /api/workouts/programs  — list all programs for the user
 * POST /api/workouts/programs  — create a new program
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { programs, workoutPlans } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select()
    .from(programs)
    .where(eq(programs.userId, session.user.id))
    .orderBy(desc(programs.createdAt));

  // Attach plans for each program
  const result = await Promise.all(
    rows.map(async (prog) => {
      const plans = await db
        .select()
        .from(workoutPlans)
        .where(eq(workoutPlans.programId, prog.id))
        .orderBy(workoutPlans.sortOrder);
      return { ...prog, plans };
    })
  );

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, description, cycles } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  const [prog] = await db
    .insert(programs)
    .values({ userId: session.user.id, name: name.trim(), description, cycles })
    .returning();

  return NextResponse.json(prog, { status: 201 });
}
