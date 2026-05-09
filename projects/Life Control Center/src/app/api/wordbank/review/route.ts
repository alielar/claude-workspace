/**
 * POST /api/wordbank/review
 * Apply an SM-2 review grade to a word bank entry.
 *
 * Body: { wordId: number, quality: 0 | 1 | 2 | 3 }
 *
 * Updates: interval, easeFactor, repetitions, nextReviewDate, masteryStatus
 * masteryStatus:
 *   "new"      → repetitions === 0
 *   "learning" → repetitions 1–4
 *   "mastered" → repetitions >= 5
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { wordBankEntries } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { sm2 } from "@/lib/sm2";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { wordId, quality } = await req.json();

  if (typeof wordId !== "number" || ![0, 1, 2, 3].includes(quality)) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // Fetch current SM-2 state for this word
  const [entry] = await db
    .select()
    .from(wordBankEntries)
    .where(
      and(
        eq(wordBankEntries.id, wordId),
        eq(wordBankEntries.userId, session.user.id)
      )
    )
    .limit(1);

  if (!entry) {
    return NextResponse.json({ error: "Word not found" }, { status: 404 });
  }

  // Compute new SM-2 values
  const result = sm2(
    quality as 0 | 1 | 2 | 3,
    entry.repetitions,
    entry.easeFactor,
    entry.interval
  );

  // Derive mastery status from new repetition count
  const masteryStatus =
    result.repetitions === 0
      ? "new"
      : result.repetitions >= 5
      ? "mastered"
      : "learning";

  await db
    .update(wordBankEntries)
    .set({
      interval: result.interval,
      easeFactor: result.easeFactor,
      repetitions: result.repetitions,
      nextReviewDate: result.nextReviewDate,
      masteryStatus,
    })
    .where(eq(wordBankEntries.id, wordId));

  return NextResponse.json({ success: true, ...result, masteryStatus });
}
