"use client";

/**
 * /knowledge — Knowledge Bank. Notes saved from reading sessions.
 * Browsable, searchable reference material. No SRS review.
 */

import { useEffect, useState } from "react";

type Note = {
  id: number;
  bookId: number | null;
  pageNumber: number | null;
  content: string;
  createdAt: number;
  bookTitle: string | null;
};

export default function KnowledgeBankPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

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
      <div className="cc-pagetitle" style={{ marginBottom: 24 }}>
        <div>
          <h1>Knowledge <span className="grad-text">Bank</span>.</h1>
          <div className="sub">
            {notes.length} note{notes.length !== 1 ? "s" : ""} from your reading
          </div>
        </div>
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
    </div>
  );
}
