/**
 * GET /api/checklist/suggestions
 * Returns pending suggestions (up to 3) + latest weekly review for the current user.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { checklistSuggestions, weeklyReviews } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const [suggestions, reviews] = await Promise.all([
    db
      .select()
      .from(checklistSuggestions)
      .where(and(eq(checklistSuggestions.userId, userId), eq(checklistSuggestions.status, "pending")))
      .orderBy(desc(checklistSuggestions.createdAt))
      .limit(3),

    db
      .select()
      .from(weeklyReviews)
      .where(eq(weeklyReviews.userId, userId))
      .orderBy(desc(weeklyReviews.createdAt))
      .limit(1),
  ]);

  return NextResponse.json({
    suggestions: suggestions.map((s) => ({
      id: s.id,
      title: s.title,
      rationale: s.rationale,
      emoji: s.suggestedEmoji,
      weekStart: s.weekStart,
    })),
    weeklyReview: reviews[0]?.patternObservation ?? null,
  });
}
