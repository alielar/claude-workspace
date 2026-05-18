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

function SelectionPopup({ text, position, onAddToBank, onDismiss }: {
  text: string;
  position: { x: number; y: number };
  onAddToBank: (word: string) => void;
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
        boxShadow: "0 8px 32px rgba(0,0,0,0.60), 0 0 24px rgba(179,136,255,0.15)",
        backdropFilter: "blur(20px)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        animation: "fadeInUp 0.12s ease",
        whiteSpace: "nowrap",
      }}
      onMouseDown={(e) => e.preventDefault()} // prevent selection loss
    >
      <span style={{ fontSize: 12, color: "var(--ink-2)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>
        &ldquo;{text}&rdquo;
      </span>
      <button
        onClick={() => { onAddToBank(text); onDismiss(); }}
        style={{
          fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
          color: "#0A0A14", background: "var(--grad)",
          border: "none", borderRadius: 7, padding: "5px 10px",
          cursor: "pointer", flexShrink: 0,
        }}
      >
        + Word Bank
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

function HighlightsPanel({ annotations, onGoToPage, onDelete, bookId, onClose }: {
  annotations: Annotation[];
  onGoToPage: (p: number) => void;
  onDelete: (id: number) => void;
  bookId: number;
  onClose: () => void;
}) {
  const [tab, setTab]         = useState<"highlights" | "lookup">("highlights");
  const [query, setQuery]     = useState("");
  const [result, setResult]   = useState<WordResult | null>(null);
  const [lookLoading, setLL]  = useState(false);
  const [saved, setSaved]     = useState(false);

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
      <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
        {(["highlights","lookup"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "4px 10px", fontSize: 10.5, border: "1px solid var(--line)", borderRadius: 99,
              color: tab === t ? "var(--violet)" : "var(--ink-3)",
              background: tab === t ? "rgba(179,136,255,0.10)" : "transparent",
              borderColor: tab === t ? "rgba(179,136,255,0.30)" : "var(--line)",
              cursor: "pointer", textTransform: "capitalize", letterSpacing: "0.04em",
            }}
          >
            {t === "highlights" ? `Highlights ${annotations.length}` : "Word Lookup"}
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
                borderLeft: "1.5px solid rgba(179,136,255,0.40)", lineHeight: 1.5,
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

  // Session tracking
  const sessionStartRef  = useRef<Date>(new Date());
  const sessionStartPage = useRef<number>(1);
  const sessionMinRef    = useRef<number>(0);
  const [sessionMin, setSessionMin] = useState(0);

  // Text selection popup
  const [selection, setSelection] = useState<{ text: string; x: number; y: number } | null>(null);
  const [addedWords, setAddedWords] = useState<Set<string>>(new Set());

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
    fetch("/api/admin/migrate", { method: "POST" });
    fetch(`/api/library/book/${bookId}`).then((r) => r.json()).then((data) => {
      setBook(data.book);
      const p = data.currentPage ?? 1;
      setPage(p);
      sessionStartPage.current = p;
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
  const addToWordBank = async (word: string) => {
    setAddedWords((prev) => new Set([...prev, word]));
    await fetch("/api/wordbank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word, bookId }),
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

  // Keyboard navigation
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
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
    saveSession();
    router.back();
  };

  const progressPct = numPages > 0 ? Math.round((currentPage / numPages) * 100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "linear-gradient(180deg, #08080F, #04040A)", overflow: "hidden" }}>

      {/* ── Top bar ───────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: "1px solid var(--line)", background: "rgba(10,10,20,0.55)", backdropFilter: "blur(12px)", zIndex: 5, flexShrink: 0 }}>
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
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            className="cc-btn cc-btn-icon"
            onClick={() => setPanel((v) => !v)}
            style={{ background: panelOpen ? "rgba(179,136,255,0.12)" : undefined, borderColor: panelOpen ? "rgba(179,136,255,0.30)" : undefined }}
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
        <div style={{ height: "100%", background: "var(--grad)", width: `${progressPct}%`, boxShadow: "0 0 8px rgba(179,136,255,0.4)", transition: "width 300ms" }} />
      </div>

      {/* ── Body: pdf area + optional panel ──────────────────────── */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: panelOpen ? "1fr 320px" : "1fr", minHeight: 0 }}>

        {/* PDF area */}
        <div
          ref={containerRef}
          style={{ position: "relative", overflowY: "auto", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "32px 36px", background: "linear-gradient(180deg, #0A0A14, #060609)" }}
        >
          <Document
            file={`/api/library/pdf/${bookId}`}
            onLoadSuccess={({ numPages: n }) => setNumPages(n)}
            loading={<div style={{ color: "var(--ink-4)", marginTop: 80, fontSize: 13, textAlign: "center" }}>Loading PDF…</div>}
            error={<div style={{ color: "var(--neg)", marginTop: 80, fontSize: 13, textAlign: "center" }}>Failed to load PDF.</div>}
          >
            <Page
              pageNumber={currentPage}
              width={Math.min(cw - 72, 560)}
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
            onClose={() => setPanel(false)}
          />
        )}
      </div>

      {/* ── Bottom bar ───────────────────────────────────────────── */}
      <div style={{ padding: "12px 20px", borderTop: "1px solid var(--line)", background: "rgba(10,10,20,0.65)", backdropFilter: "blur(20px)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, zIndex: 5 }}>
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

        {/* Session info */}
        <div style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.04em", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--pos)", boxShadow: "0 0 5px var(--pos)", display: "inline-block" }} />
          Session {sessionMin > 0 ? `${sessionMin}m` : "< 1m"} · auto-saved
          {addedWords.size > 0 && (
            <span style={{ color: "var(--violet)", marginLeft: 4 }}>· {addedWords.size} word{addedWords.size > 1 ? "s" : ""} added</span>
          )}
        </div>

        {/* Progress */}
        <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.06em" }}>
          {progressPct}%
        </div>
      </div>

      {/* Text selection popup */}
      {selection && (
        <SelectionPopup
          text={selection.text}
          position={{ x: selection.x, y: selection.y }}
          onAddToBank={addToWordBank}
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
