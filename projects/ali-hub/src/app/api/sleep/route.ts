import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { sleepEntries } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";

/** GET /api/sleep · list sleep entries for the authenticated user */
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

/** POST /api/sleep · upsert a sleep entry by (user_id, date) */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { date, bedtime, wake, hours, quality } = body as {
    date: string;
    bedtime: string;
    wake: string;
    hours: number;
    quality: number;
  };

  if (!date || !bedtime || !wake || hours == null || !quality) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  await db.run(
    sql`INSERT INTO sleep_entries (user_id, date, bedtime, wake, hours, quality, source)
        VALUES (${session.user.id}, ${date}, ${bedtime}, ${wake}, ${hours}, ${quality}, 'manual')
        ON CONFLICT (user_id, date) DO UPDATE SET
          bedtime = ${bedtime},
          wake = ${wake},
          hours = ${hours},
          quality = ${quality},
          source = CASE WHEN sleep_entries.source = 'apple_health' THEN 'apple_health' ELSE 'manual' END`
  );

  return NextResponse.json({ ok: true });
}
