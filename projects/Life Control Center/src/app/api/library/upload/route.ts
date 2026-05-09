/**
 * POST /api/library/upload
 * Accepts a PDF file upload for a book and stores it as a base64-encoded blob
 * in Turso (SQLite). Suitable for books up to ~10MB.
 *
 * Form data:
 *   file   — PDF file
 *   bookId — integer ID of the book
 *
 * On success, sets books.pdfKey = "inline:<bookId>" and marks status as "reading".
 * The actual PDF bytes are stored in a separate pdf_blobs table keyed by bookId.
 *
 * Note: For production, swap this for Vercel Blob (blob.vercel-storage.com)
 *       to avoid hitting Turso row-size limits.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { books, pdfBlobs } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const bookIdRaw = form.get("bookId");

  if (!file || !bookIdRaw) {
    return NextResponse.json({ error: "file and bookId required" }, { status: 400 });
  }

  const bookId = Number(bookIdRaw);
  if (isNaN(bookId)) {
    return NextResponse.json({ error: "Invalid bookId" }, { status: 400 });
  }

  // Verify the book belongs to this user
  const [book] = await db
    .select()
    .from(books)
    .where(and(eq(books.id, bookId), eq(books.userId, session.user.id)))
    .limit(1);

  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  // Read file as base64
  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");

  // Upsert PDF blob
  const existing = await db
    .select({ id: pdfBlobs.id })
    .from(pdfBlobs)
    .where(eq(pdfBlobs.bookId, bookId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(pdfBlobs)
      .set({ data: base64, updatedAt: new Date() })
      .where(eq(pdfBlobs.bookId, bookId));
  } else {
    await db.insert(pdfBlobs).values({
      bookId,
      data: base64,
      updatedAt: new Date(),
    });
  }

  // Mark the book as having a PDF + set status to "reading"
  await db
    .update(books)
    .set({
      pdfKey: `inline:${bookId}`,
      status: "reading",
    })
    .where(eq(books.id, bookId));

  return NextResponse.json({ success: true });
}
