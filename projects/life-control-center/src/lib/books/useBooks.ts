"use client";

/** Local-first reading list: cached read, optimistic edits, writes through the outbox. */

import { useCallback } from "react";
import { useCached, fetchJson } from "@/lib/local/store";
import { sendOrQueue } from "@/lib/local/outbox";
import type { Book, BooksData, BookStatus } from "@/lib/books/types";

export const BOOKS_KEY = "books";

export function useBooks() {
  const q = useCached<BooksData>(BOOKS_KEY, () => fetchJson<BooksData>("/api/books"));
  const { setData } = q;

  const setStatus = useCallback(async (book: Book, status: BookStatus) => {
    const now = Date.now();
    const patch = (b: Book): Book => b.id !== book.id ? b : {
      ...b, status,
      startedAt: status === "reading" ? (b.startedAt ?? now) : status === "queue" ? null : b.startedAt,
      finishedAt: status === "finished" ? now : null,
    };
    // Only one book is "reading" at a time — starting one sends the current one back to the queue.
    setData((prev) => ({
      books: (prev?.books ?? []).map((b) =>
        status === "reading" && b.status === "reading" && b.id !== book.id ? { ...b, status: "queue" as BookStatus } : patch(b)
      ),
    }));
    const others = status === "reading" ? (q.data?.books ?? []).filter((b) => b.status === "reading" && b.id !== book.id) : [];
    try {
      await Promise.all([
        sendOrQueue({ url: `/api/books/${book.id}`, method: "PATCH", body: { status, startedAt: now, finishedAt: now }, dedupeKey: `book:${book.id}:status` }),
        ...others.map((o) => sendOrQueue({ url: `/api/books/${o.id}`, method: "PATCH", body: { status: "queue" }, dedupeKey: `book:${o.id}:status` })),
      ]);
    } catch { /* server refused — next refresh shows the truth */ }
  }, [setData, q.data]);

  const moveToTop = useCallback(async (book: Book) => {
    const min = Math.min(0, ...(q.data?.books ?? []).map((b) => b.sortOrder));
    const sortOrder = min - 10;
    setData((prev) => ({ books: (prev?.books ?? []).map((b) => (b.id === book.id ? { ...b, sortOrder } : b)) }));
    try {
      await sendOrQueue({ url: `/api/books/${book.id}`, method: "PATCH", body: { sortOrder }, dedupeKey: `book:${book.id}:order` });
    } catch { /* ignore */ }
  }, [setData, q.data]);

  const remove = useCallback(async (book: Book) => {
    setData((prev) => ({ books: (prev?.books ?? []).filter((b) => b.id !== book.id) }));
    try {
      await sendOrQueue({ url: `/api/books/${book.id}`, method: "DELETE", dedupeKey: `book:${book.id}:delete` });
    } catch { /* ignore */ }
  }, [setData]);

  const add = useCallback(async (input: { title: string; author: string; isbn?: string; covers?: string; payoff?: string }) => {
    const clientId = (() => { try { return crypto.randomUUID(); } catch { return `${Date.now()}`; } })();
    const isbn = (input.isbn ?? "").replace(/[^0-9Xx]/g, "");
    const temp: Book = {
      id: -Date.now(), slug: `c:${clientId}`, title: input.title.trim(), subtitle: null, author: input.author.trim() || "Unknown author",
      isbn: isbn || null, coverUrl: isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg` : null,
      covers: input.covers?.trim() || null, payoff: input.payoff?.trim() || null, pages: null, year: null,
      status: "queue", sortOrder: Math.max(0, ...(q.data?.books ?? []).map((b) => b.sortOrder)) + 10, startedAt: null, finishedAt: null,
    };
    setData((prev) => ({ books: [...(prev?.books ?? []), temp] }));
    try {
      const ok = await sendOrQueue({ url: "/api/books", method: "POST", body: { ...input, isbn, clientId }, dedupeKey: `book:add:${clientId}` });
      if (ok) q.refresh();
    } catch { /* ignore */ }
  }, [setData, q]);

  return { ...q, setStatus, moveToTop, remove, add };
}
