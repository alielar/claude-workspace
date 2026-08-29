/**
 * POST /api/library/notes/review
 * Grade a reading note using the same SRS system as word bank.
 * Body: { noteId: number, button: "again" | "good" | "easy" }
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { readingNotes } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { srsReview, type SrsButton } from "@/lib/srs";

const VALID_BUTTONS = new Set<string>(["again", "good", "easy"]);

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { noteId, button } = await req.json();

  if (typeof noteId !== "number" || !VALID_BUTTONS.has(button)) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const [entry] = await db
    .select()
    .from(readingNotes)
    .where(and(eq(readingNotes.id, noteId), eq(readingNotes.userId, session.user.id)))
    .limit(1);

  if (!entry) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  const result = srsReview(button as SrsButton, entry.interval, entry.streak);

  await db
    .update(readingNotes)
    .set({
      interval: result.step,
      streak: result.streak,
      nextReviewDate: result.nextReviewDate,
      masteryStatus: result.masteryStatus,
    })
    .where(eq(readingNotes.id, noteId));

  return NextResponse.json({ success: true, ...result });
}
