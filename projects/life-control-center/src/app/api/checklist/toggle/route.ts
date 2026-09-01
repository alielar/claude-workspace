/**
 * POST /api/checklist/toggle
 *
 * Body: { itemId: number, completed?: boolean, date?: "YYYY-MM-DD" }
 *
 * With `completed` → sets that exact state (idempotent · safe to replay from the
 * offline outbox any number of times). `date` lets a phone that was offline
 * overnight still record yesterday's tick against yesterday.
 *
 * Without `completed` → legacy toggle behaviour.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { checklistCompletions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { checklistToday } from "@/lib/checklist/day";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const body = await req.json();
  const itemId: unknown = body?.itemId;
  if (!itemId || typeof itemId !== "number") {
    return NextResponse.json({ error: "itemId required" }, { status: 400 });
  }

  const date =
    typeof body?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
      ? body.date
      : checklistToday();

  const [existing] = await db.select()
    .from(checklistCompletions)
    .where(
      and(
        eq(checklistCompletions.itemId, itemId),
        eq(checklistCompletions.userId, userId),
        eq(checklistCompletions.date, date),
      )
    )
    .limit(1);

  const want: boolean = typeof body?.completed === "boolean" ? body.completed : !existing;

  if (want && !existing) {
    try {
      await db.insert(checklistCompletions).values({ itemId, userId, date });
    } catch {
      /* duplicate from a replayed request · already done */
    }
  } else if (!want && existing) {
    await db.delete(checklistCompletions).where(eq(checklistCompletions.id, existing.id));
  }

  return NextResponse.json({ completedToday: want, date });
}
