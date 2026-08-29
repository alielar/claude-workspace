"use client";

/**
 * /library — Reading library. Client component for full interactivity.
 *
 * Layout: 1fr / 340px
 *   Left:  Year progress bar (real reading periods) + book list
 *   Right: Reading habit stats + Add book form
 *
 * Books have no monthly assignments — they're a free-form library.
 * The year bar shows when each book was actually started/finished.
 */

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import UploadButton from "@/components/library/UploadButton";

// ─── Types ────────────────────────────────────────────────────────────────────

type Book = {
  id: number;
  title: string;
  author: string;
  topic: string | null;
  status: "not_started" | "reading" | "finished";
  totalPages: number | null;
  pdfKey: string | null;
  sortOrder: number;
  startedAt: number | null;
  finishedAt: number | null;
  currentPage: number;
  progressPct: number;
  annotationCount: number;
};

type Session = {
  id: number;
  bookId: number;
  title: string;
  durationMinutes: number;
  date: string;
  startedAt: number;
};

type HabitData = {
  thisMonthMinutes: number;
  thisMonthSessions: number;
  streak: number;
  recentSessions: Session[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_ABBRS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// One color palette per book, cycling
const COVER_PALETTES = [
  ["#7B2D8B","#4A1060"],
  ["#1B4E7A","#0D2840"],
  ["#2D6A4F","#1B3A2D"],
  ["#7A3B1E","#3D1A0A"],
  ["#4A3D8F","#261F50"],
  ["#7A1C3B","#40091E"],
  ["#1C5A6A","#0A2D38"],
  ["#5C4A1E","#2D2209"],
  ["#3B1C5A","#1A0A30"],
  ["#1A4A2D","#0A2018"],
  ["#5A3B1C","#2D1A09"],
  ["#1C3B5A","#0A1E2D"],
];

function fmtDuration(min: number) {
  return min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`;
}

// ─── Year progress bar ────────────────────────────────────────────────────────
// Each of the 12 month slots is coloured based on whether any book was
// actively being read during that month (startedAt → finishedAt or now).

function buildYearSegments(books: Book[], year: number): ("done" | "reading" | "current" | "empty")[] {
  const now = new Date();
  const currentMonth = now.getMonth(); // 0-indexed

  return Array.from({ length: 12 }, (_, mo) => {
    const slotStart = new Date(year, mo, 1).getTime();
    const slotEnd   = new Date(year, mo + 1, 0, 23, 59, 59).getTime();

    // Does any book overlap this month's slot?
    const match = books.find((b) => {
      if (!b.startedAt) return false;
      const end = b.finishedAt ?? (b.status === "reading" ? Date.now() : b.startedAt);
      return b.startedAt <= slotEnd && end >= slotStart;
    });

    if (!match) return "empty";
    if (match.status === "finished") return "done";
    if (mo === currentMonth) return "current";
    return "reading";
  });
}

// ─── Add-book form ────────────────────────────────────────────────────────────

function AddBookForm({ onAdded }: { onAdded: () => void }) {
  const [title,  setTitle]  = useState("");
  const [author, setAuthor] = useState("");
  const [topic,  setTopic]  = useState("");
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !author.trim()) { setErr("Title and author are required."); return; }
    setSaving(true); setErr("");
    const res = await fetch("/api/library/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, author, topic }),
    });
    if (res.ok) { setTitle(""); setAuthor(""); setTopic(""); onAdded(); }
    else { const j = await res.json().catch(() => ({})); setErr(j.error ?? "Failed to add book."); }
    setSaving(false);
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {[
        { label: "Title",         val: title,  set: setTitle,  ph: "e.g. Sapiens" },
        { label: "Author",        val: author, set: setAuthor, ph: "e.g. Yuval Noah Harari" },
        { label: "Genre / topic", val: topic,  set: setTopic,  ph: "e.g. History" },
      ].map(({ label, val, set, ph }) => (
        <div key={label}>
          <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 5 }}>{label}</div>
          <input
            value={val}
            onChange={(e) => set(e.target.value)}
            placeholder={ph}
            style={{
              width: "100%", boxSizing: "border-box",
              background: "var(--bg-input)", border: "1px solid var(--line)",
              borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "var(--ink)",
              outline: "none", fontFamily: "var(--f-sans)",
            }}
          />
        </div>
      ))}
      {err && <div style={{ fontSize: 11.5, color: "var(--neg)" }}>{err}</div>}
      <button
        type="submit"
        className="cc-btn cc-btn-primary"
        style={{ width: "100%", justifyContent: "center", fontSize: 13 }}
        disabled={saving}
      >
        {saving ? "Adding…" : "Add book"}
      </button>
    </form>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LibraryPage({ embedded = false }: { embedded?: boolean }) {
  const [books,      setBooks]      = useState<Book[]>([]);
  const [habit,      setHabit]      = useState<HabitData | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [addingBook, setAddingBook] = useState(false);
  const [statusLoading, setStatusLoading] = useState<number | null>(null); // bookId being updated

  const now          = new Date();
  const currentYear  = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed
  const finished     = books.filter((b) => b.status === "finished").length;
  const reading      = books.filter((b) => b.status === "reading").length;

  const loadBooks = useCallback(async () => {
    const res = await fetch("/api/library/books").catch(() => null);
    if (res?.ok) setBooks(await res.json());
    setLoading(false);
  }, []);

  const loadHabit = useCallback(async () => {
    const res = await fetch("/api/library/sessions").catch(() => null);
    if (!res?.ok) return;
    const data = await res.json();

    const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(now);
    const thisMonthPrefix = todayStr.substring(0, 7);
    const monthSessions: Session[] = (data.sessions ?? []).filter((s: Session) => s.date?.startsWith(thisMonthPrefix));
    const thisMonthMinutes = monthSessions.reduce((sum: number, s: Session) => sum + s.durationMinutes, 0);

    setHabit({
      thisMonthMinutes,
      thisMonthSessions: monthSessions.length,
      streak: data.streak ?? 0,
      recentSessions: (data.sessions ?? []).slice(0, 5),
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadBooks(); loadHabit(); }, [loadBooks, loadHabit]);

  async function updateStatus(bookId: number, status: Book["status"]) {
    setStatusLoading(bookId);
    const res = await fetch(`/api/library/books/${bookId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) await loadBooks();
    setStatusLoading(null);
  }

  const segments = buildYearSegments(books, currentYear);

  return (
    <div style={{ padding: "0 0 40px" }}>

      {/* ── Page title ────────────────────────────────────────────────── */}
      <div className="cc-pagetitle" style={{ marginBottom: 20, justifyContent: embedded ? "flex-end" : undefined }}>
        {!embedded && (
          <div>
            <h1>Library<span className="grad-text">.</span></h1>
            <div className="sub">
              {books.length} book{books.length !== 1 ? "s" : ""} · {currentYear} reading journal
            </div>
          </div>
        )}
        <button
          className="cc-btn cc-btn-primary"
          style={{ fontSize: 12 }}
          onClick={() => setAddingBook((v) => !v)}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          {addingBook ? "Cancel" : "Add book"}
        </button>
      </div>

      {/* Add book panel — slides in under the header */}
      {addingBook && (
        <div className="cc-card" style={{ marginBottom: 14, padding: "20px 24px" }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)", marginBottom: 16 }}>New book</div>
          <AddBookForm onAdded={() => { setAddingBook(false); loadBooks(); }} />
        </div>
      )}

      {/* ── Main grid ─────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 14 }}>

        {/* ── LEFT ──────────────────────────────────────────────────────── */}
        <div>

          {/* Year progress card */}
          <div className="cc-card" style={{
            marginBottom: 14, padding: "24px 28px",
            background: "radial-gradient(60% 80% at 0% 0%, rgba(124,77,255,0.12), transparent 60%), var(--bg-card)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24 }}>
              <div>
                <div style={{ fontSize: 11, letterSpacing: "0.20em", textTransform: "uppercase", color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "99px", background: "var(--cyan)", boxShadow: "0 0 6px var(--cyan)", display: "inline-block" }} />
                  {currentYear} progress
                </div>
                <div style={{ fontSize: 56, fontWeight: 200, letterSpacing: "-0.04em", lineHeight: 1, background: "var(--grad)", WebkitBackgroundClip: "text", color: "transparent", filter: "drop-shadow(0 0 18px rgba(124,77,255,0.20))", marginTop: 6 }}>
                  {finished}<span style={{ fontSize: 24, WebkitTextFillColor: "var(--ink-3)" }}> /{books.length} books finished</span>
                </div>
              </div>
              <div style={{ fontSize: 13, color: "var(--ink-2)", textAlign: "right", letterSpacing: "0.01em" }}>
                {reading > 0 && <div><b style={{ color: "var(--ink)" }}>{reading} reading</b> · in progress</div>}
                {books.length - finished - reading > 0 && (
                  <div style={{ marginTop: 4 }}><b style={{ color: "var(--ink)" }}>{books.length - finished - reading}</b> · not started</div>
                )}
              </div>
            </div>

            {/* Year bar — highlights actual reading periods */}
            <div style={{ height: 8, background: "rgba(255,255,255,0.04)", borderRadius: 99, overflow: "hidden", marginTop: 18, display: "flex", gap: 1 }}>
              {segments.map((state, i) => (
                <div key={i} style={{
                  flex: 1, height: "100%",
                  background:
                    state === "done"    ? "var(--grad)" :
                    state === "reading" ? "linear-gradient(90deg, rgba(124,77,255,0.50), rgba(100,255,218,0.20))" :
                    state === "current" ? "rgba(100,255,218,0.35)" :
                    "rgba(255,255,255,0.025)",
                  boxShadow:
                    state === "done"    ? "0 0 6px rgba(124,77,255,0.40)" :
                    state === "current" ? "0 0 8px rgba(100,255,218,0.30)" : "none",
                  border: state === "current" ? "1px dashed rgba(100,255,218,0.50)" : "none",
                  borderRadius: 1,
                }} />
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, color: "var(--ink-4)", letterSpacing: "0.10em", marginTop: 6, fontFamily: "var(--f-mono)" }}>
              {MONTH_ABBRS.map((m, i) => (
                <span key={m} style={{ color: i === currentMonth ? "var(--cyan)" : "var(--ink-4)" }}>{m}</span>
              ))}
            </div>
          </div>

          {/* Book list */}
          <div className="cc-card">
            <div className="cc-card-head">
              <div className="title">Your books</div>
              <div className="tail">{books.length} total</div>
            </div>

            {loading && (
              <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>—</div>
            )}

            {!loading && books.length === 0 && (
              <div style={{ padding: "32px 16px", textAlign: "center" }}>
                <div style={{ fontSize: 13, color: "var(--ink-2)", marginBottom: 16 }}>No books yet. Add your first one above.</div>
              </div>
            )}

            {books.map((book, idx) => {
              const isReading    = book.status === "reading";
              const isFinished   = book.status === "finished";
              const isNotStarted = book.status === "not_started";
              const palette      = COVER_PALETTES[idx % COVER_PALETTES.length];
              const busy         = statusLoading === book.id;

              return (
                <div
                  key={book.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "62px 1fr 160px 200px",
                    gap: 16,
                    alignItems: "center",
                    padding: "16px 18px",
                    border: `1px solid ${isReading ? "rgba(124,77,255,0.30)" : "var(--line)"}`,
                    borderRadius: 12,
                    background: isReading
                      ? "radial-gradient(60% 80% at 0% 0%, rgba(124,77,255,0.10), transparent 60%), rgba(255,255,255,0.025)"
                      : "rgba(255,255,255,0.012)",
                    marginBottom: 8,
                    position: "relative",
                    boxShadow: isReading ? "0 0 24px rgba(124,77,255,0.10)" : "none",
                    opacity: isNotStarted ? 0.85 : 1,
                  }}
                >
                  {/* Reading indicator accent */}
                  {isReading && (
                    <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 2, background: "var(--grad)", borderRadius: "2px 0 0 2px", boxShadow: "0 0 10px rgba(124,77,255,0.50)" }} />
                  )}

                  {/* Cover */}
                  <div style={{
                    width: 54, height: 78, borderRadius: 4, overflow: "hidden",
                    background: `linear-gradient(160deg, ${palette[0]}, ${palette[1]})`,
                    position: "relative", flexShrink: 0,
                    opacity: isNotStarted ? 0.55 : 1,
                    boxShadow: isReading ? "0 0 16px rgba(124,77,255,0.20)" : "0 4px 12px rgba(0,0,0,0.40)",
                  }}>
                    <div style={{ position: "absolute", inset: 6, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                      <div style={{ fontSize: 7.5, color: "rgba(255,255,255,0.75)", lineHeight: 1.15, fontWeight: 500 }}>
                        {book.title.substring(0, 20)}
                      </div>
                      <div style={{ fontSize: 6.5, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                        {book.author.split(" ").slice(-1)[0]}
                      </div>
                    </div>
                  </div>

                  {/* Info */}
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 500, letterSpacing: "-0.005em", lineHeight: 1.25, color: isNotStarted ? "var(--ink-2)" : "var(--ink)" }}>
                      {book.title}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 3 }}>{book.author}</div>
                    {book.topic && (
                      <span style={{ display: "inline-block", marginTop: 8, padding: "2px 8px", fontSize: 9.5, letterSpacing: "0.10em", textTransform: "uppercase", border: "1px solid var(--line)", borderRadius: 99, color: "var(--ink-3)", fontWeight: 500 }}>
                        {book.topic}
                      </span>
                    )}
                  </div>

                  {/* Status */}
                  <div>
                    <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600, marginBottom: 5 }}>Status</div>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: isFinished ? "var(--pos)" : isReading ? "var(--cyan)" : "var(--ink-3)" }}>
                      {isFinished ? "Finished" : isReading ? `Reading · ${book.progressPct}%` : "Not started"}
                    </div>
                    {isReading && (
                      <>
                        <div style={{ height: 2, width: "100%", background: "var(--line)", marginTop: 6, borderRadius: 99, overflow: "hidden" }}>
                          <div style={{ height: "100%", background: "var(--grad)", width: `${book.progressPct}%` }} />
                        </div>
                        <div style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, color: "var(--ink-3)", marginTop: 4, letterSpacing: "0.04em" }}>
                          p. {book.currentPage} / {book.totalPages ?? "?"}
                        </div>
                      </>
                    )}
                    {isFinished && book.startedAt && book.finishedAt && (
                      <div style={{ fontSize: 10.5, color: "var(--ink-4)", marginTop: 4, fontFamily: "var(--f-mono)" }}>
                        {MONTH_NAMES[new Date(book.startedAt).getMonth()]} → {MONTH_NAMES[new Date(book.finishedAt).getMonth()]}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                    {book.pdfKey ? (
                      <>
                        {/* Open in reader */}
                        <Link
                          href={`/library/read/${book.id}`}
                          className="cc-btn cc-btn-primary"
                          style={{ padding: "8px 14px", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                          {isReading ? "Resume" : isFinished ? "Review" : "Open"}
                        </Link>

                        {/* Start / Finish / Reset status */}
                        {isNotStarted && (
                          <button
                            className="cc-btn"
                            style={{ fontSize: 11.5, padding: "6px 12px" }}
                            disabled={busy}
                            onClick={() => updateStatus(book.id, "reading")}
                          >
                            {busy ? "…" : "Start reading"}
                          </button>
                        )}
                        {isReading && (
                          <button
                            className="cc-btn"
                            style={{ fontSize: 11.5, padding: "6px 12px", color: "var(--pos)", borderColor: "rgba(111,212,154,0.30)" }}
                            disabled={busy}
                            onClick={() => updateStatus(book.id, "finished")}
                          >
                            {busy ? "…" : "Mark finished"}
                          </button>
                        )}
                        {book.annotationCount > 0 && (
                          <div style={{ fontSize: 10.5, color: "var(--ink-4)", fontFamily: "var(--f-mono)" }}>
                            {book.annotationCount} note{book.annotationCount !== 1 ? "s" : ""}
                          </div>
                        )}
                      </>
                    ) : (
                      /* No PDF yet — show upload button */
                      <>
                        {isNotStarted && (
                          <button
                            className="cc-btn"
                            style={{ fontSize: 11.5, padding: "6px 12px" }}
                            disabled={busy}
                            onClick={() => updateStatus(book.id, "reading")}
                          >
                            {busy ? "…" : "Start reading"}
                          </button>
                        )}
                        {isReading && (
                          <button
                            className="cc-btn"
                            style={{ fontSize: 11.5, padding: "6px 12px", color: "var(--pos)", borderColor: "rgba(111,212,154,0.30)" }}
                            disabled={busy}
                            onClick={() => updateStatus(book.id, "finished")}
                          >
                            {busy ? "…" : "Mark finished"}
                          </button>
                        )}
                        <UploadButton bookId={book.id} onDone={loadBooks} />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── RIGHT ─────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Reading habit card */}
          <div className="cc-card">
            <div className="cc-card-head">
              <div className="title">Reading habit</div>
              <div className="tail">{MONTH_NAMES[currentMonth]}</div>
            </div>
            <div style={{ padding: "14px 16px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, borderBottom: "1px solid var(--line)", paddingBottom: 14 }}>
                <div style={{ paddingRight: 12, borderRight: "1px solid var(--line)" }}>
                  <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)" }}>This month</div>
                  <div style={{ fontSize: 22, marginTop: 4, fontWeight: 300, letterSpacing: "-0.02em" }}>
                    {habit ? (habit.thisMonthMinutes > 0 ? fmtDuration(habit.thisMonthMinutes) : "—") : "—"}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 2, fontFamily: "var(--f-mono)" }}>
                    {habit ? `${habit.thisMonthSessions} session${habit.thisMonthSessions !== 1 ? "s" : ""}` : "—"}
                  </div>
                </div>
                <div style={{ paddingLeft: 12 }}>
                  <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)" }}>Days streak</div>
                  <div style={{ fontSize: 22, marginTop: 4, fontWeight: 300, letterSpacing: "-0.02em" }}>
                    {habit?.streak ?? "—"} <span style={{ color: "var(--ink-3)", fontSize: 12 }}>days</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: (habit?.streak ?? 0) >= 7 ? "var(--pos)" : "var(--ink-3)", marginTop: 2, fontFamily: "var(--f-mono)" }}>
                    {(habit?.streak ?? 0) >= 7 ? "on a roll" : "keep going"}
                  </div>
                </div>
              </div>
              <div style={{ paddingTop: 14 }}>
                <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 10 }}>Recent sessions</div>
                {!habit || habit.recentSessions.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--ink-4)" }}>No sessions yet. Open a book to start reading.</div>
                ) : (
                  habit.recentSessions.map((s, i, arr) => {
                    const dayLabel = new Date(s.startedAt).toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
                    return (
                      <div key={s.id} style={{ padding: "9px 0", borderBottom: i < arr.length - 1 ? "1px solid var(--line)" : "none", fontSize: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "68%" }}>{s.title}</span>
                          <span style={{ fontFamily: "var(--f-mono)", color: "var(--ink-3)", fontSize: 11, letterSpacing: "0.04em" }}>{fmtDuration(s.durationMinutes)}</span>
                        </div>
                        <div style={{ fontSize: 10.5, color: "var(--ink-4)", marginTop: 2, fontFamily: "var(--f-mono)" }}>{dayLabel}</div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Quick-add shortcut card */}
          <div className="cc-card">
            <div className="cc-card-head">
              <div className="title">Add a book</div>
            </div>
            <div style={{ padding: "14px 16px" }}>
              <AddBookForm onAdded={loadBooks} />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
