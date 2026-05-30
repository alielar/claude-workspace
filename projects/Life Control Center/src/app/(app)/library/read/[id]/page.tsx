"use client";

/**
 * /library/read/[id] — In-app PDF reader. V2 Ambient Futurism.
 *
 * Features:
 *   - react-pdf renderer with text layer enabled
 *   - Text selection popup → one-click "Add to Word Bank"
 *   - Highlights panel (annotations + quick word lookup)
 *   - Reading session tracking: auto-saves on back/close (sendBeacon)
 *   - Session timer shown in bottom bar
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { ensureMigrate } from "@/lib/ensureMigrate";
import { Document, Page, pdfjs } from "react-pdf";
import { useParams, useRouter } from "next/navigation";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

// ─── Types ────────────────────────────────────────────────────────────────────

type BookMeta   = { id: number; title: string; author: string; totalPages: number | null };
type Annotation = { id: number; pageNumber: number; selectedText: string; note: string | null; color: string };
type WordResult = { word: string; definition: string; etymology?: string; exampleSentence?: string };

// ─── Text-selection popup ────────────────────────────────────────────────────

function SelectionPopup({ text, position, onAddToBank, onBookmark, onDismiss }: {
  text: string;
  position: { x: number; y: number };
  onAddToBank: (word: string) => void;
  onBookmark: (text: string) => void;
  onDismiss: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        left: position.x,
        top: position.y - 52,
        transform: "translateX(-50%)",
        zIndex: 200,
        background: "rgba(12,12,22,0.97)",
        border: "1px solid var(--line-hi)",
        borderRadius: 10,
        padding: "8px 12px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.60), 0 0 24px rgba(124,77,255,0.15)",
        backdropFilter: "blur(20px)",
        display: "flex",
        alignItems: "center",
        gap: 8,
        animation: "fadeInUp 0.12s ease",
        whiteSpace: "nowrap",
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <span style={{ fontSize: 12, color: "var(--ink-2)", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>
        &ldquo;{text}&rdquo;
      </span>
      <button
        onClick={() => { onAddToBank(text); onDismiss(); }}
        className="cc-btn-primary"
        style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", borderRadius: 7, padding: "5px 10px", cursor: "pointer", flexShrink: 0 }}
      >
        + Word Bank
      </button>
      <button
        onClick={() => { onBookmark(text); onDismiss(); }}
        style={{
          fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
          borderRadius: 7, padding: "5px 10px", cursor: "pointer", flexShrink: 0,
          background: "rgba(255,183,77,0.15)", border: "1px solid rgba(255,183,77,0.35)", color: "#FFB74D",
        }}
        title="Mark where you stopped"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 3, verticalAlign: "middle" }}><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        Stop here
      </button>
      <button
        onClick={onDismiss}
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-4)", padding: 2, display: "flex" }}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  );
}

// ─── Highlights panel ─────────────────────────────────────────────────────────

type ReadingNote = { id: number; content: string; pageNumber: number | null; createdAt: string };

function HighlightsPanel({ annotations, onGoToPage, onDelete, bookId, currentPage, onClose, notes, setNotes }: {
  annotations: Annotation[];
  onGoToPage: (p: number) => void;
  onDelete: (id: number) => void;
  bookId: number;
  currentPage: number;
  onClose: () => void;
  notes: ReadingNote[];
  setNotes: React.Dispatch<React.SetStateAction<ReadingNote[]>>;
}) {
  const [tab, setTab]         = useState<"highlights" | "lookup" | "notes">("highlights");
  const [query, setQuery]     = useState("");
  const [result, setResult]   = useState<WordResult | null>(null);
  const [lookLoading, setLL]  = useState(false);
  const [saved, setSaved]     = useState(false);

  // Notes state
  const [noteText, setNoteText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);

  const saveNote = async () => {
    if (!noteText.trim()) return;
    setNoteSaving(true);
    try {
      const res = await fetch("/api/library/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId, pageNumber: currentPage, content: noteText.trim() }),
      });
      if (res.ok) {
        const note = await res.json();
        setNotes((prev) => [note, ...prev]);
        setNoteText("");
      }
    } catch { /* ignore */ }
    setNoteSaving(false);
  };

  const deleteNote = async (noteId: number) => {
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    try {
      await fetch(`/api/library/notes?id=${noteId}`, { method: "DELETE" });
    } catch {
      // Rollback on failure — refetch
      fetch(`/api/library/notes?bookId=${bookId}`).then((r) => r.json()).then(setNotes).catch(() => {});
    }
  };

  const lookup = async () => {
    if (!query.trim()) return;
    setLL(true); setSaved(false); setResult(null);
    const res = await fetch("/api/library/word-lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word: query.trim(), bookId }),
    });
    setResult(await res.json());
    setLL(false);
  };

  const saveToBank = async () => {
    if (!result) return;
    await fetch("/api/library/word-lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word: query.trim(), bookId, saveToWordBank: true }),
    });
    setSaved(true);
  };

  return (
    <div style={{
      borderLeft: "1px solid var(--line)",
      background: "rgba(10,10,20,0.60)",
      backdropFilter: "blur(20px)",
      padding: "20px",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h3 style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--violet)", boxShadow: "0 0 5px var(--violet)", display: "inline-block" }} />
          Highlights
        </h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--ink-4)", letterSpacing: "0.06em" }}>{annotations.length}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-4)", display: "flex", padding: 4 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 14, flexWrap: "wrap" }}>
        {([
          { key: "highlights" as const, label: `Highlights ${annotations.length}` },
          { key: "notes" as const, label: `Notes ${notes.length}` },
          { key: "lookup" as const, label: "Word Lookup" },
        ]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: "4px 10px", fontSize: 10.5, border: "1px solid var(--line)", borderRadius: 99,
              color: tab === key ? "var(--violet)" : "var(--ink-3)",
              background: tab === key ? "rgba(124,77,255,0.10)" : "transparent",
              borderColor: tab === key ? "rgba(124,77,255,0.30)" : "var(--line)",
              cursor: "pointer", letterSpacing: "0.04em",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Highlights list */}
      {tab === "highlights" && (
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {annotations.length === 0 && (
            <div style={{ padding: "32px 0", textAlign: "center", color: "var(--ink-4)", fontSize: 12 }}>
              No highlights yet.<br />Select text in the PDF to highlight.
            </div>
          )}
          {annotations.map((a) => (
            <div key={a.id} style={{ padding: "11px 14px", border: "1px solid var(--line)", borderRadius: 10, background: "rgba(255,255,255,0.012)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                <span style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--cyan)", letterSpacing: "0.06em" }}>p. {a.pageNumber}</span>
                <button onClick={() => onDelete(a.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-4)", display: "flex", padding: 2 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div style={{
                fontFamily: "EB Garamond, Georgia, serif", fontSize: 13, fontStyle: "italic",
                color: "var(--ink-2)", paddingLeft: 10,
                borderLeft: "1.5px solid rgba(124,77,255,0.40)", lineHeight: 1.5,
              }}>
                &ldquo;{a.selectedText}&rdquo;
              </div>
              {a.note && <div style={{ fontSize: 11.5, color: "var(--ink)", marginTop: 6, lineHeight: 1.5 }}>{a.note}</div>}
              <button onClick={() => onGoToPage(a.pageNumber)} style={{ fontSize: 10.5, color: "var(--violet)", marginTop: 6, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                Go to page
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Notes */}
      {tab === "notes" && (
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {/* New note input */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 6 }}>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="What did you learn? Jot it down..."
              rows={3}
              style={{
                width: "100%", padding: "10px 12px", fontSize: 12.5, lineHeight: 1.5,
                background: "var(--bg-input)", border: "1px solid var(--line)", borderRadius: 10,
                color: "var(--ink)", resize: "vertical", fontFamily: "inherit",
              }}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveNote(); }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 10, color: "var(--ink-5)", fontFamily: "var(--f-mono)" }}>p.{currentPage} · ⌘Enter to save</span>
              <button className="cc-btn cc-btn-primary" onClick={saveNote} disabled={noteSaving || !noteText.trim()} style={{ padding: "5px 12px", fontSize: 11 }}>
                {noteSaving ? "Saving…" : "Save note"}
              </button>
            </div>
          </div>

          {notes.length === 0 && (
            <div style={{ padding: "24px 0", textAlign: "center", color: "var(--ink-4)", fontSize: 12 }}>
              No notes yet. Write down what you&apos;re learning — it&apos;ll come back for review later.
            </div>
          )}

          {notes.map((n) => (
            <div key={n.id} style={{ padding: "10px 14px", border: "1px solid var(--line)", borderRadius: 10, background: "rgba(255,255,255,0.012)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--cyan)", letterSpacing: "0.06em" }}>
                  {n.pageNumber ? `p. ${n.pageNumber}` : "—"}
                </span>
                <button onClick={() => deleteNote(n.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-4)", display: "flex", padding: 2 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.55 }}>{n.content}</div>
            </div>
          ))}
        </div>
      )}

      {/* Word lookup */}
      {tab === "lookup" && (
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="cc-input"
              style={{ flex: 1 }}
              placeholder="Enter a word…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && lookup()}
            />
            <button className="cc-btn cc-btn-primary" onClick={lookup} disabled={lookLoading} style={{ padding: "8px 14px" }}>
              {lookLoading ? "…" : "Go"}
            </button>
          </div>
          {result && (
            <div style={{ padding: 14, border: "1px solid var(--line)", borderRadius: 10, background: "rgba(255,255,255,0.015)" }}>
              <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.01em", marginBottom: 8 }}>{result.word}</div>
              <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--ink-2)" }}>{result.definition}</div>
              {result.exampleSentence && (
                <div style={{ fontSize: 12, fontStyle: "italic", color: "var(--ink-3)", marginTop: 10 }}>&ldquo;{result.exampleSentence}&rdquo;</div>
              )}
              {result.etymology && (
                <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 6 }}>Origin: {result.etymology}</div>
              )}
              {saved ? (
                <div style={{ fontSize: 12, color: "var(--pos)", marginTop: 10 }}>✓ Saved to Word Bank</div>
              ) : (
                <button className="cc-btn" onClick={saveToBank} style={{ marginTop: 10 }}>
                  + Add to Word Bank
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Reader ──────────────────────────────────────────────────────────────

export default function ReadPage() {
  const params  = useParams<{ id: string }>();
  const router  = useRouter();
  const bookId  = Number(params.id);

  const [book, setBook]         = useState<BookMeta | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setPage]  = useState(1);
  const [panelOpen, setPanel]   = useState(false);
  const [annotations, setAnnot] = useState<Annotation[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(700);

  // Zoom (persisted per book)
  const [zoom, setZoom] = useState(1.0);
  useEffect(() => {
    const saved = localStorage.getItem(`reader-zoom-${bookId}`);
    if (saved) setZoom(parseFloat(saved));
  }, [bookId]);
  const changeZoom = (delta: number) => {
    setZoom((z) => {
      const next = Math.round(Math.max(0.5, Math.min(2.0, z + delta)) * 10) / 10;
      localStorage.setItem(`reader-zoom-${bookId}`, String(next));
      return next;
    });
  };

  // Night mode (persisted globally)
  const [nightMode, setNightMode] = useState(false);
  useEffect(() => {
    setNightMode(localStorage.getItem("reader-night-mode") === "true");
  }, []);
  const toggleNight = () => {
    setNightMode((v) => { localStorage.setItem("reader-night-mode", String(!v)); return !v; });
  };

  // Session tracking
  const sessionStartRef  = useRef<Date>(new Date());
  const sessionStartPage = useRef<number>(1);
  const sessionMinRef    = useRef<number>(0);
  const [sessionMin, setSessionMin] = useState(0);

  // Text selection popup
  const [selection, setSelection] = useState<{ text: string; x: number; y: number } | null>(null);
  const [addedWords, setAddedWords] = useState<Set<string>>(new Set());

  // Bookmark — marks exact position where user stopped reading
  const [bookmark, setBookmark] = useState<{ text: string; page: number } | null>(null);

  // Notes state (lifted to parent so modal can access)
  const [notes, setNotes] = useState<ReadingNote[]>([]);
  useEffect(() => {
    fetch(`/api/library/notes?bookId=${bookId}`).then((r) => r.json()).then(setNotes).catch(() => {});
  }, [bookId]);

  // Session-end notes modal
  const [showEndModal, setShowEndModal] = useState(false);
  const [endNoteText, setEndNoteText] = useState("");
  const [endNoteSaving, setEndNoteSaving] = useState(false);

  // Container width
  useEffect(() => {
    const measure = () => { if (containerRef.current) setCw(containerRef.current.clientWidth); };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Session timer
  useEffect(() => {
    const t = setInterval(() => {
      setSessionMin((m) => { sessionMinRef.current = m + 1; return m + 1; });
    }, 60000);
    return () => clearInterval(t);
  }, []);

  // Load book + annotations + run migration
  useEffect(() => {
    ensureMigrate();
    fetch(`/api/library/book/${bookId}`).then((r) => r.json()).then((data) => {
      setBook(data.book);
      const p = data.currentPage ?? 1;
      setPage(p);
      sessionStartPage.current = p;
      if (data.bookmarkText && data.bookmarkPage) {
        setBookmark({ text: data.bookmarkText, page: data.bookmarkPage });
      }
    });
    fetch(`/api/library/annotations?bookId=${bookId}`).then((r) => r.json()).then(setAnnot);
  }, [bookId]);

  // Save session on back/close
  const saveSession = useCallback(() => {
    const minutes = sessionMinRef.current;
    if (minutes < 1) return;
    const body = JSON.stringify({
      bookId,
      startPage: sessionStartPage.current,
      endPage: currentPage,
      durationMinutes: minutes,
    });
    // sendBeacon for reliability on unload
    navigator.sendBeacon("/api/library/sessions", new Blob([body], { type: "application/json" }));
  }, [bookId, currentPage]);

  useEffect(() => {
    window.addEventListener("beforeunload", saveSession);
    return () => window.removeEventListener("beforeunload", saveSession);
  }, [saveSession]);

  // Text selection handler
  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      // Small delay so selection is finalized
      setTimeout(() => {
        const sel = window.getSelection();
        const text = sel?.toString().trim() ?? "";
        if (text.length < 2 || text.length > 80) { setSelection(null); return; }
        // Only pop up if selection is within the PDF container
        if (!containerRef.current?.contains(e.target as Node)) { setSelection(null); return; }
        setSelection({ text, x: e.clientX, y: e.clientY });
      }, 50);
    };
    const handleMouseDown = () => setSelection(null);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, []);

  // Add selected word to word bank
  const [wordToast, setWordToast] = useState<{ text: string; ok: boolean } | null>(null);
  const addToWordBank = async (word: string) => {
    setAddedWords((prev) => new Set([...prev, word]));
    try {
      const res = await fetch("/api/wordbank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word, bookId }),
      });
      if (!res.ok) throw new Error();
      setWordToast({ text: `"${word}" saved`, ok: true });
    } catch {
      setAddedWords((prev) => { const next = new Set(prev); next.delete(word); return next; });
      setWordToast({ text: `Failed to save "${word}"`, ok: false });
    }
    setTimeout(() => setWordToast(null), 2500);
  };

  // Save bookmark position
  const saveBookmark = (text: string) => {
    const bm = { text: text.slice(0, 120), page: currentPage };
    setBookmark(bm);
    fetch("/api/library/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId, currentPage, bookmarkText: bm.text, bookmarkPage: bm.page }),
    });
  };

  // Debounced page save
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePage = useCallback((p: number) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch("/api/library/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId, currentPage: p }),
      });
    }, 600);
  }, [bookId]);

  const goToPage = (p: number) => {
    const clamped = Math.max(1, Math.min(p, numPages));
    setPage(clamped);
    savePage(clamped);
  };

  // Keyboard navigation + zoom shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      // Zoom: Cmd/Ctrl + / -
      if ((e.metaKey || e.ctrlKey) && (e.key === "=" || e.key === "+")) { e.preventDefault(); changeZoom(0.1); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === "-") { e.preventDefault(); changeZoom(-0.1); return; }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") goToPage(currentPage + 1);
      if (e.key === "ArrowLeft"  || e.key === "ArrowUp")  goToPage(currentPage - 1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [currentPage, numPages]);

  const deleteAnnot = async (id: number) => {
    await fetch(`/api/library/annotations?id=${id}`, { method: "DELETE" });
    setAnnot((prev) => prev.filter((a) => a.id !== id));
  };

  const handleBack = () => {
    const minutes = sessionMinRef.current;
    if (minutes >= 1) {
      // Show session-end modal to capture notes
      setShowEndModal(true);
    } else {
      router.back();
    }
  };

  const finishSession = async (withNote?: boolean) => {
    if (withNote && endNoteText.trim()) {
      setEndNoteSaving(true);
      try {
        const res = await fetch("/api/library/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookId, pageNumber: currentPage, content: endNoteText.trim() }),
        });
        if (res.ok) {
          const note = await res.json();
          setNotes((prev) => [note, ...prev]);
        }
      } catch { /* ignore */ }
      setEndNoteSaving(false);
    }
    saveSession();
    router.back();
  };

  const progressPct = numPages > 0 ? Math.round((currentPage / numPages) * 100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "linear-gradient(180deg, #08080F, #04040A)", overflow: "hidden" }}>

      {/* ── Top bar ───────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", borderBottom: "1px solid var(--line)", background: "rgba(10,10,20,0.55)", backdropFilter: "blur(12px)", zIndex: 5, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="cc-btn cc-btn-icon" onClick={handleBack}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div style={{ fontSize: 13.5, fontWeight: 500, letterSpacing: "-0.005em" }}>
            {book?.title ?? "Loading…"}
            <span style={{ color: "var(--ink-3)", fontWeight: 400, marginLeft: 6 }}>{book?.author}</span>
          </div>
          <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--ink-3)", padding: "4px 9px", border: "1px solid var(--line)", borderRadius: 99, letterSpacing: "0.06em" }}>
            p. <b style={{ color: "var(--ink)" }}>{currentPage}</b> / {numPages || "?"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Zoom controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 2, marginRight: 4 }}>
            <button className="cc-btn cc-btn-icon" onClick={() => changeZoom(-0.1)} disabled={zoom <= 0.5} title="Zoom out" style={{ width: 28, height: 28, padding: 0 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <span style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--ink-3)", minWidth: 32, textAlign: "center", letterSpacing: "0.04em" }}>{Math.round(zoom * 100)}%</span>
            <button className="cc-btn cc-btn-icon" onClick={() => changeZoom(0.1)} disabled={zoom >= 2.0} title="Zoom in" style={{ width: 28, height: 28, padding: 0 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>
          {/* Night mode */}
          <button
            className="cc-btn cc-btn-icon"
            onClick={toggleNight}
            style={{ background: nightMode ? "rgba(255,183,77,0.12)" : undefined, borderColor: nightMode ? "rgba(255,183,77,0.30)" : undefined, width: 30, height: 30, padding: 0 }}
            title="Night reading filter"
          >
            {nightMode ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFB74D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            )}
          </button>
          {/* Highlights panel */}
          <button
            className="cc-btn cc-btn-icon"
            onClick={() => setPanel((v) => !v)}
            style={{ background: panelOpen ? "rgba(124,77,255,0.12)" : undefined, borderColor: panelOpen ? "rgba(124,77,255,0.30)" : undefined }}
            title="Highlights panel"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            {annotations.length > 0 && (
              <span style={{ position: "absolute", top: 4, right: 4, width: 5, height: 5, background: "var(--violet)", borderRadius: "50%", boxShadow: "0 0 5px var(--violet)" }} />
            )}
          </button>
        </div>
      </div>

      {/* ── Progress strip ────────────────────────────────────────── */}
      <div style={{ height: 2, background: "transparent", flexShrink: 0 }}>
        <div style={{ height: "100%", background: "var(--grad)", width: `${progressPct}%`, boxShadow: "0 0 8px rgba(124,77,255,0.4)", transition: "width 300ms" }} />
      </div>

      {/* ── Body: pdf area + optional panel ──────────────────────── */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: panelOpen ? "1fr 320px" : "1fr", minHeight: 0 }}>

        {/* PDF area */}
        <div
          ref={containerRef}
          style={{ position: "relative", overflowY: "auto", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "16px 20px", background: "linear-gradient(180deg, #0A0A14, #060609)", minHeight: 0 }}
        >
          {/* Bookmark banner — shows when on the bookmarked page */}
          {bookmark && bookmark.page === currentPage && (
            <div style={{
              position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", zIndex: 10,
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 14px", borderRadius: 99,
              background: "rgba(255,183,77,0.12)", border: "1px solid rgba(255,183,77,0.30)",
              backdropFilter: "blur(12px)",
              animation: "fadeInUp 0.2s ease",
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="#FFB74D" stroke="#FFB74D" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
              <span style={{ fontSize: 11, color: "#FFB74D", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                You stopped here: &ldquo;{bookmark.text.slice(0, 50)}{bookmark.text.length > 50 ? "…" : ""}&rdquo;
              </span>
            </div>
          )}

          <Document
            file={`/api/library/pdf/${bookId}`}
            onLoadSuccess={({ numPages: n }) => setNumPages(n)}
            loading={<div style={{ color: "var(--ink-4)", marginTop: 80, fontSize: 13, textAlign: "center" }}>Loading PDF…</div>}
            error={<div style={{ color: "var(--neg)", marginTop: 80, fontSize: 13, textAlign: "center" }}>Failed to load PDF.</div>}
          >
            <Page
              pageNumber={currentPage}
              width={Math.min(cw - 40, 560) * zoom}
              renderTextLayer
              renderAnnotationLayer
            />
          </Document>
        </div>

        {/* Highlights panel */}
        {panelOpen && (
          <HighlightsPanel
            annotations={annotations}
            onGoToPage={goToPage}
            onDelete={deleteAnnot}
            bookId={bookId}
            currentPage={currentPage}
            onClose={() => setPanel(false)}
            notes={notes}
            setNotes={setNotes}
          />
        )}
      </div>

      {/* ── Bottom bar ───────────────────────────────────────────── */}
      <div style={{ padding: "8px 16px", borderTop: "1px solid var(--line)", background: "rgba(10,10,20,0.65)", backdropFilter: "blur(20px)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, zIndex: 5 }}>
        {/* Page nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="cc-btn cc-btn-icon" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <input
            type="number" min={1} max={numPages} value={currentPage}
            onChange={(e) => goToPage(Number(e.target.value))}
            style={{ width: 52, padding: "4px 8px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--bg-input)", fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--ink)", textAlign: "center" }}
          />
          <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.04em" }}>/ {numPages || "?"}</span>
          <button className="cc-btn cc-btn-icon" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= numPages}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>

        {/* Bookmark indicator */}
        {bookmark && (
          <button
            onClick={() => goToPage(bookmark.page)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "4px 10px", borderRadius: 8,
              background: bookmark.page === currentPage ? "rgba(255,183,77,0.12)" : "rgba(255,183,77,0.06)",
              border: "1px solid rgba(255,183,77,0.25)",
              cursor: "pointer", transition: "all 0.15s",
            }}
            title={`Bookmarked: "${bookmark.text}"`}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="#FFB74D" stroke="#FFB74D" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            <span style={{ fontSize: 10, color: "#FFB74D", fontFamily: "var(--f-mono)", letterSpacing: "0.04em" }}>
              p.{bookmark.page}
            </span>
          </button>
        )}

        {/* Session info */}
        <div style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.04em", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--pos)", boxShadow: "0 0 5px var(--pos)", display: "inline-block" }} />
          Session {sessionMin > 0 ? `${sessionMin}m` : "< 1m"} · auto-saved
          {addedWords.size > 0 && (
            <span style={{ color: "var(--violet)", marginLeft: 4 }}>· {addedWords.size} word{addedWords.size > 1 ? "s" : ""} added</span>
          )}
          {wordToast && (
            <span style={{ color: wordToast.ok ? "var(--pos)" : "var(--neg)", marginLeft: 4, animation: "fadeInUp 0.15s ease" }}>
              · {wordToast.text}
            </span>
          )}
        </div>

        {/* Progress */}
        <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.06em" }}>
          {progressPct}%
        </div>
      </div>

      {/* Night reading filter overlay */}
      {nightMode && (
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(40, 20, 0, 0.35)",
          mixBlendMode: "multiply",
          pointerEvents: "none",
          zIndex: 100,
          transition: "opacity 0.3s ease",
        }} />
      )}

      {/* Floating notes button — quick access when panel is closed */}
      {!panelOpen && (
        <button
          onClick={() => { setPanel(true); }}
          title="Session notes"
          style={{
            position: "fixed", bottom: 70, right: 24, zIndex: 30,
            width: 44, height: 44, borderRadius: 12,
            background: "rgba(124,77,255,0.18)", border: "1px solid rgba(124,77,255,0.35)",
            color: "#E8E8F0", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 20px rgba(0,0,0,0.4), 0 0 16px rgba(124,77,255,0.15)",
            backdropFilter: "blur(12px)",
            transition: "all 0.15s",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          {notes.length > 0 && (
            <span style={{
              position: "absolute", top: -4, right: -4,
              width: 18, height: 18, borderRadius: "50%",
              background: "var(--violet)", color: "#fff",
              fontSize: 10, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 0 6px var(--violet)",
            }}>{notes.length}</span>
          )}
        </button>
      )}

      {/* Session-end notes modal */}
      {showEndModal && (
        <>
          <div
            onClick={() => { setShowEndModal(false); finishSession(); }}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, backdropFilter: "blur(4px)" }}
          />
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 201,
            width: "min(480px, 90vw)", background: "#0d0d16", border: "1px solid var(--line-hi)",
            borderRadius: 16, padding: "28px 28px 20px", boxShadow: "0 16px 64px rgba(0,0,0,0.6), 0 0 32px rgba(124,77,255,0.1)",
          }}>
            {/* Session summary */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: "rgba(124,77,255,0.15)", border: "1px solid rgba(124,77,255,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--violet)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>Session complete</div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", fontFamily: "var(--f-mono)", letterSpacing: "0.04em" }}>
                  {sessionMin}m · p.{sessionStartPage.current}–{currentPage} · {book?.title}
                </div>
              </div>
            </div>

            {/* Note input */}
            <div style={{ marginBottom: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", letterSpacing: "0.02em", marginBottom: 8, display: "block" }}>
                What did you learn or find interesting?
              </label>
              <textarea
                value={endNoteText}
                onChange={(e) => setEndNoteText(e.target.value)}
                placeholder="Key ideas, quotes, things to remember..."
                rows={4}
                autoFocus
                style={{
                  width: "100%", padding: "12px 14px", fontSize: 13, lineHeight: 1.55,
                  background: "var(--bg-input)", border: "1px solid var(--line-hi)", borderRadius: 10,
                  color: "var(--ink)", resize: "vertical", fontFamily: "inherit",
                }}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) finishSession(true); }}
              />
              <div style={{ fontSize: 10, color: "var(--ink-5)", fontFamily: "var(--f-mono)", marginTop: 4 }}>
                This note will appear in your Word Bank for spaced-repetition review · ⌘Enter to save & close
              </div>
            </div>

            {/* Existing notes from this session */}
            {notes.length > 0 && (
              <div style={{ marginTop: 12, marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: "var(--ink-4)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
                  Notes from this book ({notes.length})
                </div>
                <div style={{ maxHeight: 120, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                  {notes.slice(0, 5).map((n) => (
                    <div key={n.id} style={{ fontSize: 11.5, color: "var(--ink-3)", padding: "6px 10px", background: "rgba(255,255,255,0.02)", borderRadius: 6, lineHeight: 1.4 }}>
                      {n.pageNumber && <span style={{ fontFamily: "var(--f-mono)", fontSize: 9.5, color: "var(--cyan)", marginRight: 6 }}>p.{n.pageNumber}</span>}
                      {n.content.length > 100 ? n.content.slice(0, 100) + "…" : n.content}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button
                onClick={() => finishSession()}
                style={{
                  padding: "9px 18px", borderRadius: 8, fontSize: 12,
                  background: "transparent", border: "1px solid var(--line)",
                  color: "var(--ink-3)", cursor: "pointer",
                }}
              >
                Skip
              </button>
              <button
                className="cc-btn-primary"
                onClick={() => finishSession(true)}
                disabled={endNoteSaving || !endNoteText.trim()}
                style={{ padding: "9px 20px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              >
                {endNoteSaving ? "Saving…" : "Save note & close"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Text selection popup */}
      {selection && (
        <SelectionPopup
          text={selection.text}
          position={{ x: selection.x, y: selection.y }}
          onAddToBank={addToWordBank}
          onBookmark={saveBookmark}
          onDismiss={() => setSelection(null)}
        />
      )}

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateX(-50%) translateY(6px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}
