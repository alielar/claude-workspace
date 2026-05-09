/**
 * GET /api/wordbank
 * Returns all word bank entries for the authenticated user.
 *
 * Query params:
 *   ?due=true  → only return words where nextReviewDate <= today
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { wordBankEntries } from "@/db/schema";
import { eq, and, lte } from "drizzle-orm";
import { format } from "date-fns";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const due = req.nextUrl.searchParams.get("due") === "true";
  const today = format(new Date(), "yyyy-MM-dd");

  const words = await db
    .select()
    .from(wordBankEntries)
    .where(
      due
        ? and(
            eq(wordBankEntries.userId, session.user.id),
            lte(wordBankEntries.nextReviewDate, today)
          )
        : eq(wordBankEntries.userId, session.user.id)
    )
    .orderBy(wordBankEntries.createdAt);

  return NextResponse.json(words);
}
