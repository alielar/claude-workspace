/**
 * GET /api/calendar/today → { date, configured, blocks: [{...block, ticked}] }
 * Today's calendar blocks (work meetings merged, personal events individual)
 * with this user's productivity ticks applied. Server-cached 10 min per day.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { calendarTicks } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { checklistToday } from "@/lib/checklist/day";
import { blocksForDay } from "@/lib/calendar/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const day = checklistToday();

  // ?fresh=1 · skip the 10-min cache (the Settings "check connection" needs a live answer).
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  const { blocks, configured, fetchedAt, errors } = await blocksForDay(session.user.id, day, fresh);
  const ticks = await db.select({ blockKey: calendarTicks.blockKey }).from(calendarTicks)
    .where(and(eq(calendarTicks.userId, session.user.id), eq(calendarTicks.date, day))).catch(() => []);
  const done = new Set(ticks.map((t) => t.blockKey));

  return NextResponse.json({
    date: day,
    configured,
    fetchedAt,
    errors,
    blocks: blocks.map((b) => ({ ...b, ticked: done.has(b.key) })),
  });
}
