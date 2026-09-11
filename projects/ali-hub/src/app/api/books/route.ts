/**
 * GET  /api/books · the reading list (seeds the researched books once, by slug)
 * POST /api/books · add a book { title, author, isbn?, covers?, payoff? } (cover from Open Library when an ISBN is given)
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { readingQueue } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { BOOK_SEED, coverByIsbn } from "@/lib/books/types";
import { rowToBook } from "@/lib/books/rows";

async function seed(userId: string) {
  const have = new Set(
    (await db.select({ slug: readingQueue.slug }).from(readingQueue).where(eq(readingQueue.userId, userId)))
      .map((r) => r.slug).filter(Boolean)
  );
  for (const b of BOOK_SEED) {
    if (have.has(b.slug)) continue;
    try {
      await db.insert(readingQueue).values({
        userId, slug: b.slug, title: b.title, subtitle: b.subtitle, author: b.author, isbn: b.isbn,
        coverUrl: b.coverUrl, covers: b.covers, payoff: b.payoff, pages: b.pages, year: b.year,
        status: "queue", sortOrder: b.sortOrder,
      });
    } catch { /* raced · fine */ }
  }
}

const STATUS_ORDER: Record<string, number> = { reading: 0, queue: 1, finished: 2 };

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  try { await seed(userId); } catch { /* migration pending */ }
  const rows = await db.select().from(readingQueue).where(eq(readingQueue.userId, userId));
  const books = rows.map(rowToBook).sort((a, b) =>
    (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) || (a.sortOrder - b.sortOrder) || (a.id - b.id)
  );
  return NextResponse.json({ books });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const b = await req.json();
  const title = typeof b?.title === "string" ? b.title.trim().slice(0, 200) : "";
  const author = typeof b?.author === "string" ? b.author.trim().slice(0, 120) : "";
  if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 });
  const isbn = typeof b?.isbn === "string" ? b.isbn.replace(/[^0-9Xx]/g, "") : "";
  const clientId = typeof b?.clientId === "string" ? b.clientId.slice(0, 64) : null;

  // Offline replays: the same clientId must not create a second row.
  if (clientId) {
    const [dup] = await db.select().from(readingQueue).where(eq(readingQueue.slug, `c:${clientId}`)).limit(1);
    if (dup) return NextResponse.json(rowToBook(dup));
  }

  const [last] = await db.select({ sortOrder: readingQueue.sortOrder }).from(readingQueue)
    .where(eq(readingQueue.userId, userId)).orderBy(desc(readingQueue.sortOrder)).limit(1);

  const [row] = await db.insert(readingQueue).values({
    userId,
    slug: clientId ? `c:${clientId}` : null,
    title, author: author || "Unknown author",
    subtitle: null,
    isbn: isbn || null,
    coverUrl: isbn ? coverByIsbn(isbn) : null,
    covers: typeof b?.covers === "string" ? b.covers.trim().slice(0, 1000) || null : null,
    payoff: typeof b?.payoff === "string" ? b.payoff.trim().slice(0, 1000) || null : null,
    pages: null, year: null, status: "queue",
    sortOrder: (last?.sortOrder ?? 0) + 10,
  }).returning();
  return NextResponse.json(rowToBook(row), { status: 201 });
}
