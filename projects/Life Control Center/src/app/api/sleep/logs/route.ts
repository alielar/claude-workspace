import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { sleepEntries } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";

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

/** POST /api/sleep/logs — quick manual log (bedtime + wake) */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { date, bedtime, wake } = await req.json();
  if (!date || !bedtime || !wake) {
    return NextResponse.json({ error: "date, bedtime, wake required" }, { status: 400 });
  }

  // Calculate hours from bedtime/wake
  const [bH, bM] = bedtime.split(":").map(Number);
  const [wH, wM] = wake.split(":").map(Number);
  let hours = (wH + wM / 60) - (bH + bM / 60);
  if (hours <= 0) hours += 24; // crossed midnight

  await db
    .insert(sleepEntries)
    .values({
      userId: session.user.id,
      date,
      bedtime,
      wake,
      hours: Math.round(hours * 100) / 100,
      quality: 5,
      source: "manual",
    })
    .onConflictDoUpdate({
      target: [sleepEntries.userId, sleepEntries.date],
      set: {
        bedtime: sql`excluded.bedtime`,
        wake: sql`excluded.wake`,
        hours: sql`excluded.hours`,
        source: sql`excluded.source`,
      },
    });

  return NextResponse.json({ success: true, date, bedtime, wake, hours: Math.round(hours * 100) / 100 });
}
