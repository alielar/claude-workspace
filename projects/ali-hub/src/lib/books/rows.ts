import type { readingQueue } from "@/db/schema";
import type { Book, BookStatus } from "@/lib/books/types";

/** DB row → API shape (server-side only). */
export function rowToBook(r: typeof readingQueue.$inferSelect): Book {
  return {
    id: r.id, slug: r.slug, title: r.title, subtitle: r.subtitle, author: r.author, isbn: r.isbn,
    coverUrl: r.coverUrl, covers: r.covers, payoff: r.payoff, pages: r.pages, year: r.year,
    status: r.status as BookStatus, sortOrder: r.sortOrder,
    startedAt: r.startedAt ? r.startedAt.getTime() : null,
    finishedAt: r.finishedAt ? r.finishedAt.getTime() : null,
  };
}
