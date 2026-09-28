/**
 * Mental Training (Train → Mind, Ali's ALAI spec 2026-09-27) · shapes and pure logic.
 *
 * A session (4 a week, ~20 min) = CALLBACK first (explain a past topic from memory,
 * 2 min recorded · spaced repetition 1 · 3 · 7 · 21 days), then a NEW TOPIC (read a
 * distilled brief 10–15 min, close it, speak 2 min from memory). One speaking
 * framework, PREP: Point · Reason · Example · Point. Objective metrics are computed
 * from the verbatim transcript; the three rubric scores use fixed wording that never
 * changes, so week 8 compares with week 1.
 */

export type MindPart = "callback" | "new";

export type MindTopic = {
  id: number;
  title: string;
  domain: string;
  hook: string;               // one line · why it matters
  brief: string;              // markdown, 10–15 min read
  keyFacts: string[];         // 4–6 facts the grader checks recall against
  createdAt: number;
  date: string;               // the day it was written for (YYYY-MM-DD)
  learnedAt: number | null;   // first "new topic" session done
  stage: number;              // 0..4 · index into INTERVALS; 4 = retired
  nextDue: string | null;     // next callback day
  lastAccuracy: number | null;
  recalls: number;
};

export type MindMetrics = {
  durationSec: number;
  words: number;              // spoken words, fillers excluded
  wpm: number;
  fillers: number;
  fillersPerMin: number;
  pauses: number;             // over 1.5 s
  longestPauseSec: number;
  falseStarts: number;        // immediate repeats and cut-off words
};

export type MindScores = { accuracy: number; structure: number; clarity: number };

export type MindSession = {
  id: number;
  date: string;
  part: MindPart;
  topicId: number;
  topicTitle: string;
  transcript: string;         // verbatim · pauses marked "[2.1 s]"
  metrics: MindMetrics;
  scores: MindScores;
  notes: string[];            // 2–3 specific, actionable
  recalled: string[];         // key facts the grader heard
  missed: string[];           // key facts absent or wrong
  createdAt: number;
};

export type MindWeek = { week: string; label: string; sessions: number; fillersPerMin: number | null; pauses: number | null; accuracy: number | null; structure: number | null; clarity: number | null };

export type MindToday = {
  today: string;
  callback: MindTopic | null;   // due today (or overdue), not yet recalled today
  newTopic: MindTopic | null;   // today's brief (null until written)
  done: { callback: MindSession | null; new: MindSession | null };
  weeks: MindWeek[];            // newest first, 10
  topics: Pick<MindTopic, "id" | "title" | "domain" | "stage" | "nextDue" | "lastAccuracy" | "recalls" | "learnedAt">[];
  sttReady: boolean;            // DEEPGRAM_API_KEY present
  aiReady: boolean;             // ANTHROPIC_API_KEY present
};

/** Days until the next callback, by stage. After the 21-day one the topic is retired. */
export const INTERVALS = [1, 3, 7, 21];
export const MAX_SPEAK_SEC = 120;
export const PREP = ["Point · say it in one sentence", "Reason · why it is true", "Example · one concrete case", "Point · say it again"];

export const DOMAINS = ["AI and tech", "geopolitics and politics", "business", "philosophy", "science", "history", "economics"];

export function addDays(date: string, n: number): string {
  const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Spaced repetition step after a callback graded `accuracy` (1–5): 4–5 moves on, 1–2 falls back one step, 3 repeats the step. */
export function nextStage(stage: number, accuracy: number, today: string): { stage: number; nextDue: string | null } {
  let s = stage;
  if (accuracy >= 4) s = Math.min(stage + 1, INTERVALS.length);
  else if (accuracy <= 2) s = Math.max(0, stage - 1);
  return { stage: s, nextDue: s >= INTERVALS.length ? null : addDays(today, INTERVALS[s]) };
}

// ── Transcript metrics ────────────────────────────────────────────────────────

export type Word = { word: string; start: number; end: number; text: string };

const FILLER = new Set(["um", "umm", "uh", "uhh", "er", "erm", "ah", "hmm", "hm", "mm", "mhm", "mhmm", "mm-mm", "uh-uh", "uh-huh", "nuh-uh", "huh"]);
const FILLER_PHRASES = [["you", "know"], ["i", "mean"], ["sort", "of"], ["kind", "of"]];
const norm = (w: string) => w.toLowerCase().replace(/[^a-z'-]/g, "");

/** Objective numbers from word-level timestamps · the same code every session, nothing judged. */
export function computeMetrics(words: Word[], durationSec: number): MindMetrics {
  const dur = Math.max(durationSec, words.length ? words[words.length - 1].end - words[0].start : 0, 1);
  let fillers = 0, falseStarts = 0, pauses = 0, longest = 0;
  const spoken = words.map((w) => norm(w.word));
  for (let i = 0; i < spoken.length; i++) {
    const w = spoken[i];
    if (FILLER.has(w)) { fillers++; continue; }
    if (i > 0 && FILLER_PHRASES.some(([a, b]) => spoken[i - 1] === a && w === b)) fillers++;
    if (/\w-$/.test(words[i].word)) falseStarts++;                       // "th-" · a cut-off word
    else if (i > 0 && w && w === spoken[i - 1] && !FILLER.has(w)) falseStarts++; // "the the"
    else if (i > 1 && w === spoken[i - 2] && spoken[i - 1] !== w && spoken[i + 1] === spoken[i - 1]) falseStarts++; // "I was I was"
    if (i > 0) {
      const gap = words[i].start - words[i - 1].end;
      if (gap > 1.5) pauses++;
      if (gap > longest) longest = gap;
    }
  }
  const spokenWords = Math.max(0, words.length - fillers);
  const min = dur / 60;
  return {
    durationSec: Math.round(dur), words: spokenWords, wpm: Math.round(spokenWords / min),
    fillers, fillersPerMin: Math.round((fillers / min) * 10) / 10,
    pauses, longestPauseSec: Math.round(longest * 10) / 10, falseStarts,
  };
}

/** Verbatim text with every pause over 1.5 s written in · "[2.3 s]". */
export function verbatim(words: Word[]): string {
  let out = "";
  for (let i = 0; i < words.length; i++) {
    if (i > 0) {
      const gap = words[i].start - words[i - 1].end;
      out += gap > 1.5 ? ` [${gap.toFixed(1)} s] ` : " ";
    }
    out += words[i].text || words[i].word;
  }
  return out.trim();
}

/** Fixed rubric wording · never edit between sessions, or old scores stop comparing. */
export const RUBRIC = `Score 1–5 on three fixed scales.
ACCURACY (retention) · how much of the brief the speaker recalled correctly, judged against the brief and its key facts only:
 1 = almost nothing, or mostly wrong · 2 = one or two facts, vague · 3 = the core idea and about half the key facts · 4 = the core idea, most key facts, minor slips · 5 = core idea, reasoning and nearly every key fact, no errors.
STRUCTURE (PREP) · did the talk follow Point → Reason → Example → Point:
 1 = no structure · 2 = a point, then wandering · 3 = point and reason, example or closing missing · 4 = all four, in order, one weak · 5 = all four, clear, the closing point restates the opening.
CLARITY · could a listener follow the argument:
 1 = lost · 2 = hard to follow · 3 = followable with effort · 4 = easy to follow · 5 = effortless, every sentence earns its place.`;

export function fmtSec(s: number): string { return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`; }

export function isoWeekOf(date: string): string {
  const d = new Date(date + "T12:00:00Z");
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - first.getTime()) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
