/**
 * GET /api/library/book/[bookId]
 * Returns book metadata and the user's current reading page.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { books, readingProgress } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { bookId: bookIdStr } = await params;
  const bookId = Number(bookIdStr);

  const [book] = await db
    .select()
    .from(books)
    .where(and(eq(books.id, bookId), eq(books.userId, session.user.id)))
    .limit(1);

  if (!book) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [progress] = await db
    .select()
    .from(readingProgress)
    .where(eq(readingProgress.bookId, bookId))
    .limit(1);

  return NextResponse.json({
    book,
    currentPage: progress?.currentPage ?? 1,
    bookmarkText: progress?.bookmarkText ?? null,
    bookmarkPage: progress?.bookmarkPage ?? null,
  });
}
