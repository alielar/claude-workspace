"use client";

/**
 * /knowledge — Knowledge Bank. Notes saved from reading sessions.
 * Browsable, searchable reference material with SRS review drill.
 */

import { useEffect, useState } from "react";

type Note = {
  id: number;
  bookId: number | null;
  pageNumber: number | null;
  content: string;
  createdAt: number;
  bookTitle: string | null;
  interval: number;
  streak: number;
  nextReviewDate: string;
  masteryStatus: string;
};

function todayMadrid(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}

export default function KnowledgeBankPage({ embedded = false }: { embedded?: boolean }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Review drill state
  const [drillOpen, setDrillOpen] = useState(false);
  const [drillQueue, setDrillQueue] = useState<Note[]>([]);
  const [drillIndex, setDrillIndex] = useState(0);
  const [drillPhase, setDrillPhase] = useState<"question" | "answer">("question");
  const [drillDone, setDrillDone] = useState(false);
  const [grading, setGrading] = useState(false);

  const today = todayMadrid();
  const dueNotes = notes.filter((n) => n.nextReviewDate <= today);

  useEffect(() => {
    fetch("/api/library/notes")
      .then((r) => r.json())
      .then((data) => { setNotes(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const deleteNote = async (id: number) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    try {
      await fetch(`/api/library/notes?id=${id}`, { method: "DELETE" });
    } catch {
      // Refetch on failure
      const res = await fetch("/api/library/notes");
      if (res.ok) setNotes(await res.json());
    }
  };

  const startDrill = () => {
    if (dueNotes.length === 0) return;
    setDrillQueue([...dueNotes]);
    setDrillIndex(0);
    setDrillPhase("question");
    setDrillDone(false);
    setDrillOpen(true);
  };

  const handleGrade = async (btn: "again" | "good" | "easy") => {
    const note = drillQueue[drillIndex];
    if (!note || grading) return;
    setGrading(true);
    try {
      await fetch("/api/library/notes/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId: note.id, button: btn }),
      });
    } catch { /* silent */ }
    setGrading(false);

    if (drillIndex + 1 >= drillQueue.length) {
      setDrillDone(true);
      // Refresh notes to get updated SRS fields
      const res = await fetch("/api/library/notes");
      if (res.ok) setNotes(await res.json());
    } else {
      setDrillIndex((i) => i + 1);
      setDrillPhase("question");
    }
  };

  const closeDrill = () => {
    setDrillOpen(false);
    setDrillDone(false);
  };

  const filtered = search.trim()
    ? notes.filter((n) =>
        n.content.toLowerCase().includes(search.toLowerCase()) ||
        (n.bookTitle ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : notes;

  // Group by book
  const byBook = new Map<string, Note[]>();
  for (const n of filtered) {
    const key = n.bookTitle ?? "General Notes";
    if (!byBook.has(key)) byBook.set(key, []);
    byBook.get(key)!.push(n);
  }

  return (
    <div style={{ padding: "0 0 40px" }}>
      <div className="cc-pagetitle" style={{ marginBottom: 24, justifyContent: embedded ? "flex-end" : undefined }}>
        {!embedded && (
          <div>
            <h1>Knowledge <span className="grad-text">Bank</span>.</h1>
            <div className="sub">
              {notes.length} note{notes.length !== 1 ? "s" : ""} from your reading
            </div>
          </div>
        )}
        {dueNotes.length > 0 && (
          <button className="cc-btn cc-btn-primary" onClick={startDrill} style={{ fontSize: 13, padding: "10px 18px" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            Review {dueNotes.length} note{dueNotes.length !== 1 ? "s" : ""}
          </button>
        )}
      </div>

      {/* Search bar */}
      <div style={{ marginBottom: 20 }}>
        <input
          className="cc-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search notes..."
          style={{ width: "100%", maxWidth: 400, padding: "10px 14px", fontSize: 13 }}
        />
      </div>

      {loading ? (
        <div className="cc-card" style={{ padding: "48px 32px", textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "var(--ink-3)" }}>Loading notes...</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="cc-card" style={{ padding: "48px 32px", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>💡</div>
          <div style={{ fontSize: 14, color: "var(--ink-2)", marginBottom: 6 }}>
            {search ? "No notes match your search" : "No notes yet"}
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-4)" }}>
            {search
              ? "Try a different search term"
              : "Open a book in the Library and save notes while reading — they'll appear here."}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {Array.from(byBook.entries()).map(([bookTitle, bookNotes]) => (
            <div key={bookTitle} className="cc-card" style={{ overflow: "hidden" }}>
              <div className="cc-card-head">
                <div className="title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                  </svg>
                  {bookTitle}
                </div>
                <span style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "var(--f-mono)" }}>
                  {bookNotes.length}
                </span>
              </div>
              <div className="cc-card-body" style={{ padding: 0 }}>
                {bookNotes.map((note, i) => (
                  <div
                    key={note.id}
                    style={{
                      padding: "14px 16px",
                      borderBottom: i < bookNotes.length - 1 ? "1px solid var(--line)" : "none",
                      display: "flex",
                      gap: 12,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.6 }}>
                        {note.content}
                      </div>
                      <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 10, color: "var(--ink-4)", fontFamily: "var(--f-mono)", letterSpacing: "0.04em" }}>
                        {note.pageNumber && <span>p.{note.pageNumber}</span>}
                        <span>{new Date(note.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteNote(note.id)}
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        color: "var(--ink-5)", padding: 4, flexShrink: 0, alignSelf: "flex-start",
                        transition: "color 0.15s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--neg)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--ink-5)")}
                      title="Delete note"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Review Drill Overlay ─────────────────────────────────── */}
      {drillOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 100,
          background: "rgba(6,6,11,0.92)", backdropFilter: "blur(12px)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        }}>
          {/* Close button */}
          <button
            onClick={closeDrill}
            style={{
              position: "absolute", top: 20, right: 24,
              background: "none", border: "1px solid var(--line)", borderRadius: 8,
              color: "var(--ink-3)", cursor: "pointer", padding: "6px 12px",
              fontSize: 11, letterSpacing: "0.04em", transition: "all 0.15s",
            }}
          >
            Close
          </button>

          {drillDone ? (
            /* ── Summary screen ─────────────────────────────────── */
            <div style={{ textAlign: "center", maxWidth: 460, padding: 32 }}>
              <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>&#10003;</div>
              <h2 style={{ fontSize: 24, fontWeight: 400, letterSpacing: "-0.01em", marginBottom: 8 }}>
                Session <span className="grad-text">complete</span>
              </h2>
              <div style={{ fontSize: 14, color: "var(--ink-2)", marginBottom: 6 }}>
                You reviewed {drillQueue.length} note{drillQueue.length !== 1 ? "s" : ""}.
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-4)", marginBottom: 28 }}>
                {dueNotes.length > 0
                  ? `${dueNotes.length} note${dueNotes.length !== 1 ? "s" : ""} still due — some were marked "Again".`
                  : "All caught up! Check back tomorrow."}
              </div>
              <button className="cc-btn cc-btn-primary" onClick={closeDrill} style={{ padding: "12px 28px", fontSize: 14 }}>
                Done
              </button>
            </div>
          ) : (
            /* ── Drill card ────────────────────────────────────── */
            <>
              {/* Progress strip */}
              <div style={{
                position: "absolute", top: 20, left: 24, right: 100,
                display: "flex", alignItems: "center", gap: 14,
              }}>
                <span style={{ fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600, whiteSpace: "nowrap" }}>
                  Review
                </span>
                <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", background: "var(--grad)",
                    boxShadow: "0 0 8px rgba(124,77,255,0.40)",
                    width: `${Math.round(((drillIndex) / drillQueue.length) * 100)}%`,
                    transition: "width 0.3s var(--easeOut)",
                  }} />
                </div>
                <span style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--ink)", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
                  {drillIndex + 1} / {drillQueue.length}
                </span>
              </div>

              {/* Card */}
              {drillQueue[drillIndex] && (() => {
                const note = drillQueue[drillIndex];
                return (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", maxWidth: 640, padding: "0 24px" }}>
                    <div style={{
                      position: "relative", width: "100%", padding: "42px 48px",
                      background: "linear-gradient(180deg, rgba(28,28,46,0.85), rgba(20,20,32,0.85))",
                      border: "1px solid var(--line-hi)", borderRadius: 18,
                      boxShadow: "0 30px 70px rgba(0,0,0,0.45), 0 0 50px rgba(255,183,77,0.06), inset 0 1px 0 rgba(255,255,255,0.05)",
                      backdropFilter: "blur(20px)",
                    }}>
                      {/* Badge */}
                      <div style={{ position: "absolute", top: 20, left: 24, fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--warn)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                        Reading note
                      </div>
                      <div style={{ position: "absolute", top: 20, right: 24, fontSize: 10.5, letterSpacing: "0.06em", color: "var(--ink-4)", fontFamily: "var(--f-mono)" }}>
                        SEEN {note.streak}x
                      </div>

                      {/* Source */}
                      {note.bookTitle && (
                        <div style={{ marginTop: 24, marginBottom: 12, fontSize: 11, color: "var(--ink-4)", fontStyle: "italic" }}>
                          From &ldquo;{note.bookTitle}&rdquo;{note.pageNumber ? ` \u00b7 p.${note.pageNumber}` : ""}
                        </div>
                      )}

                      {/* Note content */}
                      <div style={{
                        fontSize: 17, lineHeight: 1.6, color: "var(--ink)",
                        letterSpacing: "-0.005em", marginTop: note.bookTitle ? 0 : 32,
                      }}>
                        {note.content}
                      </div>

                      {/* Prompt */}
                      {drillPhase === "question" && (
                        <div style={{ marginTop: 24, paddingTop: 18, borderTop: "1px solid var(--line)", textAlign: "center" }}>
                          <div style={{ fontSize: 13, color: "var(--ink-3)", fontStyle: "italic" }}>Do you remember this?</div>
                        </div>
                      )}
                    </div>

                    {/* Reveal button */}
                    {drillPhase === "question" && (
                      <button className="cc-btn" onClick={() => setDrillPhase("answer")} style={{ marginTop: 20, padding: "12px 32px" }}>
                        I remember
                      </button>
                    )}

                    {/* Grading buttons */}
                    {drillPhase === "answer" && (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, width: "100%", marginTop: 20 }}>
                        {([
                          { key: "again" as const, label: "Forgot", sub: "Reset", border: "rgba(255,138,138,0.25)", color: "var(--neg)" },
                          { key: "good"  as const, label: "Remembered", sub: "Good", border: "rgba(100,255,218,0.25)", color: "var(--cyan)" },
                          { key: "easy"  as const, label: "Easy", sub: "Skip ahead", border: "rgba(111,212,154,0.25)", color: "var(--pos)" },
                        ]).map((btn) => (
                          <button
                            key={btn.key}
                            disabled={grading}
                            onClick={() => handleGrade(btn.key)}
                            style={{
                              padding: "14px 16px", borderRadius: 12,
                              border: `1px solid ${btn.border}`,
                              background: "rgba(255,255,255,0.02)",
                              cursor: grading ? "default" : "pointer",
                              opacity: grading ? 0.5 : 1,
                              transition: "all 0.15s var(--easeOut)",
                            }}
                          >
                            <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: "-0.005em", color: btn.color }}>{btn.label}</div>
                            <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 3, fontFamily: "var(--f-mono)", letterSpacing: "0.04em" }}>{btn.sub}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}
    </div>
  );
}
