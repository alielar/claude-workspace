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

/**
 * "Today" for checklist purposes — if it's before 4 AM in Madrid,
 * we treat it as still being the previous day so late-night check-offs
 * count toward yesterday's list.
 */
function checklistToday(): string {
  const now = new Date();
  const madridHour = parseInt(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "numeric", hour12: false }).format(now)
  );
  const offset = madridHour < 4 ? -1 : 0;
  const adjusted = new Date(now.getTime() + offset * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(adjusted);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { itemId } = await req.json();
  if (!itemId || typeof itemId !== "number") {
    return NextResponse.json({ error: "itemId required" }, { status: 400 });
  }

  const today = checklistToday();

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
