"use client";

/**
 * /wordbank — Vocabulary with fixed-interval spaced repetition.
 *
 * Tabs:
 *   Review (N due)  — alternating flashcard / fill-in-blank cards, 3-button grading
 *   All Words (N)   — searchable table with language filter, streak, next review
 *
 * Add Word:         paste a word → Claude auto-generates definition + metadata
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookMarked, Check, Plus, Search, X, Loader2, Languages } from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Language = "en" | "fr" | "darija";

type Word = {
  id: number;
  word: string;
  definition: string;
  partOfSpeech: string | null;
  exampleSentence: string | null;
  language: Language;
  masteryStatus: string;
  nextReviewDate: string;
  streak: number;
  interval: number;
};

type CardMode = "flashcard" | "fillblank";
type ReviewPhase = "question" | "answer";

const LANG_LABELS: Record<Language | string, string> = {
  en: "EN",
  fr: "FR",
  darija: "DZ",
};

const LANG_COLORS: Record<Language | string, string> = {
  en: "#3B82F6",
  fr: "#EF4444",
  darija: "#10B981",
};

// ─── Fill-in-blank helper ──────────────────────────────────────────────────────

/** Replace the word (and simple inflections) in sentence with a blank */
function blankSentence(sentence: string, word: string): string {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}\\w*\\b`, "gi");
  return sentence.replace(re, "_____");
}

// ─── Review card ──────────────────────────────────────────────────────────────

function ReviewCard({
  word,
  mode,
  onGrade,
  progress,
  total,
}: {
  word: Word;
  mode: CardMode;
  onGrade: (wordId: number, button: "again" | "good" | "easy") => void;
  progress: number;
  total: number;
}) {
  const [phase, setPhase] = useState<ReviewPhase>("question");
  const [input, setInput] = useState("");
  const [revealed, setRevealed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset when word changes
  useEffect(() => {
    setPhase("question");
    setInput("");
    setRevealed(false);
  }, [word.id]);

  // Focus fill-in input automatically
  useEffect(() => {
    if (mode === "fillblank" && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [mode, word.id]);

  const blank =
    word.exampleSentence ? blankSentence(word.exampleSentence, word.word) : null;

  const handleReveal = () => {
    setPhase("answer");
    setRevealed(true);
  };

  const handleSubmitBlank = (e: React.FormEvent) => {
    e.preventDefault();
    setRevealed(true);
    setPhase("answer");
  };

  return (
    <motion.div
      key={word.id}
      initial={{ opacity: 0, x: 32 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -32 }}
      transition={{ duration: 0.2 }}
      className="w-full"
    >
      {/* Progress bar */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
          {progress} / {total}
        </span>
        <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${((progress - 1) / total) * 100}%`,
              background: "var(--accent-primary)",
            }}
          />
        </div>
        {/* Language chip */}
        <span
          className="text-[10px] font-bold px-1.5 py-0.5 rounded"
          style={{ background: `${LANG_COLORS[word.language]}22`, color: LANG_COLORS[word.language] }}
        >
          {LANG_LABELS[word.language]}
        </span>
      </div>

      {/* Card body */}
      <div
        className="rounded-2xl p-7 min-h-[220px] flex flex-col"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}
      >
        {mode === "flashcard" ? (
          /* ── Flashcard mode ─────────────────────────────────── */
          <div className="flex flex-col items-center justify-center flex-1 text-center gap-4">
            {phase === "question" ? (
              <>
                <p className="text-[11px] uppercase tracking-widest font-medium" style={{ color: "var(--accent-primary)" }}>
                  What does this mean?
                </p>
                <h2 className="text-3xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
                  {word.word}
                </h2>
                {word.partOfSpeech && (
                  <span className="text-xs italic" style={{ color: "var(--text-muted)" }}>
                    {word.partOfSpeech}
                  </span>
                )}
                <button
                  onClick={handleReveal}
                  className="mt-3 text-sm px-4 py-2 rounded-lg transition-all"
                  style={{
                    background: "var(--bg-elevated)",
                    color: "var(--text-secondary)",
                  }}
                >
                  Reveal definition
                </button>
              </>
            ) : (
              <>
                <p className="text-[11px] uppercase tracking-widest font-medium" style={{ color: "var(--accent-primary)" }}>
                  Definition
                </p>
                <p className="text-base leading-relaxed" style={{ color: "var(--text-primary)" }}>
                  {word.definition}
                </p>
                {word.exampleSentence && (
                  <p className="text-sm italic mt-1" style={{ color: "var(--text-secondary)" }}>
                    &ldquo;{word.exampleSentence}&rdquo;
                  </p>
                )}
              </>
            )}
          </div>
        ) : (
          /* ── Fill-in-blank mode ─────────────────────────────── */
          <div className="flex flex-col flex-1 gap-4">
            <p className="text-[11px] uppercase tracking-widest font-medium" style={{ color: "var(--accent-primary)" }}>
              Fill in the blank
            </p>
            {blank ? (
              <p className="text-base leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {blank}
              </p>
            ) : (
              <p className="text-sm italic" style={{ color: "var(--text-muted)" }}>
                Definition: {word.definition}
              </p>
            )}

            {!revealed ? (
              <form onSubmit={handleSubmitBlank} className="mt-auto flex gap-2">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type the word…"
                  className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    background: "var(--bg-elevated)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-subtle)",
                  }}
                />
                <button
                  type="submit"
                  className="px-3 py-2 rounded-lg text-sm font-medium"
                  style={{ background: "var(--accent-primary)", color: "#fff" }}
                >
                  Check
                </button>
              </form>
            ) : (
              <div className="mt-auto rounded-lg p-3" style={{ background: "var(--bg-elevated)" }}>
                <span className="text-[11px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                  Answer
                </span>
                <p className="font-semibold mt-0.5" style={{ color: "var(--text-primary)" }}>
                  {word.word}
                </p>
                {input.trim().toLowerCase() === word.word.toLowerCase() && (
                  <p className="text-xs mt-1" style={{ color: "var(--green, #4ade80)" }}>
                    Correct!
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Grade buttons — appear after revealing */}
      <AnimatePresence>
        {(phase === "answer" || (mode === "fillblank" && revealed)) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
            className="grid grid-cols-3 gap-3 mt-4"
          >
            {(
              [
                { button: "again" as const, label: "Again",  sublabel: "today",  color: "#F87171", bg: "rgba(248,113,113,0.12)" },
                { button: "good"  as const, label: "Good",   sublabel: "+1 step", color: "#60A5FA", bg: "rgba(96,165,250,0.12)"  },
                { button: "easy"  as const, label: "Easy",   sublabel: "+2 steps",color: "#4ADE80", bg: "rgba(74,222,128,0.12)"  },
              ] as const
            ).map(({ button, label, sublabel, color, bg }) => (
              <button
                key={button}
                onClick={() => onGrade(word.id, button)}
                className="py-3 rounded-xl flex flex-col items-center gap-0.5 transition-all active:scale-95"
                style={{ background: bg, color }}
              >
                <span className="text-sm font-semibold">{label}</span>
                <span className="text-[10px] opacity-70">{sublabel}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Add Word panel ───────────────────────────────────────────────────────────

function AddWordPanel({ onSaved, onClose }: { onSaved: (w: Word) => void; onClose: () => void }) {
  const [wordInput, setWordInput] = useState("");
  const [preview, setPreview] = useState<Word | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wordInput.trim()) return;
    setLoading(true);
    setError(null);
    setPreview(null);

    try {
      const res = await fetch("/api/wordbank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: wordInput.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (preview) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-6 space-y-4"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
                {preview.word}
              </h3>
              {preview.partOfSpeech && (
                <span className="text-xs italic" style={{ color: "var(--text-muted)" }}>
                  {preview.partOfSpeech}
                </span>
              )}
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                style={{ background: `${LANG_COLORS[preview.language]}22`, color: LANG_COLORS[preview.language] }}
              >
                {LANG_LABELS[preview.language]}
              </span>
            </div>
            <p className="text-sm mt-2 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {preview.definition}
            </p>
            {preview.exampleSentence && (
              <p className="text-sm italic mt-2" style={{ color: "var(--text-muted)" }}>
                &ldquo;{preview.exampleSentence}&rdquo;
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={() => { onSaved(preview); onClose(); }}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{ background: "var(--accent-primary)", color: "#fff" }}
          >
            Save to Word Bank
          </button>
          <button
            onClick={() => setPreview(null)}
            className="px-4 py-2.5 rounded-xl text-sm transition-all"
            style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
          >
            Try again
          </button>
          <button
            onClick={onClose}
            className="px-3 py-2.5 rounded-xl transition-all"
            style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
          >
            <X size={16} />
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-5"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Add a word
        </p>
        <button onClick={onClose} style={{ color: "var(--text-muted)" }}>
          <X size={16} />
        </button>
      </div>

      <form onSubmit={handleGenerate} className="flex gap-2">
        <input
          autoFocus
          value={wordInput}
          onChange={(e) => setWordInput(e.target.value)}
          placeholder="Type a word or phrase…"
          className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
          style={{
            background: "var(--bg-elevated)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-subtle)",
          }}
        />
        <button
          type="submit"
          disabled={loading || !wordInput.trim()}
          className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50 transition-all"
          style={{ background: "var(--accent-primary)", color: "#fff" }}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : "Generate"}
        </button>
      </form>

      {error && (
        <p className="text-xs mt-2" style={{ color: "#F87171" }}>
          {error}
        </p>
      )}

      <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
        Claude will auto-generate definition, part of speech, example sentence and detect language.
      </p>
    </motion.div>
  );
}

// ─── All Words table ──────────────────────────────────────────────────────────

const MASTERY_STYLES: Record<string, { bg: string; color: string }> = {
  new:      { bg: "rgba(148,163,184,0.1)", color: "var(--text-muted)" },
  learning: { bg: "rgba(96,165,250,0.12)", color: "#60A5FA" },
  mastered: { bg: "rgba(74,222,128,0.12)", color: "#4ADE80" },
};

function AllWordsView({ words }: { words: Word[] }) {
  const [query, setQuery] = useState("");
  const [langFilter, setLangFilter] = useState<string>("all");

  const langs = ["all", ...Array.from(new Set(words.map((w) => w.language)))];

  const filtered = words.filter((w) => {
    const matchLang = langFilter === "all" || w.language === langFilter;
    const matchQ =
      !query ||
      w.word.toLowerCase().includes(query.toLowerCase()) ||
      w.definition.toLowerCase().includes(query.toLowerCase());
    return matchLang && matchQ;
  });

  return (
    <div className="space-y-4">
      {/* Search + lang filter */}
      <div className="flex gap-2">
        <div
          className="flex items-center gap-2 flex-1 rounded-xl px-3 py-2"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}
        >
          <Search size={14} style={{ color: "var(--text-muted)" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search words or definitions…"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: "var(--text-primary)" }}
          />
          {query && (
            <button onClick={() => setQuery("")} style={{ color: "var(--text-muted)" }}>
              <X size={12} />
            </button>
          )}
        </div>

        {langs.length > 2 && (
          <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-subtle)" }}>
            {langs.map((l) => (
              <button
                key={l}
                onClick={() => setLangFilter(l)}
                className="px-3 py-2 text-xs font-medium transition-all"
                style={{
                  background: langFilter === l ? "var(--accent-primary)" : "var(--bg-elevated)",
                  color: langFilter === l ? "#fff" : "var(--text-muted)",
                }}
              >
                {l === "all" ? "All" : LANG_LABELS[l]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Word list */}
      {filtered.length === 0 && (
        <div className="py-16 text-center" style={{ color: "var(--text-muted)" }}>
          {query ? "No words match your search." : "No words yet — add some above!"}
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((w) => {
          const mastery = MASTERY_STYLES[w.masteryStatus] ?? MASTERY_STYLES.new;
          return (
            <div
              key={w.id}
              className="rounded-xl p-4"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                      {w.word}
                    </span>
                    {w.partOfSpeech && (
                      <span className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>
                        {w.partOfSpeech}
                      </span>
                    )}
                    <span
                      className="text-[10px] font-bold px-1 py-0.5 rounded"
                      style={{ background: `${LANG_COLORS[w.language]}22`, color: LANG_COLORS[w.language] }}
                    >
                      {LANG_LABELS[w.language]}
                    </span>
                  </div>
                  <p className="text-sm mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    {w.definition}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                    style={mastery}
                  >
                    {w.masteryStatus}
                  </span>
                  {w.streak > 0 && (
                    <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      🔥 {w.streak}
                    </span>
                  )}
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {w.nextReviewDate}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function WordBankPage() {
  const [dueWords, setDueWords]     = useState<Word[]>([]);
  const [allWords, setAllWords]     = useState<Word[]>([]);
  const [tab, setTab]               = useState<"review" | "all">("review");
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading]       = useState(true);
  const [sessionDone, setSessionDone] = useState(false);
  const [showAdd, setShowAdd]       = useState(false);
  const [migrated, setMigrated]     = useState(false);

  // Run migration once on mount (adds new columns if not present)
  useEffect(() => {
    if (migrated) return;
    fetch("/api/admin/migrate", { method: "POST" })
      .catch(() => {})
      .finally(() => setMigrated(true));
  }, [migrated]);

  const loadWords = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/wordbank?due=true").then((r) => r.json()).catch(() => []),
      fetch("/api/wordbank").then((r) => r.json()).catch(() => []),
    ]).then(([due, all]) => {
      setDueWords(Array.isArray(due) ? due : []);
      setAllWords(Array.isArray(all) ? all : []);
      setCurrentIdx(0);
      setSessionDone(false);
      setLoading(false);
    });
  };

  useEffect(() => {
    loadWords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGrade = async (wordId: number, button: "again" | "good" | "easy") => {
    await fetch("/api/wordbank/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wordId, button }),
    }).catch(() => {});

    if (button === "again") {
      // Send "again" words to the back of the queue (re-append, don't advance)
      setDueWords((prev) => {
        const word = prev[currentIdx];
        const next = prev.filter((_, i) => i !== currentIdx);
        return [...next, word];
        // currentIdx stays the same — next word slides in
      });
      return;
    }

    if (currentIdx + 1 >= dueWords.length) {
      setSessionDone(true);
    } else {
      setCurrentIdx((i) => i + 1);
    }
  };

  // Alternate between flashcard and fill-in-blank
  const cardMode: CardMode = currentIdx % 2 === 0 ? "flashcard" : "fillblank";
  const currentWord = dueWords[currentIdx];

  return (
    <div className="page-enter p-5 md:p-10 max-w-xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Word Bank
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            {loading ? "Loading…" : `${dueWords.length} due · ${allWords.length} total`}
          </p>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all"
          style={{
            background: showAdd ? "var(--accent-primary)" : "var(--bg-elevated)",
            color: showAdd ? "#fff" : "var(--text-secondary)",
          }}
        >
          {showAdd ? <X size={14} /> : <Plus size={14} />}
          {showAdd ? "Cancel" : "Add word"}
        </button>
      </div>

      {/* Add word panel */}
      <AnimatePresence>
        {showAdd && (
          <AddWordPanel
            onSaved={(w) => {
              setAllWords((prev) => [w, ...prev]);
              setDueWords((prev) => [w, ...prev]);
              setCurrentIdx(0);
              setSessionDone(false);
            }}
            onClose={() => setShowAdd(false)}
          />
        )}
      </AnimatePresence>

      {/* Tab toggle */}
      <div
        className="flex rounded-xl p-1 gap-1"
        style={{ background: "var(--bg-elevated)" }}
      >
        {(["review", "all"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: tab === t ? "var(--accent-primary)" : "transparent",
              color: tab === t ? "#fff" : "var(--text-muted)",
            }}
          >
            {t === "review"
              ? `Review${loading ? "" : ` (${dueWords.length})`}`
              : `All Words${loading ? "" : ` (${allWords.length})`}`}
          </button>
        ))}
      </div>

      {/* ── Review tab ──────────────────────────────────────────── */}
      {tab === "review" && (
        <>
          {loading && (
            <div
              className="rounded-2xl animate-pulse"
              style={{ height: 240, background: "var(--bg-card)" }}
            />
          )}

          {!loading && dueWords.length === 0 && !sessionDone && (
            <div
              className="rounded-2xl p-12 flex flex-col items-center gap-3 text-center"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}
            >
              <Check size={32} style={{ color: "#4ADE80" }} />
              <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
                All caught up!
              </p>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                No words due for review today.
              </p>
              <button
                onClick={() => setTab("all")}
                className="mt-2 text-sm px-4 py-2 rounded-lg"
                style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}
              >
                Browse all words
              </button>
            </div>
          )}

          {!loading && sessionDone && (
            <div
              className="rounded-2xl p-12 flex flex-col items-center gap-3 text-center"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}
            >
              <BookMarked size={32} style={{ color: "var(--accent-primary)" }} />
              <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
                Session complete!
              </p>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Reviewed {dueWords.length} word{dueWords.length !== 1 ? "s" : ""}.
              </p>
              <button
                onClick={loadWords}
                className="mt-2 text-sm px-4 py-2 rounded-lg"
                style={{ background: "var(--accent-primary)", color: "#fff" }}
              >
                Review again
              </button>
            </div>
          )}

          {!loading && !sessionDone && currentWord && (
            <AnimatePresence mode="wait">
              <ReviewCard
                key={currentWord.id + "-" + currentIdx}
                word={currentWord}
                mode={cardMode}
                onGrade={handleGrade}
                progress={currentIdx + 1}
                total={dueWords.length}
              />
            </AnimatePresence>
          )}
        </>
      )}

      {/* ── All Words tab ────────────────────────────────────────── */}
      {tab === "all" && (
        <>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="rounded-xl animate-pulse"
                  style={{ height: 72, background: "var(--bg-card)" }}
                />
              ))}
            </div>
          ) : (
            <AllWordsView words={allWords} />
          )}
        </>
      )}
    </div>
  );
}
