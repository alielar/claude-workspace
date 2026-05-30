"use client";

/**
 * /wordbank — Vocabulary with spaced repetition. V2 Ambient Futurism design.
 * Layout: 1fr / 360px — left: flashcard or table; right: stats sidebar.
 * Tabs: Review (N due) | All Words (N total)
 */

import { useEffect, useRef, useState } from "react";

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

type ReadingNote = {
  id: number;
  content: string;
  bookTitle: string | null;
  pageNumber: number | null;
  masteryStatus: string;
  nextReviewDate: string;
  streak: number;
  interval: number;
};

/** A unified review item — either a word or a reading note */
type ReviewItem =
  | { type: "word"; data: Word }
  | { type: "note"; data: ReadingNote };

type CardMode = "flashcard" | "fillblank";
type ReviewPhase = "question" | "answer";

type Suggestion = {
  word: string;
  source: "news" | "library";
  context: string;
};

const LANG_LABELS: Record<string, string> = { en: "EN", fr: "FR", darija: "DA" };
const LANG_COLORS: Record<string, string>  = { en: "var(--cyan)", fr: "var(--violet)", darija: "var(--warn)" };

/** Replace the word in sentence with underscores */
function blankSentence(sentence: string, word: string): string {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return sentence.replace(new RegExp(`\\b${escaped}\\w*\\b`, "gi"), "_____");
}

// ─── Flashcard component ──────────────────────────────────────────────────────

function FlashCard({ word, mode, onGrade, progress, total }: {
  word: Word;
  mode: CardMode;
  onGrade: (id: number, btn: "again" | "good" | "easy") => void;
  progress: number;
  total: number;
}) {
  const [phase, setPhase] = useState<ReviewPhase>("question");
  const [input, setInput]   = useState("");
  const [revealed, setReveal] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setPhase("question"); setInput(""); setReveal(false); }, [word.id]);
  useEffect(() => { if (mode === "fillblank" && inputRef.current) setTimeout(() => inputRef.current?.focus(), 120); }, [mode, word.id]);

  const blank = word.exampleSentence ? blankSentence(word.exampleSentence, word.word) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: 14, border: "1px solid var(--line)", borderRadius: 18, background: "rgba(255,255,255,0.012)", position: "relative", overflow: "hidden", minHeight: 480 }}>
      {/* Ambient glow */}
      <div style={{ position: "absolute", inset: "-40%", background: "radial-gradient(40% 50% at 30% 40%, rgba(124,77,255,0.08), transparent 60%), radial-gradient(40% 50% at 70% 60%, rgba(100,255,218,0.06), transparent 60%)", pointerEvents: "none" }} />

      {/* Card */}
      <div style={{
        position: "relative", width: "100%", maxWidth: 580, padding: "42px 48px",
        background: "linear-gradient(180deg, rgba(28,28,46,0.85), rgba(20,20,32,0.85))",
        border: "1px solid var(--line-hi)", borderRadius: 18,
        boxShadow: "0 30px 70px rgba(0,0,0,0.45), 0 0 50px rgba(124,77,255,0.08), inset 0 1px 0 rgba(255,255,255,0.05)",
        backdropFilter: "blur(20px)",
      }}>
        {/* Top labels */}
        {word.partOfSpeech && (
          <div style={{ position: "absolute", top: 20, left: 24, fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 500, fontStyle: "italic" }}>
            {word.partOfSpeech}
          </div>
        )}
        <div style={{ position: "absolute", top: 20, right: 24, fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: LANG_COLORS[word.language] ?? "var(--cyan)", fontWeight: 600, display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 5, height: 5, borderRadius: "99px", background: LANG_COLORS[word.language], boxShadow: `0 0 6px ${LANG_COLORS[word.language]}`, display: "inline-block" }} />
          {LANG_LABELS[word.language]}
        </div>
        <div style={{ position: "absolute", bottom: 16, right: 24, fontSize: 10.5, letterSpacing: "0.06em", color: "var(--ink-4)", fontFamily: "var(--f-mono)" }}>
          CARD {progress} / {total} · SEEN {word.streak}×
        </div>

        {/* Word */}
        <div style={{ fontSize: 64, fontWeight: 300, letterSpacing: "-0.03em", lineHeight: 1.2, textAlign: "center", background: "var(--grad)", WebkitBackgroundClip: "text", color: "transparent", filter: "drop-shadow(0 0 24px rgba(124,77,255,0.20))", marginTop: 24, paddingBottom: "0.15em" }}>
          {word.word}
        </div>

        {/* Definition (shown after reveal, or always in flashcard mode) */}
        {(phase === "answer" || mode === "flashcard") && (
          <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid var(--line)", textAlign: "center" }}>
            <div style={{ fontSize: 16, lineHeight: 1.55, color: "var(--ink)", letterSpacing: "-0.005em", maxWidth: "46ch", margin: "0 auto" }}>
              {word.definition}
            </div>
            {word.exampleSentence && (
              <div style={{ fontStyle: "italic", color: "var(--ink-2)", marginTop: 18, fontSize: 14, lineHeight: 1.55, maxWidth: "46ch", marginLeft: "auto", marginRight: "auto" }}>
                &ldquo;{word.exampleSentence}&rdquo;
              </div>
            )}
          </div>
        )}

        {/* Fill-in-blank: show sentence with blank */}
        {mode === "fillblank" && phase === "question" && blank && (
          <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid var(--line)" }}>
            <div style={{ fontStyle: "italic", color: "var(--ink-2)", fontSize: 14, lineHeight: 1.5, textAlign: "center", marginBottom: 14 }}>
              &ldquo;{blank}&rdquo;
            </div>
            <form onSubmit={(e) => { e.preventDefault(); setPhase("answer"); setReveal(true); }} style={{ display: "flex", gap: 8 }}>
              <input
                ref={inputRef}
                className="cc-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type the word…"
                style={{ flex: 1, fontFamily: "var(--f-mono)", fontSize: 13 }}
              />
              <button type="submit" className="cc-btn cc-btn-primary" style={{ padding: "8px 16px" }}>Check</button>
            </form>
          </div>
        )}
      </div>

      {/* Reveal button (flashcard question phase) */}
      {mode === "flashcard" && phase === "question" && (
        <button className="cc-btn" onClick={() => setPhase("answer")} style={{ marginTop: 20, padding: "12px 32px" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          Reveal answer
        </button>
      )}

      {/* Grading buttons */}
      {phase === "answer" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, width: "100%", maxWidth: 580, marginTop: 20 }}>
          {([
            { key: "again" as const, label: "Again",  interval: "< 10 min", border: "rgba(255,138,138,0.25)", color: "var(--neg)",    hover: "rgba(255,138,138,0.06)" },
            { key: "good"  as const, label: "Good",   interval: "3 days",   border: "rgba(100,255,218,0.25)", color: "var(--cyan)",   hover: "rgba(100,255,218,0.06)" },
            { key: "easy"  as const, label: "Easy",   interval: "7 days",   border: "rgba(111,212,154,0.25)", color: "var(--pos)",    hover: "rgba(111,212,154,0.06)" },
          ]).map((btn) => (
            <button
              key={btn.key}
              className="wb-grade-btn"
              onClick={() => onGrade(word.id, btn.key)}
              style={{ padding: "14px 16px", borderRadius: 12, border: `1px solid ${btn.border}`, background: "rgba(255,255,255,0.02)", cursor: "pointer", transition: "all 0.15s var(--easeOut)", position: "relative" }}
            >
              <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: "-0.005em", color: btn.color }}>{btn.label}</div>
              <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 3, fontFamily: "var(--f-mono)", letterSpacing: "0.04em" }}>{btn.interval}</div>
            </button>
          ))}
        </div>
      )}

      {/* Hint bar */}
      {phase === "question" && (
        <div style={{ marginTop: 18, fontSize: 11.5, color: "var(--ink-3)", letterSpacing: "0.04em", display: "flex", gap: 14, alignItems: "center" }}>
          <span style={{ fontFamily: "var(--f-mono)", padding: "3px 8px", border: "1px solid var(--line)", borderRadius: 5, fontSize: 10 }}>SPACE</span>
          to flip
          <span style={{ color: "var(--cyan)" }}>· 50% of reviews are fill-in-blank</span>
        </div>
      )}
    </div>
  );
}

// ─── Reading note review card ────────────────────────────────────────────────

function NoteCard({ note, onGrade, progress, total }: {
  note: ReadingNote;
  onGrade: (id: number, btn: "again" | "good" | "easy") => void;
  progress: number;
  total: number;
}) {
  const [phase, setPhase] = useState<"question" | "answer">("question");

  useEffect(() => { setPhase("question"); }, [note.id]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: 14, border: "1px solid var(--line)", borderRadius: 18, background: "rgba(255,255,255,0.012)", position: "relative", overflow: "hidden", minHeight: 480 }}>
      <div style={{ position: "absolute", inset: "-40%", background: "radial-gradient(40% 50% at 30% 40%, rgba(255,183,77,0.06), transparent 60%), radial-gradient(40% 50% at 70% 60%, rgba(100,255,218,0.05), transparent 60%)", pointerEvents: "none" }} />

      <div style={{
        position: "relative", width: "100%", maxWidth: 580, padding: "42px 48px",
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
          CARD {progress} / {total} · SEEN {note.streak}×
        </div>

        {/* Source info */}
        {note.bookTitle && (
          <div style={{ marginTop: 24, marginBottom: 12, fontSize: 11, color: "var(--ink-4)", fontStyle: "italic" }}>
            From &ldquo;{note.bookTitle}&rdquo;{note.pageNumber ? ` · p.${note.pageNumber}` : ""}
          </div>
        )}

        {/* Note content */}
        <div style={{ fontSize: 17, lineHeight: 1.6, color: "var(--ink)", letterSpacing: "-0.005em", marginTop: note.bookTitle ? 0 : 32 }}>
          {note.content}
        </div>

        {/* Prompt */}
        {phase === "question" && (
          <div style={{ marginTop: 24, paddingTop: 18, borderTop: "1px solid var(--line)", textAlign: "center" }}>
            <div style={{ fontSize: 13, color: "var(--ink-3)", fontStyle: "italic" }}>Do you remember this?</div>
          </div>
        )}
      </div>

      {phase === "question" && (
        <button className="cc-btn" onClick={() => setPhase("answer")} style={{ marginTop: 20, padding: "12px 32px" }}>
          I remember
        </button>
      )}

      {phase === "answer" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, width: "100%", maxWidth: 580, marginTop: 20 }}>
          {([
            { key: "again" as const, label: "Forgot", interval: "< 10 min", border: "rgba(255,138,138,0.25)", color: "var(--neg)" },
            { key: "good"  as const, label: "Remembered", interval: "3 days", border: "rgba(100,255,218,0.25)", color: "var(--cyan)" },
            { key: "easy"  as const, label: "Easy", interval: "7 days", border: "rgba(111,212,154,0.25)", color: "var(--pos)" },
          ]).map((btn) => (
            <button
              key={btn.key}
              className="wb-grade-btn"
              onClick={() => onGrade(note.id, btn.key)}
              style={{ padding: "14px 16px", borderRadius: 12, border: `1px solid ${btn.border}`, background: "rgba(255,255,255,0.02)", cursor: "pointer", transition: "all 0.15s var(--easeOut)" }}
            >
              <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: "-0.005em", color: btn.color }}>{btn.label}</div>
              <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 3, fontFamily: "var(--f-mono)", letterSpacing: "0.04em" }}>{btn.interval}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function WordbankPage() {
  const [allWords, setAllWords]   = useState<Word[]>([]);
  const [dueWords, setDueWords]   = useState<Word[]>([]);
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState<"review" | "all">("review");
  const [cardIndex, setCardIndex] = useState(0);
  const [cardMode, setCardMode]   = useState<CardMode>("flashcard");
  const [search, setSearch]       = useState("");
  const [langFilter, setLangFilter] = useState<Language | "all">("all");
  const [addOpen, setAddOpen]           = useState(false);
  const [newWord, setNewWord]           = useState("");
  const [addLoading, setAddLoading]     = useState(false);
  const [suggestions, setSuggestions]   = useState<Suggestion[]>([]);
  const [sugLoading, setSugLoading]     = useState(false);
  const [addingSug, setAddingSug]       = useState<string | null>(null);
  const [dueNotes, setDueNotes]        = useState<ReadingNote[]>([]);

  // Review queue: words only (reading notes now live in Knowledge Bank)
  const reviewQueue: ReviewItem[] = [
    ...dueWords.map((w): ReviewItem => ({ type: "word", data: w })),
  ];

  const load = async () => {
    const [allRes, dueRes] = await Promise.all([
      fetch("/api/wordbank").catch(() => null),
      fetch("/api/wordbank?due=true").catch(() => null),
    ]);
    if (allRes?.ok) setAllWords(await allRes.json());
    if (dueRes?.ok) setDueWords(await dueRes.json());
    setLoading(false);
  };

  const loadSuggestions = async () => {
    setSugLoading(true);
    const res = await fetch("/api/wordbank/suggestions").catch(() => null);
    if (res?.ok) setSuggestions(await res.json());
    setSugLoading(false);
  };

  useEffect(() => { load(); loadSuggestions(); }, []);

  // Alternate flashcard / fillblank for words
  const currentMode: CardMode = cardIndex % 2 === 0 ? "flashcard" : "fillblank";
  const currentItem = reviewQueue[cardIndex] ?? null;

  const handleGrade = async (id: number, btn: "again" | "good" | "easy") => {
    const item = reviewQueue[cardIndex];
    const endpoint = item?.type === "note" ? "/api/library/notes/review" : "/api/wordbank/review";
    const bodyKey = item?.type === "note" ? "noteId" : "wordId";
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [bodyKey]: id, button: btn }),
    });
    if (cardIndex + 1 >= reviewQueue.length) {
      await load();
      setCardIndex(0);
    } else {
      setCardIndex((i) => i + 1);
    }
  };

  const handleAddWord = async () => {
    if (!newWord.trim()) return;
    setAddLoading(true);
    await fetch("/api/wordbank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word: newWord.trim() }),
    });
    setNewWord("");
    setAddOpen(false);
    setAddLoading(false);
    await load();
    await loadSuggestions();
  };

  /** Quick-add a suggested word without opening the modal */
  const quickAddSuggestion = async (word: string) => {
    setAddingSug(word);
    await fetch("/api/wordbank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word }),
    });
    setAddingSug(null);
    // Remove from suggestions list optimistically
    setSuggestions((prev) => prev.filter((s) => s.word !== word));
    await load();
  };

  // Filtered all-words list
  const filtered = allWords.filter((w) => {
    if (langFilter !== "all" && w.language !== langFilter) return false;
    if (search && !w.word.toLowerCase().includes(search.toLowerCase()) && !w.definition.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Language counts
  const langCounts = { en: 0, fr: 0, darija: 0 };
  allWords.forEach((w) => { if (w.language in langCounts) langCounts[w.language as Language]++; });

  // Streak classifications
  const streakStyle = (s: number) =>
    s >= 21 ? { color: "var(--violet)" } :
    s >= 7  ? { color: "var(--warn)"   } :
              { color: "var(--ink-3)"   };

  return (
    <div style={{ padding: "0 0 40px" }}>

      {/* Page title */}
      <div className="cc-pagetitle" style={{ marginBottom: 20 }}>
        <div>
          <h1>Word <span className="grad-text">Bank</span>.</h1>
          <div className="sub">SRS spaced repetition · English · French · Darija · {allWords.length} words</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Tabs */}
          <div className="cc-tabs">
            <button className={`cc-tab${tab === "review" ? " cur" : ""}`} onClick={() => setTab("review")}>
              Review<span className="count">{reviewQueue.length}</span>
            </button>
            <button className={`cc-tab${tab === "all" ? " cur" : ""}`} onClick={() => setTab("all")}>
              All Words<span className="count">{allWords.length}</span>
            </button>
          </div>
          <button className="cc-btn cc-btn-primary" onClick={() => setAddOpen(true)} style={{ fontSize: 13, padding: "10px 16px" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add word
          </button>
        </div>
      </div>

      {/* 1fr / 360px layout */}
      <div className="wb-grid" style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 14 }}>

        {/* ── LEFT ─────────────────────────────────────────────────── */}
        <div>
          {/* Review tab */}
          {tab === "review" && (
            <>
              {/* Progress strip */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", border: "1px solid var(--line)", borderRadius: 12, background: "rgba(255,255,255,0.015)", marginBottom: 14 }}>
                <span style={{ fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>Today&apos;s session</span>
                <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ height: "100%", background: "var(--grad)", boxShadow: "0 0 8px rgba(124,77,255,0.40)", width: reviewQueue.length > 0 ? `${Math.round((cardIndex / reviewQueue.length) * 100)}%` : "0%" }} />
                </div>
                <span style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--ink)", letterSpacing: "0.04em" }}>
                  {cardIndex} / {reviewQueue.length}
                </span>
                <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
                  · ~{Math.max(0, Math.ceil((reviewQueue.length - cardIndex) * 0.25))} min left
                </span>
              </div>

              {loading && (
                <div style={{ textAlign: "center", padding: "48px 0", color: "var(--ink-4)", fontSize: 13 }}>Loading…</div>
              )}

              {!loading && reviewQueue.length === 0 && (
                <div className="cc-card" style={{ padding: "48px 32px", textAlign: "center" }}>
                  <div style={{ fontSize: 13, color: "var(--ink-2)", marginBottom: 8 }}>All caught up! No words or notes due today.</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>Add new words or come back tomorrow.</div>
                </div>
              )}

              {!loading && currentItem?.type === "word" && (
                <FlashCard
                  word={currentItem.data}
                  mode={currentMode}
                  onGrade={handleGrade}
                  progress={cardIndex + 1}
                  total={reviewQueue.length}
                />
              )}

              {!loading && currentItem?.type === "note" && (
                <NoteCard
                  note={currentItem.data}
                  onGrade={handleGrade}
                  progress={cardIndex + 1}
                  total={reviewQueue.length}
                />
              )}
            </>
          )}

          {/* All Words tab */}
          {tab === "all" && (
            <>
              {/* Search */}
              <div className="cc-search" style={{ marginBottom: 14 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input
                  placeholder={`Search ${allWords.length} words by spelling, language, or definition…`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {/* Language filter chips */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                {(["all", "en", "fr", "darija"] as const).map((lang) => (
                  <button
                    key={lang}
                    className="wb-lang-chip"
                    onClick={() => setLangFilter(lang)}
                    style={{
                      padding: "6px 12px", border: "1px solid var(--line)", borderRadius: 99, fontSize: 11,
                      color: langFilter === lang ? "var(--ink)" : "var(--ink-4)",
                      letterSpacing: "0.02em", cursor: "pointer", transition: "all 0.15s var(--easeOut)",
                      background: langFilter === lang ? "rgba(124,77,255,0.10)" : "transparent",
                      borderColor: langFilter === lang ? "rgba(124,77,255,0.30)" : "var(--line)",
                    }}
                  >
                    {lang === "all" ? "All" : LANG_LABELS[lang]}
                    <span style={{ marginLeft: 5, color: "var(--ink-4)", fontFamily: "var(--f-mono)", fontSize: 10 }}>
                      {lang === "all" ? allWords.length : langCounts[lang as Language]}
                    </span>
                  </button>
                ))}
                <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)" }}>
                  Sorted by · <b style={{ color: "var(--ink)" }}>Next review ↑</b>
                </div>
              </div>

              {/* Table */}
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Word", "Lang", "Definition", "Next review", "Streak"].map((h, i) => (
                      <th key={h} style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", textAlign: i === 4 ? "right" : "left", padding: "10px 12px", borderBottom: "1px solid var(--line)" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((w) => (
                    <tr key={w.id} className="wb-table-row" style={{ transition: "background 0.12s var(--easeOut)" }}>
                      <td style={{ padding: "11px 12px", fontSize: 13, borderBottom: "1px solid var(--line)", color: "var(--ink)", fontWeight: 500 }}>{w.word}</td>
                      <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--line)" }}>
                        <span style={{ fontFamily: "var(--f-mono)", fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: LANG_COLORS[w.language] }}>
                          {LANG_LABELS[w.language]}
                        </span>
                      </td>
                      <td style={{ padding: "11px 12px", fontSize: 12.5, borderBottom: "1px solid var(--line)", color: "var(--ink-2)", maxWidth: "42ch" }}>{w.definition}</td>
                      <td style={{ padding: "11px 12px", fontSize: 11.5, borderBottom: "1px solid var(--line)", color: "var(--ink-3)", fontFamily: "var(--f-mono)", letterSpacing: "0.02em", whiteSpace: "nowrap" }}>
                        {new Date(w.nextReviewDate) <= new Date() ? "Now" : new Date(w.nextReviewDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </td>
                      <td style={{ padding: "11px 12px", fontSize: 11.5, borderBottom: "1px solid var(--line)", fontFamily: "var(--f-mono)", textAlign: "right", ...streakStyle(w.streak) }}>
                        🔥{w.streak}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>

        {/* ── RIGHT: Stats + Suggestions ───────────────────────────── */}
        <div>
          <div className="cc-card" style={{ marginBottom: 14 }}>
            <div className="cc-card-head"><div className="title">Stats</div><div className="tail">SRS health</div></div>

            {/* Due today stat */}
            <div className="cc-card-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 10, background: "rgba(255,255,255,0.015)" }}>
              <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-4)", fontWeight: 600, fontFamily: "var(--f-mono)" }}>Due today</div>
              <div className="grad-text" style={{ fontSize: 28, fontWeight: 300, letterSpacing: "-0.02em", marginTop: 6, fontFamily: "var(--f-mono)" }}>
                {reviewQueue.length} <span style={{ color: "var(--ink-4)", fontSize: 13 }}>items</span>
              </div>
              <div style={{ fontSize: 10.5, color: "var(--pos)", letterSpacing: "0.04em", marginTop: 4, fontFamily: "var(--f-mono)" }}>
                {cardIndex} done · {Math.max(0, reviewQueue.length - cardIndex)} remain
              </div>
            </div>

            {/* Total stat */}
            <div style={{ padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 10, background: "rgba(255,255,255,0.015)" }}>
              <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-4)", fontWeight: 600, fontFamily: "var(--f-mono)" }}>Total in bank</div>
              <div style={{ fontSize: 20, fontWeight: 400, letterSpacing: "-0.02em", marginTop: 6, fontFamily: "var(--f-mono)" }}>{allWords.length}</div>
              <div style={{ fontSize: 10.5, color: "var(--ink-4)", letterSpacing: "0.04em", marginTop: 4, fontFamily: "var(--f-mono)" }}>across 3 languages</div>
            </div>

            {/* Language mix bar */}
            <div style={{ padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 10, background: "rgba(255,255,255,0.015)" }}>
              <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-4)", fontWeight: 600, fontFamily: "var(--f-mono)", marginBottom: 8 }}>Language mix</div>
              <div style={{ display: "flex", gap: 3, height: 5, borderRadius: 99, overflow: "hidden", background: "rgba(255,255,255,0.04)" }}>
                {allWords.length > 0 && (
                  <>
                    <span style={{ display: "block", height: "100%", background: "#64FFDA", flex: langCounts.en, transition: "flex 0.3s var(--easeOut)" }} />
                    <span style={{ display: "block", height: "100%", background: "#7C4DFF", flex: langCounts.fr, transition: "flex 0.3s var(--easeOut)" }} />
                    <span style={{ display: "block", height: "100%", background: "#FFC15C", flex: langCounts.darija, transition: "flex 0.3s var(--easeOut)" }} />
                  </>
                )}
              </div>
              <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 10.5, color: "var(--ink-4)", letterSpacing: "0.02em", fontFamily: "var(--f-mono)" }}>
                <span><span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "99px", background: "#64FFDA", marginRight: 5, verticalAlign: "middle" }} />EN {langCounts.en}</span>
                <span><span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "99px", background: "#7C4DFF", marginRight: 5, verticalAlign: "middle" }} />FR {langCounts.fr}</span>
                <span><span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "99px", background: "#FFC15C", marginRight: 5, verticalAlign: "middle" }} />DA {langCounts.darija}</span>
              </div>
            </div>
            </div>
          </div>

          {/* Proactive suggestions */}
          <div className="cc-card" style={{ marginBottom: 14 }}>
            <div className="cc-card-head">
              <div className="title">Suggestions</div>
              <div className="tail" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {sugLoading ? (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite", color: "var(--ink-4)" }}><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                ) : (
                  <button
                    onClick={loadSuggestions}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-4)", padding: 0, display: "flex", fontSize: 10, letterSpacing: "0.06em" }}
                  >refresh</button>
                )}
                from news + library
              </div>
            </div>
            {sugLoading && (
              <div className="cc-card-body" style={{ fontSize: 12, color: "var(--ink-5)" }}>Scanning news + library…</div>
            )}
            {!sugLoading && suggestions.length === 0 && (
              <div className="cc-card-body" style={{ fontSize: 12, color: "var(--ink-5)" }}>
                No suggestions yet. Generate today&apos;s brief or add a book to Library.
              </div>
            )}
            {!sugLoading && suggestions.map((s, i) => (
              <div key={s.word} className="wb-sug-row" style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 16px",
                borderBottom: i < suggestions.length - 1 ? "1px solid var(--line)" : "none",
                transition: "background 0.12s var(--easeOut)",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)", letterSpacing: "-0.005em" }}>{s.word}</span>
                    <span style={{
                      fontSize: 8.5, letterSpacing: "0.14em", textTransform: "uppercase", fontFamily: "var(--f-mono)",
                      color: s.source === "news" ? "var(--cyan)" : "var(--violet)",
                      padding: "2px 6px", borderRadius: 99,
                      background: s.source === "news" ? "rgba(100,255,218,0.08)" : "rgba(124,77,255,0.08)",
                      border: `1px solid ${s.source === "news" ? "rgba(100,255,218,0.20)" : "rgba(124,77,255,0.20)"}`,
                    }}>{s.source}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.context}</div>
                </div>
                <button
                  onClick={() => quickAddSuggestion(s.word)}
                  disabled={addingSug === s.word}
                  style={{
                    flexShrink: 0, width: 26, height: 26,
                    border: addingSug === s.word ? "1px solid rgba(124,77,255,0.5)" : "1px solid var(--line-hi)",
                    borderRadius: 8,
                    background: addingSug === s.word ? "rgba(124,77,255,0.30)" : "rgba(255,255,255,0.03)",
                    cursor: addingSug === s.word ? "default" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: addingSug === s.word ? "transparent" : "var(--ink-3)",
                    transition: "all 0.15s",
                  }}
                  title="Add to word bank"
                >
                  {addingSug === s.word ? (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#E8E8F0" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                  ) : (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  )}
                </button>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* Add word modal */}
      {addOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(6,6,11,0.65)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={() => setAddOpen(false)}>
          <div style={{ width: 520, background: "var(--bg)", border: "1px solid var(--line-hi)", borderRadius: 16, padding: 28, boxShadow: "0 30px 80px rgba(0,0,0,0.5), 0 0 60px rgba(124,77,255,0.15)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 500, letterSpacing: "-0.01em" }}>Add new word</h3>
              <button className="cc-btn cc-btn-icon" onClick={() => setAddOpen(false)} style={{ width: 30, height: 30, padding: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 18 }}>Paste a word. Claude auto-generates definition + example.</div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600, marginBottom: 6 }}>Word</label>
              <input
                className="cc-input"
                value={newWord}
                onChange={(e) => setNewWord(e.target.value)}
                placeholder="e.g. obfuscate, flâner, zwina…"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleAddWord(); }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
              <button className="cc-btn" onClick={() => setAddOpen(false)}>Cancel</button>
              <button className="cc-btn cc-btn-primary" onClick={handleAddWord} disabled={addLoading || !newWord.trim()}>
                {addLoading ? "Adding…" : "Add to bank →"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
        .wb-grade-btn:hover { background: rgba(255,255,255,0.04) !important; transform: translateY(-1px); }
        .wb-grade-btn:active { transform: scale(0.97); }
        .wb-table-row:hover td { background: rgba(255,255,255,0.02); }
        .wb-lang-chip:hover { border-color: var(--line-hi) !important; color: var(--ink-2) !important; }
        .wb-sug-row:hover { background: rgba(255,255,255,0.02); }
        @media (max-width: 768px) { .wb-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </div>
  );
}
