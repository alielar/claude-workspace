"use client";

/**
 * /wordbank — Vocabulary saved from reading.
 * Two views:
 * 1. Review queue — flashcards due today (SM-2 spaced repetition)
 * 2. All words — full word bank list
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookMarked, RotateCcw, Check, X, Eye } from "lucide-react";

type Word = {
  id: number;
  word: string;
  definition: string;
  etymology?: string;
  exampleSentence?: string;
  masteryStatus: string;
  nextReviewDate: string;
};

type FlashcardMode = "front" | "back";

function FlashCard({
  word,
  onGrade,
}: {
  word: Word;
  onGrade: (wordId: number, quality: 0 | 1 | 2 | 3) => void;
}) {
  const [side, setSide] = useState<FlashcardMode>("front");

  return (
    <motion.div
      key={word.id}
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      className="w-full"
    >
      <div
        className="glass-accent rounded-2xl p-8 min-h-[240px] flex flex-col items-center justify-center text-center cursor-pointer select-none"
        onClick={() => setSide((s) => (s === "front" ? "back" : "front"))}
      >
        {side === "front" ? (
          <>
            <p className="text-xs uppercase tracking-widest mb-4" style={{ color: "var(--wordbank-color)" }}>
              Word
            </p>
            <h2 className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>
              {word.word}
            </h2>
            <p className="mt-4 text-sm" style={{ color: "var(--text-muted)" }}>
              Tap to reveal definition
            </p>
          </>
        ) : (
          <>
            <p className="text-xs uppercase tracking-widest mb-3" style={{ color: "var(--wordbank-color)" }}>
              Definition
            </p>
            <p className="text-base leading-relaxed mb-4" style={{ color: "var(--text-primary)" }}>
              {word.definition}
            </p>
            {word.exampleSentence && (
              <p className="text-sm italic" style={{ color: "var(--text-secondary)" }}>
                "{word.exampleSentence}"
              </p>
            )}
            {word.etymology && (
              <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
                Origin: {word.etymology}
              </p>
            )}
          </>
        )}
      </div>

      {/* Grade buttons (only visible after flipping) */}
      <AnimatePresence>
        {side === "back" && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-3 gap-3 mt-4"
          >
            {[
              { quality: 0 as const, label: "Again",  color: "var(--red)",           bg: "rgba(248,113,113,0.15)" },
              { quality: 1 as const, label: "Hard",   color: "var(--amber)",         bg: "rgba(251,191,36,0.15)" },
              { quality: 3 as const, label: "Easy",   color: "var(--green)",         bg: "rgba(74,222,128,0.15)" },
            ].map(({ quality, label, color, bg }) => (
              <button
                key={label}
                onClick={() => onGrade(word.id, quality)}
                className="py-3 rounded-xl text-sm font-semibold transition-all"
                style={{ background: bg, color }}
              >
                {label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function WordBankPage() {
  const [dueWords, setDueWords] = useState<Word[]>([]);
  const [allWords, setAllWords] = useState<Word[]>([]);
  const [view, setView] = useState<"review" | "all">("review");
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sessionComplete, setSessionComplete] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/wordbank?due=true").then((r) => r.json()),
      fetch("/api/wordbank").then((r) => r.json()),
    ]).then(([due, all]) => {
      setDueWords(due);
      setAllWords(all);
      setLoading(false);
    });
  }, []);

  const handleGrade = async (wordId: number, quality: 0 | 1 | 2 | 3) => {
    await fetch("/api/wordbank/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wordId, quality }),
    });

    if (currentIdx + 1 >= dueWords.length) {
      setSessionComplete(true);
    } else {
      setCurrentIdx((i) => i + 1);
    }
  };

  const currentWord = dueWords[currentIdx];

  return (
    <div className="page-enter p-5 md:p-10 max-w-xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>Word Bank</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
          {dueWords.length} due today · {allWords.length} total words
        </p>
      </div>

      {/* View toggle */}
      <div
        className="flex rounded-xl p-1 gap-1"
        style={{ background: "var(--bg-elevated)" }}
      >
        {(["review", "all"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: view === v ? "var(--wordbank-color)" : "transparent",
              color: view === v ? "#fff" : "var(--text-muted)",
            }}
          >
            {v === "review" ? `Review (${dueWords.length})` : `All Words (${allWords.length})`}
          </button>
        ))}
      </div>

      {/* Review queue */}
      {view === "review" && (
        <>
          {loading && <div className="glass rounded-2xl h-60 animate-pulse" />}

          {!loading && dueWords.length === 0 && (
            <div className="glass rounded-2xl p-10 flex flex-col items-center gap-3">
              <Check size={36} style={{ color: "var(--green)" }} />
              <p className="font-medium" style={{ color: "var(--text-primary)" }}>All caught up!</p>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>No words due for review today.</p>
            </div>
          )}

          {!loading && !sessionComplete && currentWord && (
            <>
              <div className="flex items-center justify-between text-sm" style={{ color: "var(--text-muted)" }}>
                <span>{currentIdx + 1} / {dueWords.length}</span>
                <div className="h-1.5 flex-1 mx-4 rounded-full overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${((currentIdx) / dueWords.length) * 100}%`, background: "var(--wordbank-color)" }}
                  />
                </div>
              </div>
              <AnimatePresence mode="wait">
                <FlashCard key={currentWord.id} word={currentWord} onGrade={handleGrade} />
              </AnimatePresence>
            </>
          )}

          {sessionComplete && (
            <div className="glass rounded-2xl p-10 flex flex-col items-center gap-3">
              <BookMarked size={36} style={{ color: "var(--wordbank-color)" }} />
              <p className="font-medium" style={{ color: "var(--text-primary)" }}>Session complete! 🎉</p>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>Reviewed {dueWords.length} words.</p>
            </div>
          )}
        </>
      )}

      {/* All words list */}
      {view === "all" && (
        <div className="space-y-2">
          {allWords.length === 0 && (
            <p className="text-center py-12" style={{ color: "var(--text-muted)" }}>
              No words saved yet. Start reading to add vocabulary!
            </p>
          )}
          {allWords.map((w) => (
            <div key={w.id} className="glass rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold" style={{ color: "var(--text-primary)" }}>{w.word}</p>
                  <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>{w.definition}</p>
                </div>
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ml-3"
                  style={{
                    background: w.masteryStatus === "mastered" ? "rgba(74,222,128,0.1)" : "var(--bg-elevated)",
                    color: w.masteryStatus === "mastered" ? "var(--green)" : "var(--text-muted)",
                  }}
                >
                  {w.masteryStatus}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
