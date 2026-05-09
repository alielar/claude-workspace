/**
 * PATCH  /api/goals/[id] → update goal fields (title, currentValue, status, etc.)
 * DELETE /api/goals/[id] → delete goal
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { goals } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: idStr } = await params;
  const id = Number(idStr);
  const body = await req.json();

  const [existing] = await db
    .select()
    .from(goals)
    .where(and(eq(goals.id, id), eq(goals.userId, session.user.id)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  const allowed = ["title", "description", "category", "targetValue", "currentValue", "unit", "targetDate", "status"];
  for (const key of allowed) {
    if (key in body) {
      if (key === "targetDate") {
        updates[key] = body[key] ? new Date(body[key]) : null;
      } else {
        updates[key] = body[key];
      }
    }
  }

  if (body.status === "completed") {
    updates.completedAt = new Date();
  }

  const [updated] = await db
    .update(goals)
    .set(updates)
    .where(eq(goals.id, id))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: idStr } = await params;
  const id = Number(idStr);

  await db
    .delete(goals)
    .where(and(eq(goals.id, id), eq(goals.userId, session.user.id)));

  return NextResponse.json({ success: true });
}
