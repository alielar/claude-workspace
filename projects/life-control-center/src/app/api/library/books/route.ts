/**
 * GET  /api/library/books — all books for the user, enriched with:
 *   - currentPage + progress % from reading_progress
 *   - annotationCount from annotations
 * POST /api/library/books — create a new book
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { books, readingProgress, annotations } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  // Fetch all books ordered by sortOrder
  const allBooks = await db.select().from(books).where(eq(books.userId, userId)).orderBy(books.sortOrder);

  // Enrich with reading progress and annotation counts in parallel
  const enriched = await Promise.all(
    allBooks.map(async (book) => {
      const [progress, countRow] = await Promise.all([
        db.select().from(readingProgress).where(eq(readingProgress.bookId, book.id)).limit(1),
        db
          .select({ count: sql<number>`count(*)` })
          .from(annotations)
          .where(eq(annotations.bookId, book.id)),
      ]);

      const currentPage    = progress[0]?.currentPage ?? 0;
      const annotationCount = countRow[0]?.count ?? 0;
      const progressPct    = book.totalPages && book.totalPages > 0
        ? Math.round((currentPage / book.totalPages) * 100)
        : 0;

      return { ...book, currentPage, progressPct, annotationCount };
    })
  );

  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const body = await req.json();
  const { title, author, topic } = body;

  if (!title?.trim() || !author?.trim()) {
    return NextResponse.json({ error: "Title and author are required" }, { status: 400 });
  }

  // sortOrder = current book count + 1 so new books go to the bottom
  const existing = await db.select().from(books).where(eq(books.userId, userId));

  const [newBook] = await db.insert(books).values({
    userId,
    title: title.trim(),
    author: author.trim(),
    topic: topic?.trim() || null,
    status: "not_started",
    sortOrder: existing.length + 1,
  }).returning();

  return NextResponse.json(newBook);
}
