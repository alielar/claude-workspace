/**
 * POST /api/wordbank/review
 *
 * Apply a 3-button SRS grade to a word bank entry.
 *
 * Body: { wordId: number, button: "again" | "good" | "easy" }
 *
 * Updates: interval (step index), streak, nextReviewDate, masteryStatus
 * SM-2 fields (easeFactor, repetitions) are left unchanged.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { wordBankEntries } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { srsReview, type SrsButton } from "@/lib/srs";
import { autoCheck } from "@/lib/checklist/autoCheck";

const VALID_BUTTONS = new Set<string>(["again", "good", "easy"]);

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { wordId, button } = await req.json();

  if (typeof wordId !== "number" || !VALID_BUTTONS.has(button)) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // Fetch current SRS state
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

  // Compute new SRS state — `interval` column stores step index (0–6)
  const result = srsReview(
    button as SrsButton,
    entry.interval,           // step index
    entry.streak ?? 0
  );

  await db
    .update(wordBankEntries)
    .set({
      interval: result.step,
      streak: result.streak,
      nextReviewDate: result.nextReviewDate,
      masteryStatus: result.masteryStatus,
    })
    .where(eq(wordBankEntries.id, wordId));

  // Auto-check word bank items (fires on every review; idempotent)
  autoCheck(session.user.id, "words").catch(() => {});

  return NextResponse.json({ success: true, ...result });
}
