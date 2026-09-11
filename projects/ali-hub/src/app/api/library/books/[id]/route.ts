/**
 * PATCH /api/library/books/[id] · update book status
 *
 * Body: { status: "reading" | "finished" | "not_started" }
 *
 * - "reading"     → sets startedAt to now (only if not already set)
 * - "finished"    → sets finishedAt to now
 * - "not_started" → clears startedAt and finishedAt
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { books } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { id } = await params;
  const bookId = parseInt(id, 10);
  if (isNaN(bookId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json();
  const { status, pdfKey } = body as { status?: string; pdfKey?: string };

  if (!status && !pdfKey) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  if (status && !["reading", "finished", "not_started"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  // Verify ownership
  const [book] = await db.select().from(books).where(and(eq(books.id, bookId), eq(books.userId, userId)));
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date();

  const updates: Partial<typeof books.$inferInsert> = {};
  if (status) {
    updates.status = status;
    if (status === "reading" && !book.startedAt) {
      updates.startedAt = now;
    }
    if (status === "finished") {
      updates.finishedAt = now;
      if (!book.startedAt) updates.startedAt = now;
    }
    if (status === "not_started") {
      updates.startedAt = null;
      updates.finishedAt = null;
    }
  }
  if (pdfKey) {
    updates.pdfKey = pdfKey;
    // Auto-set status to reading when a PDF is uploaded
    if (!status && book.status === "not_started") {
      updates.status = "reading";
      if (!book.startedAt) updates.startedAt = now;
    }
  }

  const [updated] = await db
    .update(books)
    .set(updates)
    .where(and(eq(books.id, bookId), eq(books.userId, userId)))
    .returning();

  return NextResponse.json(updated);
}
