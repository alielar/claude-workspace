import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { moodEntries } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { autoCheck } from "@/lib/checklist/autoCheck";

/** GET /api/mood · list mood entries for the authenticated user */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(moodEntries)
    .where(eq(moodEntries.userId, session.user.id))
    .orderBy(desc(moodEntries.date))
    .limit(90);

  return NextResponse.json(rows);
}

/** POST /api/mood · upsert a mood entry by (user_id, date) */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { date, score, note, time } = body as {
    date: string;
    score: number;
    note?: string;
    time?: string;
  };

  if (!date || !score || score < 1 || score > 5) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  // Upsert: try insert, on conflict update
  await db.run(
    sql`INSERT INTO mood_entries (user_id, date, score, note, time)
        VALUES (${session.user.id}, ${date}, ${score}, ${note ?? ""}, ${time ?? ""})
        ON CONFLICT (user_id, date) DO UPDATE SET
          score = ${score},
          note = ${note ?? ""},
          time = ${time ?? ""}`
  );

  autoCheck(session.user.id, "mood").catch(() => {});

  return NextResponse.json({ ok: true });
}
