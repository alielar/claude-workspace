"use client";

/**
 * /books — the waiting list of physical books (spec §4.3).
 *
 *   READING NOW — one book at a time, cover + why I'm reading it, "Finished" button
 *   UP NEXT     — the queue in order; tap a book to see what it covers / what I get out of it,
 *                 then Start reading · Move to top · Remove
 *   FINISHED    — collapsed
 *   + Add a book (title, author, optional ISBN for the cover)
 *
 * Reading itself is a habit on Today ("Read before sleep"); this page is the shelf.
 * Local-first: renders from the phone's copy, works offline, syncs later.
 */

import { useState } from "react";
import Link from "next/link";
import { useBooks } from "@/lib/books/useBooks";
import type { Book } from "@/lib/books/types";

function Cover({ book, width }: { book: Book; width: number }) {
  const [failed, setFailed] = useState(false);
  const h = Math.round(width * 1.5);
  if (!book.coverUrl || failed) {
    return (
      <div aria-hidden style={{ width, height: h, borderRadius: 6, flexShrink: 0, background: "var(--grad-soft)", border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(width / 3) }}>
        📖
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- external cover, plain <img> keeps the bundle small
    <img
      src={book.coverUrl} alt="" width={width} height={h} loading="lazy" decoding="async"
      onError={() => setFailed(true)}
      style={{ width, height: h, objectFit: "cover", borderRadius: 6, flexShrink: 0, background: "var(--fill-2)", boxShadow: "0 2px 8px rgba(0,0,0,0.35)" }}
    />
  );
}

function Detail({ label, text }: { label: string; text: string | null }) {
  if (!text) return null;
  return (
    <div>
      <div style={{ fontSize: 10.5, fontFamily: "var(--f-mono)", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 4 }}>{label}</div>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "var(--ink-2)" }}>{text}</p>
    </div>
  );
}

function meta(b: Book): string {
  return [b.year, b.pages ? `${b.pages} pages` : null].filter(Boolean).join(" · ");
}

export default function BooksPage() {
  const { data, loading, stale, setStatus, moveToTop, remove, add } = useBooks();
  const books = data?.books ?? [];
  const reading = books.find((b) => b.status === "reading") ?? null;
  const queue = books.filter((b) => b.status === "queue");
  const finished = books.filter((b) => b.status === "finished");
  const [openId, setOpenId] = useState<number | null>(null);
  const [showFinished, setShowFinished] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", author: "", isbn: "" });

  const submit = async () => {
    if (!form.title.trim()) return;
    await add(form);
    setForm({ title: "", author: "", isbn: "" });
    setAdding(false);
  };

  return (
    <div style={{ display: "grid", gap: 18, maxWidth: 560 }}>
      <div className="cc-pagetitle" style={{ marginBottom: 0 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600 }}>Books</h1>
          <div className="sub">
            {queue.length ? `${queue.length} waiting` : "the waiting list"}{finished.length ? ` · ${finished.length} finished` : ""}
            {stale ? " · showing saved copy" : ""}
          </div>
        </div>
        <button className="cc-btn cc-btn-primary" onClick={() => setAdding(true)} style={{ minHeight: 44, borderRadius: 12 }}>+ Add</button>
      </div>

      {/* Reading now */}
      <section className="cc-card">
        <div className="cc-card-head">
          <span className="title">Reading now</span>
          <span className="tail">{reading?.startedAt ? `since ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(reading.startedAt)}` : "one at a time"}</span>
        </div>
        <div className="cc-card-body">
          {loading && !data && <div className="cc-skeleton" style={{ height: 96 }} />}
          {data && !reading && (
            <div style={{ fontSize: 14, color: "var(--ink-3)", lineHeight: 1.5 }}>
              Nothing open. Pick the next one below and tap <strong style={{ color: "var(--ink-2)" }}>Start reading</strong>.
            </div>
          )}
          {reading && (
            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "84px 1fr", gap: 14, alignItems: "start" }}>
                <Cover book={reading} width={84} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.25, letterSpacing: "-0.01em" }}>{reading.title}</div>
                  {reading.subtitle && <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 2, lineHeight: 1.4 }}>{reading.subtitle}</div>}
                  <div style={{ fontSize: 13.5, color: "var(--ink-2)", marginTop: 6 }}>{reading.author}</div>
                  {meta(reading) && <div style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 2, fontFamily: "var(--f-mono)" }}>{meta(reading)}</div>}
                </div>
              </div>
              <Detail label="What I'll get out of it" text={reading.payoff} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
                <button className="cc-btn cc-btn-primary" onClick={() => setStatus(reading, "finished")} style={{ minHeight: 48, borderRadius: 12, fontSize: 15 }}>Finished ✓</button>
                <button className="cc-btn cc-btn-ghost" onClick={() => setStatus(reading, "queue")} style={{ minHeight: 48, borderRadius: 12 }}>Back to list</button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Queue */}
      <section className="cc-card">
        <div className="cc-card-head"><span className="title">Up next</span><span className="tail">tap a book for details</span></div>
        <div style={{ padding: "0 14px" }}>
          {loading && !data && [0, 1, 2].map((i) => <div key={i} className="cc-skeleton" style={{ height: 72, margin: "10px 0" }} />)}
          {data && queue.length === 0 && <div style={{ padding: "16px 0", fontSize: 14, color: "var(--ink-3)" }}>The list is empty. Add a book above.</div>}
          {queue.map((b, i) => {
            const open = openId === b.id;
            return (
              <div key={b.id} style={{ borderBottom: i < queue.length - 1 ? "1px solid var(--line)" : "none" }}>
                <button
                  onClick={() => setOpenId(open ? null : b.id)}
                  aria-expanded={open}
                  style={{ display: "grid", gridTemplateColumns: "48px 1fr auto", gap: 14, alignItems: "center", width: "100%", minHeight: 88, padding: "10px 2px", background: "transparent", border: "none", color: "inherit", font: "inherit", textAlign: "left", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
                >
                  <Cover book={b} width={48} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 15.5, fontWeight: 500, lineHeight: 1.3 }}>{b.title}</span>
                    <span style={{ display: "block", fontSize: 13, color: "var(--ink-3)", marginTop: 2 }}>{b.author}</span>
                  </span>
                  <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--ink-4)" }}>{String(i + 1).padStart(2, "0")}</span>
                </button>
                {open && (
                  <div style={{ display: "grid", gap: 12, padding: "2px 2px 16px" }}>
                    {b.subtitle && <div style={{ fontSize: 13.5, color: "var(--ink-2)", fontStyle: "italic" }}>{b.subtitle}</div>}
                    <Detail label="What it covers" text={b.covers} />
                    <Detail label="What I'll get out of it" text={b.payoff} />
                    {meta(b) && <div style={{ fontSize: 12, color: "var(--ink-4)", fontFamily: "var(--f-mono)" }}>{meta(b)}{b.isbn ? ` · ISBN ${b.isbn}` : ""}</div>}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8 }}>
                      <button className="cc-btn cc-btn-primary" onClick={() => { setStatus(b, "reading"); setOpenId(null); }} style={{ minHeight: 46, borderRadius: 12, fontSize: 15 }}>▶ Start reading</button>
                      {i > 0 && <button className="cc-btn cc-btn-ghost" onClick={() => moveToTop(b)} style={{ minHeight: 46, borderRadius: 12 }}>↑ Top</button>}
                      <button className="cc-btn cc-btn-ghost" onClick={() => { if (confirm(`Remove "${b.title}" from the list?`)) remove(b); }} style={{ minHeight: 46, minWidth: 46, borderRadius: 12, padding: 0, color: "var(--neg)" }} aria-label="Remove">✕</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Finished */}
      {finished.length > 0 && (
        <section className="cc-card">
          <button onClick={() => setShowFinished((v) => !v)} className="cc-card-head" style={{ width: "100%", background: "transparent", border: "none", borderBottom: showFinished ? undefined : "none", color: "inherit", font: "inherit", cursor: "pointer", textAlign: "left" }}>
            <span className="title">Finished</span><span className="tail">{finished.length} {showFinished ? "▴" : "▾"}</span>
          </button>
          {showFinished && (
            <div style={{ padding: "0 14px" }}>
              {finished.map((b, i) => (
                <div key={b.id} style={{ display: "grid", gridTemplateColumns: "36px 1fr auto", gap: 12, alignItems: "center", minHeight: 60, padding: "8px 2px", borderBottom: i < finished.length - 1 ? "1px solid var(--line)" : "none", opacity: 0.8 }}>
                  <Cover book={b} width={36} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 14.5, fontWeight: 500 }}>{b.title}</span>
                    <span style={{ display: "block", fontSize: 12.5, color: "var(--ink-3)" }}>{b.author}{b.finishedAt ? ` · ${new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(b.finishedAt)}` : ""}</span>
                  </span>
                  <button className="cc-btn cc-btn-ghost" onClick={() => setStatus(b, "queue")} style={{ minHeight: 40, borderRadius: 10, fontSize: 12 }}>Re-read</button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <div style={{ display: "flex", gap: 16, fontSize: 13, color: "var(--ink-4)" }}>
        <Link href="/today" style={{ color: "var(--ink-3)", textDecoration: "none" }}>← Today</Link>
        <Link href="/library" style={{ color: "var(--ink-4)", textDecoration: "none" }}>Old library & notes (archive) →</Link>
      </div>

      {/* Add sheet */}
      {adding && (
        <>
          <div onClick={() => setAdding(false)} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.5)" }} />
          <div role="dialog" aria-label="Add a book" style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 71, background: "var(--bg-chrome)", borderTop: "1px solid var(--line-hi)", borderRadius: "20px 20px 0 0", padding: "16px 20px calc(env(safe-area-inset-bottom) + 16px)", display: "grid", gap: 10, maxWidth: 560, margin: "0 auto" }}>
            <div style={{ fontSize: 17, fontWeight: 600 }}>Add a book</div>
            <input className="cc-input" placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus style={{ fontSize: 16, minHeight: 48 }} />
            <input className="cc-input" placeholder="Author" value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} style={{ fontSize: 16, minHeight: 48 }} />
            <input className="cc-input" placeholder="ISBN (optional — fetches the cover)" inputMode="numeric" value={form.isbn} onChange={(e) => setForm({ ...form, isbn: e.target.value })} style={{ fontSize: 16, minHeight: 48 }} />
            <div style={{ fontSize: 12, color: "var(--ink-4)" }}>The 13-digit number above the barcode on the back of the book.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, marginTop: 4 }}>
              <button className="cc-btn cc-btn-primary" onClick={submit} disabled={!form.title.trim()} style={{ minHeight: 52, borderRadius: 14, fontSize: 16 }}>Add to list</button>
              <button className="cc-btn cc-btn-ghost" onClick={() => setAdding(false)} style={{ minHeight: 52, borderRadius: 14 }}>Cancel</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
