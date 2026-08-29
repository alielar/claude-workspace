/**
 * GET /api/library/notes — list reading notes
 *   ?bookId=X — filter by book
 *   ?due=true — only notes due for review
 *
 * POST /api/library/notes — create a reading note
 *   Body: { bookId?, pageNumber?, content }
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { readingNotes, books } from "@/db/schema";
import { eq, and, lte, desc } from "drizzle-orm";

function todayMadrid(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const bookIdParam = url.searchParams.get("bookId");
  const dueOnly = url.searchParams.get("due") === "true";

  let query = db
    .select({
      id: readingNotes.id,
      bookId: readingNotes.bookId,
      pageNumber: readingNotes.pageNumber,
      content: readingNotes.content,
      interval: readingNotes.interval,
      streak: readingNotes.streak,
      nextReviewDate: readingNotes.nextReviewDate,
      masteryStatus: readingNotes.masteryStatus,
      createdAt: readingNotes.createdAt,
      bookTitle: books.title,
    })
    .from(readingNotes)
    .leftJoin(books, eq(readingNotes.bookId, books.id))
    .where(eq(readingNotes.userId, session.user.id))
    .orderBy(desc(readingNotes.createdAt))
    .$dynamic();

  if (bookIdParam) {
    query = query.where(and(eq(readingNotes.userId, session.user.id), eq(readingNotes.bookId, Number(bookIdParam))));
  }

  if (dueOnly) {
    const today = todayMadrid();
    query = query.where(and(eq(readingNotes.userId, session.user.id), lte(readingNotes.nextReviewDate, today)));
  }

  const rows = await query.limit(200);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { bookId, pageNumber, content } = await req.json();

  if (!content || typeof content !== "string" || !content.trim()) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  const today = todayMadrid();

  const [note] = await db
    .insert(readingNotes)
    .values({
      userId: session.user.id,
      bookId: bookId ?? null,
      pageNumber: pageNumber ?? null,
      content: content.trim(),
      interval: 0,
      streak: 0,
      nextReviewDate: today,
      masteryStatus: "new",
    })
    .returning();

  return NextResponse.json(note);
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const noteId = Number(url.searchParams.get("id"));
  if (!noteId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  await db
    .delete(readingNotes)
    .where(and(eq(readingNotes.id, noteId), eq(readingNotes.userId, session.user.id)));

  return NextResponse.json({ ok: true });
}
