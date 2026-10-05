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

/** One graded talk, light · the progress charts (2026-10-03). */
export type MindPoint = { date: string; part: MindPart; accuracy: number; structure: number; clarity: number; fillersPerMin: number; pauses: number; wpm: number };

export type MindToday = {
  today: string;
  callback: MindTopic | null;   // due today (or overdue), not yet recalled today
  newTopic: MindTopic | null;   // today's brief (null until written)
  done: { callback: MindSession | null; new: MindSession | null };
  weeks: MindWeek[];            // newest first, 10
  /** Every graded talk, oldest first, up to 60 · drives the progress graph and the analytics. */
  points: MindPoint[];
  topics: Pick<MindTopic, "id" | "title" | "domain" | "stage" | "nextDue" | "lastAccuracy" | "recalls" | "learnedAt">[];
  sttReady: boolean;            // DEEPGRAM_API_KEY present
  aiReady: boolean;             // ANTHROPIC_API_KEY present
};

/** Days until the next callback, by stage. After the 21-day one the topic is retired. */
export const INTERVALS = [1, 3, 7, 21];
export const MAX_SPEAK_SEC = 120;
export const PREP = ["Point · say it in one sentence", "Reason · why it is true", "Example · one concrete case", "Point · say it again"];
/** The reading timer can be stretched three times by 15 s (Ali 2026-10-03). */
export const READ_EXTRA_SEC = 15;
export const READ_EXTRA_MAX = 3;

/** Speaking tips from the numbers alone · the same numbers always give the same tips (2026-10-03). */
export function speakingTips(m: MindMetrics): string[] {
  const t: string[] = [];
  if (m.fillersPerMin >= 4) t.push(`${m.fillers} fillers in ${fmtSec(m.durationSec)}. Replace each "um" with a silent beat: close the mouth, breathe through the nose, then the next sentence. Silence sounds like thinking; "um" sounds like searching.`);
  else if (m.fillersPerMin >= 2) t.push(`${m.fillersPerMin} fillers a minute. Under 2 is clean. Finish each sentence with a full stop in your voice, pause, then start the next one.`);
  if (m.pauses >= 4) t.push(`${m.pauses} pauses over 1.5 s. Before pressing record, say the four PREP lines in your head once; a known route removes most long pauses.`);
  if (m.longestPauseSec >= 4) t.push(`One pause of ${m.longestPauseSec} s. When you lose the thread, repeat the point out loud ("so the point is…"), it restarts the argument.`);
  if (m.falseStarts >= 3) t.push(`${m.falseStarts} false starts. Slow the first word of each sentence; the restart usually comes from starting before the sentence is chosen.`);
  if (m.wpm > 175) t.push(`${m.wpm} words a minute is fast. Aim for 140 to 160: stress the key word of each sentence and let it land.`);
  else if (m.wpm > 0 && m.wpm < 110) t.push(`${m.wpm} words a minute is slow for a 2-minute explanation. Trust the structure and move on after the example.`);
  if (m.durationSec < 75) t.push(`Only ${fmtSec(m.durationSec)}. Use the whole two minutes: one more concrete example or one consequence fills the gap.`);
  if (!t.length) t.push("Clean delivery: few fillers, few pauses, a good pace. Next step is range: one number, one name and one consequence in every talk.");
  return t.slice(0, 3);
}

/** How to retain more, from what was missed · fixed techniques, picked by the gap (2026-10-03). */
export function retentionTips(recalled: string[], missed: string[], part: MindPart): string[] {
  const t: string[] = [];
  const total = recalled.length + missed.length;
  if (total && missed.length >= total / 2) t.push(part === "new"
    ? "Half the key facts went missing right after reading. Next time, close the brief and write the five Remember facts from memory before recording; what you cannot write, re-read once."
    : "Half the key facts are gone. Before the next callback, say the topic's five facts out loud once in the morning; a 30-second rehearsal the same day doubles what survives.");
  else if (missed.length) t.push(`${missed.length} fact${missed.length === 1 ? "" : "s"} missed. Tie each fact to a number or a name you already know (a date, a person, a place); facts with a hook survive, bare facts do not.`);
  if (part === "new") t.push("Explain it to someone today, even in two sentences. Teaching the same day is the strongest single move for keeping a new topic.");
  else t.push("Each callback that lands moves the topic to a longer gap (1, 3, 7, 21 days). Missing one is fine; the gap just stays where it was.");
  return t.slice(0, 2);
}

export const DOMAINS = ["AI and tech", "geopolitics and politics", "business", "philosophy", "science", "history", "economics"];
/**
 * The FOUNDER TRACK (Ali 2026-10-05: "fifty percent of the topics about startups, company topics,
 * business · closing, sales funnels · valuable later when I start my own startup or to understand
 * how a company works"). Every second brief comes from here, rotating through these domains.
 */
export const FOUNDER_DOMAINS = ["sales and closing", "marketing and growth", "product and users", "how a startup is built", "how a company works", "money in a company"];
export const isFounderDomain = (d: string) => FOUNDER_DOMAINS.includes(d);

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

/**
 * One-decimal resolution on the same anchors (Ali 2026-09-29: "so I can see progress even if it is 0.1").
 * This ADDS to the rubric, it does not reword it: an integer score means exactly what the anchor says,
 * the decimal is how far the talk sits toward the next anchor. Old integer scores stay comparable.
 */
export const SCORE_DECIMALS = `Give each score with ONE decimal (for example 3.4). The whole number is the highest anchor the talk fully meets; the decimal is how far it has moved toward the next anchor (.0 = just meets it, .5 = halfway, .9 = one small thing short of the next). Decide the whole number first from the anchors, then the decimal from the criteria only, never from mood.`;

/** Reading pace the brief timer assumes · a careful first read, not skimming. */
export const READ_WPM = 150;

/** Seconds allowed for reading a brief: its word count at READ_WPM, rounded up to a whole minute, 3–8 min. */
export function readSeconds(brief: string): number {
  const words = brief.split(/\s+/).filter(Boolean).length;
  return Math.max(180, Math.min(480, Math.ceil(words / READ_WPM) * 60));
}

export function fmtSec(s: number): string { return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`; }

export function isoWeekOf(date: string): string {
  const d = new Date(date + "T12:00:00Z");
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - first.getTime()) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
