/**
 * POST /api/checklist/toggle
 * Body: { itemId: number }
 *
 * Toggles completion for today (Europe/Madrid tz).
 * Inserts if not present, deletes if already present (undo).
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { checklistCompletions } from "@/db/schema";
import { eq, and } from "drizzle-orm";

function todayMadrid(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { itemId } = await req.json();
  if (!itemId || typeof itemId !== "number") {
    return NextResponse.json({ error: "itemId required" }, { status: 400 });
  }

  const today = todayMadrid();

  // Check if already completed
  const [existing] = await db.select()
    .from(checklistCompletions)
    .where(
      and(
        eq(checklistCompletions.itemId, itemId),
        eq(checklistCompletions.userId, userId),
        eq(checklistCompletions.date, today),
      )
    )
    .limit(1);

  if (existing) {
    // Undo — delete the completion
    await db.delete(checklistCompletions)
      .where(eq(checklistCompletions.id, existing.id));
    return NextResponse.json({ completedToday: false });
  } else {
    // Mark complete
    await db.insert(checklistCompletions).values({ itemId, userId, date: today });
    return NextResponse.json({ completedToday: true });
  }
}
