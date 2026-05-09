/**
 * POST /api/library/seed
 * Seeds the DB with the 12-book 2026 reading roadmap.
 * Skips seeding if books already exist for this user.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { books } from "@/db/schema";
import { eq } from "drizzle-orm";
import { BOOKS_2026 } from "@/lib/books-seed";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // Idempotent — skip if already seeded
  const existing = await db
    .select({ id: books.id })
    .from(books)
    .where(eq(books.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json({ skipped: true, message: "Already seeded" });
  }

  await db.insert(books).values(
    BOOKS_2026.map((b) => ({
      userId,
      title: b.title,
      author: b.author,
      topic: b.topic,
      targetMonth: b.targetMonth,
      targetYear: b.targetYear,
      totalPages: b.totalPages ?? null,
      isPublicDomain: b.isPublicDomain,
      publicDomainUrl: b.publicDomainUrl ?? null,
      coverUrl: b.coverUrl ?? null,
      sortOrder: b.sortOrder,
    }))
  );

  return NextResponse.json({ seeded: BOOKS_2026.length });
}
