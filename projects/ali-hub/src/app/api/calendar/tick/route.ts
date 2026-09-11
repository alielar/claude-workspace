/**
 * POST /api/calendar/tick { date, key, ticked } · mark a calendar block
 * productive / not. Sends the desired final state → idempotent, outbox-safe.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { calendarTicks } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null);
  const date = typeof b?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : null;
  const key = typeof b?.key === "string" && b.key.length <= 64 ? b.key : null;
  if (!date || !key) return NextResponse.json({ error: "date + key required" }, { status: 400 });

  if (b.ticked) {
    try { await db.insert(calendarTicks).values({ userId: session.user.id, date, blockKey: key }); }
    catch { /* already ticked · desired state reached */ }
  } else {
    await db.delete(calendarTicks).where(and(
      eq(calendarTicks.userId, session.user.id), eq(calendarTicks.date, date), eq(calendarTicks.blockKey, key),
    ));
  }
  return NextResponse.json({ ok: true });
}
