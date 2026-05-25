import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { sleepEntries } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

/** GET /api/sleep/logs — returns last 90 days of sleep records with all columns */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(sleepEntries)
    .where(eq(sleepEntries.userId, session.user.id))
    .orderBy(desc(sleepEntries.date))
    .limit(90);

  return NextResponse.json(rows);
}
