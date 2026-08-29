/**
 * GET  /api/library/annotations?bookId=X  → list all annotations for a book
 * POST /api/library/annotations            → create a new annotation
 * Body: { bookId, pageNumber, selectedText, note?, color? }
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { books, annotations } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bookId = Number(req.nextUrl.searchParams.get("bookId"));
  if (isNaN(bookId)) {
    return NextResponse.json({ error: "bookId required" }, { status: 400 });
  }

  // Verify ownership
  const [book] = await db
    .select()
    .from(books)
    .where(and(eq(books.id, bookId), eq(books.userId, session.user.id)))
    .limit(1);

  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  const rows = await db
    .select()
    .from(annotations)
    .where(eq(annotations.bookId, bookId))
    .orderBy(annotations.pageNumber);

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { bookId, pageNumber, selectedText, note, color } = await req.json();

  // Verify ownership
  const [book] = await db
    .select()
    .from(books)
    .where(and(eq(books.id, bookId), eq(books.userId, session.user.id)))
    .limit(1);

  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  const [annotation] = await db
    .insert(annotations)
    .values({
      bookId,
      pageNumber,
      selectedText,
      note: note ?? null,
      color: color ?? "yellow",
    })
    .returning();

  return NextResponse.json(annotation);
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = Number(req.nextUrl.searchParams.get("id"));

  // Verify ownership via join
  const [row] = await db
    .select({ annotationId: annotations.id, userId: books.userId })
    .from(annotations)
    .innerJoin(books, eq(annotations.bookId, books.id))
    .where(and(eq(annotations.id, id), eq(books.userId, session.user.id)))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.delete(annotations).where(eq(annotations.id, id));
  return NextResponse.json({ success: true });
}
