/**
 * GET /api/library/pdf/[bookId]
 * Returns the raw PDF bytes for the given book.
 * Used by the react-pdf reader to stream the file.
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

  if (!book) {
    return new NextResponse("Not found", { status: 404 });
  }

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
