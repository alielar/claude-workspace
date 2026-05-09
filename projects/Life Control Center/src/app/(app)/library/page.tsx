/**
 * /library — Reading library page.
 * Shows the 12-book roadmap with status, monthly targets, and progress.
 * Books can be uploaded as PDFs for reading in-app.
 */

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { books } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { BookOpen, Download } from "lucide-react";
import UploadButton from "@/components/library/UploadButton";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const STATUS_CONFIG = {
  not_started: { label: "Not started",  color: "var(--text-muted)",     bg: "rgba(255,255,255,0.05)" },
  reading:     { label: "Reading",       color: "var(--accent-bright)", bg: "var(--accent-dim)" },
  finished:    { label: "Finished",      color: "var(--green)",          bg: "rgba(74,222,128,0.1)" },
};

export default async function LibraryPage() {
  const session = await auth();
  const userId = session!.user!.id!;

  const allBooks = await db
    .select()
    .from(books)
    .where(eq(books.userId, userId))
    .orderBy(books.sortOrder);

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  const finished = allBooks.filter((b) => b.status === "finished").length;
  const reading  = allBooks.filter((b) => b.status === "reading").length;

  return (
    <div className="page-enter p-5 md:p-10 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Library
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            {finished} finished · {reading} reading · {allBooks.length} total
          </p>
        </div>
        <div
          className="text-sm px-3 py-1.5 rounded-xl font-medium"
          style={{ background: "var(--accent-dim)", color: "var(--accent-bright)" }}
        >
          12 books · 2026
        </div>
      </div>

      {/* Progress bar */}
      <div className="glass rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            Year progress
          </span>
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            {finished}/{allBooks.length} books
          </span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${allBooks.length > 0 ? (finished / allBooks.length) * 100 : 0}%`,
              background: "var(--library-color)",
            }}
          />
        </div>
      </div>

      {/* Book grid */}
      {allBooks.length === 0 ? (
        <div className="glass rounded-2xl p-10 flex flex-col items-center gap-4">
          <BookOpen size={40} style={{ color: "var(--text-muted)" }} />
          <p style={{ color: "var(--text-secondary)" }}>No books yet.</p>
          <form action="/api/library/seed" method="POST">
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: "var(--library-color)", color: "#fff" }}
            >
              Load 2026 Reading List
            </button>
          </form>
        </div>
      ) : (
        <div className="space-y-3">
          {allBooks.map((book) => {
            const status = STATUS_CONFIG[book.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.not_started;
            const isCurrentMonth =
              book.targetMonth === currentMonth && book.targetYear === currentYear;
            const isPast =
              book.targetYear! < currentYear ||
              (book.targetYear === currentYear && book.targetMonth! < currentMonth);

            return (
              <div
                key={book.id}
                className="glass rounded-xl p-4 flex items-center justify-between"
                style={isCurrentMonth ? { borderColor: "var(--library-color)", borderWidth: "1px" } : {}}
              >
                <div className="flex items-center gap-4">
                  {/* Month badge */}
                  <div
                    className="w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0"
                    style={{
                      background: isCurrentMonth ? "rgba(167,139,250,0.15)" : "var(--bg-elevated)",
                    }}
                  >
                    <span
                      className="text-[10px] font-semibold uppercase"
                      style={{ color: isCurrentMonth ? "var(--library-color)" : "var(--text-muted)" }}
                    >
                      {MONTH_NAMES[(book.targetMonth ?? 1) - 1]}
                    </span>
                    <span
                      className="text-lg font-bold leading-none"
                      style={{ color: isCurrentMonth ? "var(--library-color)" : "var(--text-secondary)" }}
                    >
                      {book.sortOrder}
                    </span>
                  </div>

                  {/* Book info */}
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                        {book.title}
                      </p>
                      {isCurrentMonth && (
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                          style={{ background: "rgba(167,139,250,0.2)", color: "var(--library-color)" }}
                        >
                          THIS MONTH
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {book.author} · {book.topic}
                    </p>
                    {/* Status badge */}
                    <span
                      className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full mt-1.5"
                      style={{ background: status.bg, color: status.color }}
                    >
                      {status.label}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {book.isPublicDomain && book.publicDomainUrl && (
                    <a
                      href={book.publicDomainUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg transition-all"
                      title="Free download (public domain)"
                      style={{ background: "rgba(74,222,128,0.1)", color: "var(--green)" }}
                    >
                      <Download size={14} />
                    </a>
                  )}

                  {book.pdfKey ? (
                    <Link
                      href={`/library/read/${book.id}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                      style={{ background: "var(--library-color)", color: "#fff" }}
                    >
                      <BookOpen size={12} /> Read
                    </Link>
                  ) : (
                    <UploadButton bookId={book.id} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
