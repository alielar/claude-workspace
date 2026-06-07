/**
 * POST /api/sleep/reset — clears all old seed/dummy sleep data.
 * Only keeps entries from today onwards (real Apple Watch data).
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { sleepEntries } from "@/db/schema";
import { eq, and, lt } from "drizzle-orm";

function todayMadrid(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = todayMadrid();

  const result = await db
    .delete(sleepEntries)
    .where(and(eq(sleepEntries.userId, session.user.id), lt(sleepEntries.date, today)));

  return NextResponse.json({ success: true, deletedBefore: today, rowsAffected: result.rowsAffected });
}
