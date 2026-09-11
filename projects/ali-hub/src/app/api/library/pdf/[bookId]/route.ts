/**
 * GET /api/library/pdf/[bookId]
 * Returns the raw PDF bytes for the given book.
 *
 * Supports two storage modes:
 * - Vercel Blob (pdfKey starts with "https://") → redirects to blob URL
 * - Legacy inline (pdfKey starts with "inline:") → serves from pdf_blobs table
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { books, pdfBlobs } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { bookId: bookIdStr } = await params;
  const bookId = Number(bookIdStr);

  // Verify ownership
  const [book] = await db
    .select()
    .from(books)
    .where(and(eq(books.id, bookId), eq(books.userId, session.user.id)))
    .limit(1);

  if (!book || !book.pdfKey) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Vercel Blob: redirect to the public URL
  if (book.pdfKey.startsWith("https://")) {
    return NextResponse.redirect(book.pdfKey);
  }

  // Legacy: serve from pdf_blobs table
  const [blob] = await db
    .select()
    .from(pdfBlobs)
    .where(eq(pdfBlobs.bookId, bookId))
    .limit(1);

  if (!blob) {
    return new NextResponse("PDF not uploaded", { status: 404 });
  }

  const bytes = Buffer.from(blob.data, "base64");
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
