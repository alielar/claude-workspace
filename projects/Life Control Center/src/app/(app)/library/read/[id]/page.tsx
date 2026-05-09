"use client";

/**
 * /library/read/[id] — In-app PDF reader.
 *
 * Features:
 * - react-pdf viewer (full-screen, mobile-friendly)
 * - Page navigation with keyboard and buttons
 * - Auto-saves last page read every time you turn a page
 * - Annotations panel (slide-in from right)
 * - Word lookup: type a word → Claude returns definition, save to Word Bank
 * - Reading progress bar (current / total pages)
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  BookMarked,
  Search,
  X,
  Plus,
  Bookmark,
  List,
} from "lucide-react";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Use local worker bundled with react-pdf
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

// ─── Types ────────────────────────────────────────────────────────────────────

type BookMeta = {
  id: number;
  title: string;
  author: string;
  totalPages: number | null;
};

type Annotation = {
  id: number;
  pageNumber: number;
  selectedText: string;
  note: string | null;
  color: string;
};

type WordLookupResult = {
  word: string;
  definition: string;
  etymology?: string;
  exampleSentence?: string;
};

// ─── Word Lookup Panel ────────────────────────────────────────────────────────

function WordLookupPanel({
  bookId,
  onClose,
}: {
  bookId: number;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<WordLookupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const lookup = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSaved(false);
    setResult(null);
    const res = await fetch("/api/library/word-lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word: query.trim(), bookId }),
    });
    const data = await res.json();
    setResult(data);
    setLoading(false);
  };

  const saveToWordBank = async () => {
    if (!result) return;
    await fetch("/api/library/word-lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word: query.trim(), bookId, saveToWordBank: true }),
    });
    setSaved(true);
  };

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 300 }}
      className="fixed right-0 top-0 h-full w-80 z-50 flex flex-col"
      style={{ background: "var(--bg-elevated)", borderLeft: "1px solid var(--glass-border)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid var(--glass-border)" }}>
        <div className="flex items-center gap-2">
          <Search size={16} style={{ color: "var(--library-color)" }} />
          <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
            Word Lookup
          </span>
        </div>
        <button onClick={onClose}>
          <X size={18} style={{ color: "var(--text-muted)" }} />
        </button>
      </div>

      <div className="p-4 flex flex-col gap-3 flex-1 overflow-y-auto">
        {/* Search input */}
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-xl px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--bg-base)",
              color: "var(--text-primary)",
              border: "1px solid var(--glass-border)",
            }}
            placeholder="Enter a word…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && lookup()}
          />
          <button
            onClick={lookup}
            disabled={loading}
            className="px-3 py-2 rounded-xl text-sm font-semibold"
            style={{ background: "var(--library-color)", color: "#fff", opacity: loading ? 0.6 : 1 }}
          >
            {loading ? "…" : "Go"}
          </button>
        </div>

        {/* Result */}
        {result && (
          <div className="glass rounded-xl p-4 space-y-3">
            <p className="font-bold text-lg" style={{ color: "var(--text-primary)" }}>
              {result.word}
            </p>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {result.definition}
            </p>
            {result.exampleSentence && (
              <p className="text-sm italic" style={{ color: "var(--text-muted)" }}>
                "{result.exampleSentence}"
              </p>
            )}
            {result.etymology && (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Origin: {result.etymology}
              </p>
            )}

            {saved ? (
              <p className="text-xs font-medium" style={{ color: "var(--green)" }}>
                ✓ Saved to Word Bank
              </p>
            ) : (
              <button
                onClick={saveToWordBank}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
                style={{ background: "rgba(244,114,182,0.15)", color: "var(--wordbank-color)" }}
              >
                <BookMarked size={12} /> Save to Word Bank
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Annotations Panel ────────────────────────────────────────────────────────

function AnnotationsPanel({
  bookId,
  annotations,
  onGoToPage,
  onDelete,
  onClose,
}: {
  bookId: number;
  annotations: Annotation[];
  onGoToPage: (page: number) => void;
  onDelete: (id: number) => void;
  onClose: () => void;
}) {
  const COLOR_MAP: Record<string, string> = {
    yellow: "#fbbf24",
    blue: "#60a5fa",
    green: "#4ade80",
    red: "#f87171",
  };

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 300 }}
      className="fixed right-0 top-0 h-full w-80 z-50 flex flex-col"
      style={{ background: "var(--bg-elevated)", borderLeft: "1px solid var(--glass-border)" }}
    >
      <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid var(--glass-border)" }}>
        <div className="flex items-center gap-2">
          <List size={16} style={{ color: "var(--library-color)" }} />
          <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
            Annotations ({annotations.length})
          </span>
        </div>
        <button onClick={onClose}>
          <X size={18} style={{ color: "var(--text-muted)" }} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {annotations.length === 0 && (
          <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>
            No annotations yet. Select text in the reader to add one.
          </p>
        )}
        {annotations.map((a) => (
          <div key={a.id} className="glass rounded-xl p-3 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <p
                className="text-sm italic leading-snug"
                style={{ color: COLOR_MAP[a.color] ?? "#fbbf24", borderLeft: `3px solid ${COLOR_MAP[a.color] ?? "#fbbf24"}`, paddingLeft: "8px" }}
              >
                "{a.selectedText}"
              </p>
              <button
                onClick={() => onDelete(a.id)}
                className="shrink-0 mt-0.5"
              >
                <X size={12} style={{ color: "var(--text-muted)" }} />
              </button>
            </div>
            {a.note && (
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {a.note}
              </p>
            )}
            <button
              onClick={() => onGoToPage(a.pageNumber)}
              className="text-[10px] font-medium"
              style={{ color: "var(--library-color)" }}
            >
              p. {a.pageNumber}
            </button>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Main Reader ──────────────────────────────────────────────────────────────

export default function ReadPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const bookId = Number(params.id);

  const [book, setBook] = useState<BookMeta | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const [panel, setPanel] = useState<"none" | "lookup" | "annotations">("none");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Measure container width for responsive PDF rendering
  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Load book metadata and initial page
  useEffect(() => {
    fetch(`/api/library/book/${bookId}`)
      .then((r) => r.json())
      .then((data) => {
        setBook(data.book);
        setCurrentPage(data.currentPage ?? 1);
      });

    fetch(`/api/library/annotations?bookId=${bookId}`)
      .then((r) => r.json())
      .then(setAnnotations);
  }, [bookId]);

  // Auto-save page on every page change (debounced)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePage = useCallback(
    (page: number) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        fetch("/api/library/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookId, currentPage: page }),
        });
      }, 600);
    },
    [bookId]
  );

  const goToPage = (page: number) => {
    const p = Math.max(1, Math.min(page, numPages));
    setCurrentPage(p);
    savePage(p);
  };

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") goToPage(currentPage + 1);
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") goToPage(currentPage - 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentPage, numPages]);

  const deleteAnnotation = async (id: number) => {
    await fetch(`/api/library/annotations?id=${id}`, { method: "DELETE" });
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  };

  const progressPct = numPages > 0 ? Math.round((currentPage / numPages) * 100) : 0;

  return (
    <div className="flex flex-col h-screen" style={{ background: "var(--bg-base)" }}>
      {/* ── Top bar ── */}
      <div
        className="flex items-center gap-3 px-4 py-3 shrink-0"
        style={{ background: "var(--bg-elevated)", borderBottom: "1px solid var(--glass-border)" }}
      >
        <button onClick={() => router.back()} className="p-1.5 rounded-lg" style={{ background: "var(--bg-base)" }}>
          <ChevronLeft size={18} style={{ color: "var(--text-muted)" }} />
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
            {book?.title ?? "Loading…"}
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {book?.author}
          </p>
        </div>

        {/* Page input */}
        <div className="flex items-center gap-1.5 text-sm" style={{ color: "var(--text-muted)" }}>
          <input
            type="number"
            min={1}
            max={numPages}
            value={currentPage}
            onChange={(e) => goToPage(Number(e.target.value))}
            className="w-12 text-center rounded-lg py-1 outline-none"
            style={{
              background: "var(--bg-base)",
              color: "var(--text-primary)",
              border: "1px solid var(--glass-border)",
            }}
          />
          <span>/ {numPages}</span>
        </div>

        {/* Panel toggles */}
        <button
          onClick={() => setPanel((p) => (p === "lookup" ? "none" : "lookup"))}
          className="p-1.5 rounded-lg transition-all"
          style={{
            background: panel === "lookup" ? "rgba(167,139,250,0.2)" : "var(--bg-base)",
            color: panel === "lookup" ? "var(--library-color)" : "var(--text-muted)",
          }}
          title="Word lookup"
        >
          <Search size={16} />
        </button>
        <button
          onClick={() => setPanel((p) => (p === "annotations" ? "none" : "annotations"))}
          className="p-1.5 rounded-lg transition-all"
          style={{
            background: panel === "annotations" ? "rgba(167,139,250,0.2)" : "var(--bg-base)",
            color: panel === "annotations" ? "var(--library-color)" : "var(--text-muted)",
          }}
          title="Annotations"
        >
          <Bookmark size={16} />
        </button>
      </div>

      {/* ── Progress bar ── */}
      <div className="h-0.5 shrink-0" style={{ background: "var(--bg-elevated)" }}>
        <div
          className="h-full transition-all"
          style={{ width: `${progressPct}%`, background: "var(--library-color)" }}
        />
      </div>

      {/* ── PDF + navigation ── */}
      <div className="flex-1 flex flex-col items-center overflow-auto relative" ref={containerRef}>
        <div className="py-4 w-full flex justify-center">
          <Document
            file={`/api/library/pdf/${bookId}`}
            onLoadSuccess={({ numPages }) => setNumPages(numPages)}
            loading={
              <div className="mt-24 text-center" style={{ color: "var(--text-muted)" }}>
                Loading PDF…
              </div>
            }
            error={
              <div className="mt-24 text-center" style={{ color: "var(--red)" }}>
                Failed to load PDF. Make sure the file was uploaded.
              </div>
            }
          >
            <Page
              pageNumber={currentPage}
              width={Math.min(containerWidth - 32, 720)}
              renderTextLayer
              renderAnnotationLayer
            />
          </Document>
        </div>

        {/* ── Prev / Next buttons ── */}
        <div className="sticky bottom-6 flex items-center gap-4 px-6 py-3 rounded-2xl" style={{ background: "var(--bg-elevated)", border: "1px solid var(--glass-border)" }}>
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            className="p-2 rounded-xl disabled:opacity-30"
            style={{ background: "var(--bg-base)" }}
          >
            <ChevronLeft size={20} style={{ color: "var(--text-primary)" }} />
          </button>

          <span className="text-sm font-medium px-2" style={{ color: "var(--text-secondary)" }}>
            {progressPct}%
          </span>

          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= numPages}
            className="p-2 rounded-xl disabled:opacity-30"
            style={{ background: "var(--bg-base)" }}
          >
            <ChevronRight size={20} style={{ color: "var(--text-primary)" }} />
          </button>
        </div>
      </div>

      {/* ── Side panels ── */}
      <AnimatePresence>
        {panel === "lookup" && (
          <WordLookupPanel bookId={bookId} onClose={() => setPanel("none")} />
        )}
        {panel === "annotations" && (
          <AnnotationsPanel
            bookId={bookId}
            annotations={annotations}
            onGoToPage={(p) => { goToPage(p); setPanel("none"); }}
            onDelete={deleteAnnotation}
            onClose={() => setPanel("none")}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
