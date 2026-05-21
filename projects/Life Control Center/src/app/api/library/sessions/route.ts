/**
 * POST /api/library/sessions — save a completed reading session
 * GET  /api/library/sessions — get sessions for streak + recent history
 *
 * Body (POST): { bookId, startPage, endPage, durationMinutes }
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { readingSessions, books } from "@/db/schema";
import { eq, and, desc, gte } from "drizzle-orm";
import { format, subDays } from "date-fns";
import { autoCheck } from "@/lib/checklist/autoCheck";

function todayMadrid(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}

/** Consecutive-day reading streak from a set of date strings */
function calcStreak(dates: string[], today: string): number {
  const unique = [...new Set(dates)].sort().reverse();
  if (unique.length === 0) return 0;
  const yesterday = format(subDays(new Date(today + "T12:00:00"), 1), "yyyy-MM-dd");
  let check = unique.includes(today) ? today : yesterday;
  let count = 0;
  for (const d of unique) {
    if (d === check) {
      count++;
      check = format(subDays(new Date(check + "T12:00:00"), 1), "yyyy-MM-dd");
    } else if (d < check) break;
  }
  return count;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { bookId, startPage, endPage, durationMinutes } = await req.json();
  if (!bookId || durationMinutes < 1) return NextResponse.json({ ok: true }); // skip < 1m sessions

  // Verify ownership
  const [book] = await db.select({ id: books.id }).from(books)
    .where(and(eq(books.id, bookId), eq(books.userId, userId))).limit(1);
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const today = todayMadrid();
  await db.insert(readingSessions).values({
    bookId, userId,
    startPage: startPage ?? 1,
    endPage:   endPage   ?? 1,
    durationMinutes,
    date: today,
  });

  // Auto-check reading items (sessions >= 5 min count)
  if (durationMinutes >= 5) {
    autoCheck(userId, "reading").catch(() => {});
  }

  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const lookback = format(subDays(new Date(), 90), "yyyy-MM-dd");
  const sessions = await db
    .select({
      id: readingSessions.id,
      bookId: readingSessions.bookId,
      title: books.title,
      durationMinutes: readingSessions.durationMinutes,
      startPage: readingSessions.startPage,
      endPage: readingSessions.endPage,
      date: readingSessions.date,
      startedAt: readingSessions.startedAt,
    })
    .from(readingSessions)
    .innerJoin(books, eq(readingSessions.bookId, books.id))
    .where(and(eq(readingSessions.userId, userId), gte(readingSessions.date, lookback)))
    .orderBy(desc(readingSessions.startedAt))
    .limit(50);

  const today = todayMadrid();
  const streak = calcStreak(sessions.map((s) => s.date), today);

  const thisMonthStart = today.substring(0, 7) + "-01";
  const thisMonthMin = sessions
    .filter((s) => s.date >= thisMonthStart)
    .reduce((sum, s) => sum + s.durationMinutes, 0);

  return NextResponse.json({ sessions, streak, thisMonthMinutes: thisMonthMin });
}
