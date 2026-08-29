/**
 * POST /api/library/progress
 * Saves or updates reading progress (current page) for a book.
 *
 * Body: { bookId: number, currentPage: number }
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { books, readingProgress } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { bookId, currentPage, bookmarkText, bookmarkPage } = await req.json();

  // Verify ownership
  const [book] = await db
    .select()
    .from(books)
    .where(and(eq(books.id, bookId), eq(books.userId, session.user.id)))
    .limit(1);

  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  const [existing] = await db
    .select()
    .from(readingProgress)
    .where(eq(readingProgress.bookId, bookId))
    .limit(1);

  // Build the update payload — only include bookmark fields when provided
  const updatePayload: Record<string, unknown> = { currentPage, lastReadAt: new Date() };
  if (bookmarkText !== undefined) updatePayload.bookmarkText = bookmarkText;
  if (bookmarkPage !== undefined) updatePayload.bookmarkPage = bookmarkPage;

  if (existing) {
    await db
      .update(readingProgress)
      .set(updatePayload)
      .where(eq(readingProgress.bookId, bookId));
  } else {
    await db.insert(readingProgress).values({
      bookId,
      currentPage,
      lastReadAt: new Date(),
      ...(bookmarkText !== undefined && { bookmarkText }),
      ...(bookmarkPage !== undefined && { bookmarkPage }),
    });
  }

  return NextResponse.json({ success: true });
}
