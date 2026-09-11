/**
 * GET /api/checklist/weekly-reviews
 * Returns the last 8 weekly reviews for the current user, newest first.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { weeklyReviews } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select({
      id: weeklyReviews.id,
      weekStart: weeklyReviews.weekStart,
      patternObservation: weeklyReviews.patternObservation,
      createdAt: weeklyReviews.createdAt,
    })
    .from(weeklyReviews)
    .where(eq(weeklyReviews.userId, session.user.id))
    .orderBy(desc(weeklyReviews.weekStart))
    .limit(8);

  return NextResponse.json({ reviews: rows });
}
