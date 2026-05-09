/**
 * GET  /api/goals        → list active goals
 * POST /api/goals        → create a goal
 *   body: { title, description?, category?, targetValue?, currentValue?, unit?, targetDate? }
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { goals } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(goals)
    .where(and(eq(goals.userId, session.user.id)))
    .orderBy(goals.createdAt);

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { title, description, category, targetValue, currentValue, unit, targetDate } = body;

  if (!title?.trim()) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }

  const [goal] = await db
    .insert(goals)
    .values({
      userId: session.user.id,
      title: title.trim(),
      description: description ?? null,
      category: category ?? "other",
      targetValue: targetValue ?? null,
      currentValue: currentValue ?? 0,
      unit: unit ?? null,
      targetDate: targetDate ? new Date(targetDate) : null,
    })
    .returning();

  return NextResponse.json(goal);
}
