/**
 * Mental Training · server side. Tables self-create (DDL also spread into the migrate
 * route). Three outside calls, each behind one function: the brief writer and the
 * grader (Anthropic, MIND_MODEL) and the transcriber (Deepgram, `filler_words=true`
 * so "um", "uh" and false starts survive · most speech-to-text strips them). Audio is
 * never stored: it is transcribed from the upload and dropped.
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { checklistToday } from "@/lib/checklist/day";
import { noDash } from "@/lib/utils";
import {
  DOMAINS, INTERVALS, READ_WPM, RUBRIC, SCORE_DECIMALS, addDays, computeMetrics, isoWeekOf, nextStage, verbatim,
  type MindMetrics, type MindPart, type MindScores, type MindSession, type MindToday, type MindTopic, type MindWeek, type Word,
} from "./types";

export const MIND_MODEL = "claude-haiku-4-5-20251001";

export const MIND_DDL = [
  `CREATE TABLE IF NOT EXISTS mind_topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL, title TEXT NOT NULL, domain TEXT NOT NULL, hook TEXT NOT NULL DEFAULT '',
    brief TEXT NOT NULL, key_facts TEXT NOT NULL DEFAULT '[]',
    learned_at INTEGER, stage INTEGER NOT NULL DEFAULT 0, next_due TEXT, last_accuracy INTEGER, recalls INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000))`,
  `CREATE TABLE IF NOT EXISTS mind_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL, part TEXT NOT NULL, topic_id INTEGER NOT NULL,
    transcript TEXT NOT NULL, metrics TEXT NOT NULL, scores TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '[]',
    recalled TEXT NOT NULL DEFAULT '[]', missed TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000))`,
];

let ready: Promise<void> | null = null;
export function ensureMindTables(): Promise<void> {
  ready ??= (async () => { for (const ddl of MIND_DDL) { try { await db.run(sql.raw(ddl)); } catch { /* exists */ } } })();
  return ready;
}

type TopicRow = { id: number; date: string; title: string; domain: string; hook: string; brief: string; key_facts: string; learned_at: number | null; stage: number; next_due: string | null; last_accuracy: number | null; recalls: number; created_at: number };
type SessionRow = { id: number; date: string; part: MindPart; topic_id: number; transcript: string; metrics: string; scores: string; notes: string; recalled: string; missed: string; created_at: number; title?: string };

const J = <T,>(s: string, fallback: T): T => { try { return JSON.parse(s) as T; } catch { return fallback; } };
const topicOf = (r: TopicRow): MindTopic => ({
  id: r.id, title: r.title, domain: r.domain, hook: r.hook, brief: r.brief, keyFacts: J<string[]>(r.key_facts, []),
  createdAt: r.created_at, date: r.date, learnedAt: r.learned_at, stage: r.stage, nextDue: r.next_due, lastAccuracy: r.last_accuracy, recalls: r.recalls,
});
const sessionOf = (r: SessionRow): MindSession => ({
  id: r.id, date: r.date, part: r.part, topicId: r.topic_id, topicTitle: r.title ?? "", transcript: r.transcript,
  metrics: J<MindMetrics>(r.metrics, { durationSec: 0, words: 0, wpm: 0, fillers: 0, fillersPerMin: 0, pauses: 0, longestPauseSec: 0, falseStarts: 0 }),
  scores: J<MindScores>(r.scores, { accuracy: 0, structure: 0, clarity: 0 }), notes: J<string[]>(r.notes, []), recalled: J<string[]>(r.recalled, []), missed: J<string[]>(r.missed, []), createdAt: r.created_at,
});

// ── Anthropic ─────────────────────────────────────────────────────────────────

async function ask(prompt: string, maxTokens: number): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic();
    const m = await client.messages.create({ model: MIND_MODEL, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] });
    return (m.content[0] as { type: string; text: string }).text?.trim() ?? null;
  } catch { return null; }
}

function jsonIn<T>(text: string | null): T | null {
  if (!text) return null;
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) return null;
  try { return JSON.parse(m[0]) as T; } catch { return null; }
}

/** The three kinds of topic, rotated in turn (Ali 2026-09-29: "either up to date, or a landmark in history, or a concept everyone should get · not the 2019 scaling law"). */
const KINDS = [
  { name: "CURRENT", rule: "something that happened or came to a head in the last one or two months, that people are deciding, arguing about or building right now · when the news list above fits the domain, take the idea behind one of those stories." },
  { name: "LANDMARK", rule: "a turning point in the history of this field that changed how the world works · an event, a discovery, a decision, a person's idea (the printing press, Bretton Woods, the discovery of DNA, the first web browser, the fall of the Berlin Wall) · explained for its meaning, not its dates." },
  { name: "CONCEPT", rule: "a famous idea an educated person is expected to understand and usually cannot explain · relativity, compound interest, natural selection, game theory, the separation of powers, supply and demand, the categorical imperative · make him able to explain it at dinner." },
];

/** Which news categories feed a Mind domain · the brief is about the idea behind a story, not the story. */
const NEWS_FOR_DOMAIN: Record<string, string[]> = {
  "AI and tech": ["tech", "ai"],
  "geopolitics and politics": ["geopolitics"],
  business: ["business"],
  economics: ["business", "geopolitics"],
};

/** The last three days of A L I's own news brief, reduced to headline + summary · what is actually going on right now. */
async function recentStories(userId: string, date: string, domain: string): Promise<string[]> {
  const cats = NEWS_FOR_DOMAIN[domain];
  if (!cats) return [];
  const rows = await db.all<{ content: string }>(sql`SELECT content FROM news_briefs WHERE user_id = ${userId} AND date >= ${addDays(date, -3)} ORDER BY date DESC LIMIT 3`).catch(() => []);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const stories = J<{ stories?: { headline?: string; summary?: string; category?: string }[] }>(r.content, {}).stories ?? [];
    for (const s of stories) {
      if (!s.headline || !cats.includes(String(s.category ?? "")) || seen.has(s.headline)) continue;
      seen.add(s.headline);
      out.push(`${s.headline}${s.summary ? ` · ${s.summary.slice(0, 220)}` : ""}`);
      if (out.length >= 12) return out;
    }
  }
  return out;
}

/**
 * Write today's brief · the curriculum rotates domains, never repeats a title, and (Ali 2026-09-29)
 * takes its AI/tech, politics and business ideas from what is in his news RIGHT NOW rather than
 * from the model's memory (which handed him GPT-2-era scaling laws). Short, fixed shape, plain words.
 */
export async function writeTopic(userId: string, date: string): Promise<MindTopic | null> {
  await ensureMindTables();
  const past = await db.all<{ title: string; domain: string }>(sql`SELECT title, domain FROM mind_topics WHERE user_id = ${userId} ORDER BY id DESC LIMIT 60`);
  const recentDomains = past.slice(0, DOMAINS.length - 1).map((p) => p.domain);
  const domain = DOMAINS.find((d) => !recentDomains.includes(d)) ?? DOMAINS[past.length % DOMAINS.length];
  const news = await recentStories(userId, date, domain);
  // Rotate the kind of topic (Ali 2026-09-29): something from the last months · a landmark idea or
  // event of the field · a well-known concept. Never a niche milestone.
  const kind = past.length % KINDS.length;
  const prompt = `You write one short brief for Ali, who trains his memory and his speaking on it. He is curious and sharp but NOT an expert in any of these fields. He reads the brief ONCE against a timer of about ${Math.ceil(700 / READ_WPM)} minutes, closes it, then explains the idea aloud for 2 minutes from memory and is graded on what he recalled.

Today is ${date}. Today's domain: ${domain}.
${news.length ? `IN HIS NEWS RIGHT NOW (for a CURRENT topic, prefer the idea behind one of these · the brief is about the IDEA, not the news item):\n${news.map((n) => `- ${n}`).join("\n")}\n` : ""}
Already covered (never repeat, build on one when it fits): ${past.length ? past.map((p) => `${p.title} (${p.domain})`).join("; ") : "none yet"}.

Choose ONE topic of ${KINDS[kind].name} kind: ${KINDS[kind].rule}
The test for any topic: a well-read person would recognise it and be glad to explain it well. NEVER a niche milestone of a field (a 2019 research paper, a version of a product, a benchmark) · that is trivia, not understanding.

Write it the way a sharp friend explains it over coffee: concepts, why, what follows. Plain words only · every technical term is replaced by what it means, or dropped. A number only when one number carries the point. No names of papers, no model version numbers, no acronyms he will never say again. Never an em dash: commas and full stops only.

600–800 words, markdown, EXACTLY these five sections in this order:
## The idea · what it is, in two or three sentences
## How it works · the mechanism, with one everyday analogy
## Why it matters · who it changes, what follows, what it costs
## The argument · the strongest case for it and the strongest case against, one short paragraph each
## Remember · five short lines: the facts a good recall must contain

Answer with JSON only, in exactly this shape:
{"title": "...", "hook": "one line on why this matters to Ali", "brief": "the markdown", "keyFacts": ["the same five Remember lines, each one checkable"]}`;
  const out = jsonIn<{ title: string; hook: string; brief: string; keyFacts: string[] }>(await ask(prompt, 2600));
  if (!out || !out.title || !out.brief || out.brief.length < 1800) return null;
  const facts = Array.isArray(out.keyFacts) ? out.keyFacts.filter((f) => typeof f === "string").map(noDash).slice(0, 6) : [];
  const res = await db.run(sql`INSERT INTO mind_topics (user_id, date, title, domain, hook, brief, key_facts) VALUES (${userId}, ${date}, ${noDash(out.title).slice(0, 200)}, ${domain}, ${noDash(String(out.hook ?? "")).slice(0, 300)}, ${noDash(out.brief)}, ${JSON.stringify(facts)})`);
  const [row] = await db.all<TopicRow>(sql`SELECT * FROM mind_topics WHERE id = ${Number(res.lastInsertRowid)}`);
  return row ? topicOf(row) : null;
}

/** Remove the waiting brief (never read to the end: no session on it) so another can be written. */
export async function dropPendingTopic(userId: string): Promise<void> {
  await ensureMindTables();
  await db.run(sql`DELETE FROM mind_topics WHERE user_id = ${userId} AND learned_at IS NULL AND id NOT IN (SELECT topic_id FROM mind_sessions WHERE user_id = ${userId})`);
}

// ── Deepgram ──────────────────────────────────────────────────────────────────

export function sttReady(): boolean { return !!process.env.DEEPGRAM_API_KEY; }

/** Verbatim transcription with word timestamps · fillers kept on purpose. */
export async function transcribe(audio: ArrayBuffer, mime: string): Promise<{ words: Word[]; durationSec: number } | { error: string }> {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) return { error: "Speech-to-text is not connected · DEEPGRAM_API_KEY missing" };
  const url = "https://api.deepgram.com/v1/listen?model=nova-3&language=en&filler_words=true&punctuate=true&smart_format=false&numerals=false";
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { Authorization: `Token ${key}`, "Content-Type": mime || "audio/mp4" }, body: audio, signal: AbortSignal.timeout(55_000) });
  } catch (e) { return { error: `Transcription failed · ${String((e as Error)?.message ?? e).slice(0, 120)}` }; }
  if (!res.ok) return { error: `Transcription refused · ${res.status} ${(await res.text().catch(() => "")).slice(0, 160)}` };
  const j = (await res.json()) as { metadata?: { duration?: number }; results?: { channels?: { alternatives?: { words?: { word: string; start: number; end: number; punctuated_word?: string }[] }[] }[] } };
  const raw = j.results?.channels?.[0]?.alternatives?.[0]?.words ?? [];
  const words: Word[] = raw.map((w) => ({ word: w.word, start: w.start, end: w.end, text: w.punctuated_word ?? w.word }));
  return { words, durationSec: Number(j.metadata?.duration ?? 0) };
}

// ── Grading ───────────────────────────────────────────────────────────────────

async function grade(topic: MindTopic, transcript: string, metrics: MindMetrics): Promise<{ scores: MindScores; notes: string[]; recalled: string[]; missed: string[] } | null> {
  const prompt = `You grade one 2-minute spoken recall for Ali's mental training. Be strict and consistent: the same talk must get the same scores next month. Judge ACCURACY only against the brief and key facts below · never reward things that are not in them. Generic praise is worthless; every note must name something specific from the transcript and say what to do next time. No em dashes in the notes.

${RUBRIC}

${SCORE_DECIMALS}

THE BRIEF
${topic.brief.slice(0, 9000)}

KEY FACTS
${topic.keyFacts.map((f, i) => `${i + 1}. ${f}`).join("\n")}

MEASURED (do not re-judge these · use them in a note only if they matter): ${metrics.words} words · ${metrics.wpm} wpm · ${metrics.fillers} fillers (${metrics.fillersPerMin}/min) · ${metrics.pauses} pauses over 1.5 s · ${metrics.falseStarts} false starts.

VERBATIM TRANSCRIPT (fillers and pauses kept, "[2.1 s]" = a pause)
${transcript.slice(0, 6000)}

Answer with JSON only: {"accuracy": 1.0-5.0, "structure": 1.0-5.0, "clarity": 1.0-5.0, "recalled": ["key facts he got, quoted from the list"], "missed": ["key facts absent or wrong"], "notes": ["2 or 3 specific, actionable notes"]}`;
  const out = jsonIn<{ accuracy: number; structure: number; clarity: number; recalled: string[]; missed: string[]; notes: string[] }>(await ask(prompt, 900));
  if (!out) return null;
  const clamp = (n: unknown) => Math.max(1, Math.min(5, Math.round((Number(n) || 1) * 10) / 10));
  const strs = (v: unknown, n: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map(noDash).slice(0, n) : []);
  return { scores: { accuracy: clamp(out.accuracy), structure: clamp(out.structure), clarity: clamp(out.clarity) }, notes: strs(out.notes, 3), recalled: strs(out.recalled, 8), missed: strs(out.missed, 8) };
}

/** One recording → transcript, metrics, grades, stored session, topic schedule moved on. */
export async function gradeRecording(userId: string, part: MindPart, topicId: number, audio: ArrayBuffer, mime: string): Promise<MindSession | { error: string }> {
  await ensureMindTables();
  const [t] = await db.all<TopicRow>(sql`SELECT * FROM mind_topics WHERE id = ${topicId} AND user_id = ${userId}`);
  if (!t) return { error: "topic not found" };
  const topic = topicOf(t);
  const tr = await transcribe(audio, mime);
  if ("error" in tr) return tr;
  if (tr.words.length < 5) return { error: "Nothing heard · the recording came back almost empty" };
  const metrics = computeMetrics(tr.words, tr.durationSec);
  const transcript = verbatim(tr.words);
  const g = await grade(topic, transcript, metrics);
  if (!g) return { error: "Grading failed · the AI did not answer" };
  const today = checklistToday();
  const res = await db.run(sql`INSERT INTO mind_sessions (user_id, date, part, topic_id, transcript, metrics, scores, notes, recalled, missed)
    VALUES (${userId}, ${today}, ${part}, ${topicId}, ${transcript}, ${JSON.stringify(metrics)}, ${JSON.stringify(g.scores)}, ${JSON.stringify(g.notes)}, ${JSON.stringify(g.recalled)}, ${JSON.stringify(g.missed)})`);
  if (part === "new") {
    // First recall right after reading · the first callback comes tomorrow.
    await db.run(sql`UPDATE mind_topics SET learned_at = ${Date.now()}, stage = 0, next_due = ${addDays(today, INTERVALS[0])}, last_accuracy = ${g.scores.accuracy} WHERE id = ${topicId}`);
  } else {
    const step = nextStage(topic.stage, g.scores.accuracy, today);
    await db.run(sql`UPDATE mind_topics SET stage = ${step.stage}, next_due = ${step.nextDue}, last_accuracy = ${g.scores.accuracy}, recalls = recalls + 1 WHERE id = ${topicId}`);
  }
  const [row] = await db.all<SessionRow>(sql`SELECT s.*, t.title FROM mind_sessions s JOIN mind_topics t ON t.id = s.topic_id WHERE s.id = ${Number(res.lastInsertRowid)}`);
  return sessionOf(row);
}

// ── The day ───────────────────────────────────────────────────────────────────

export async function mindToday(userId: string, make: boolean): Promise<MindToday> {
  await ensureMindTables();
  const today = checklistToday();
  let [todays] = await db.all<TopicRow>(sql`SELECT * FROM mind_topics WHERE user_id = ${userId} AND learned_at IS NULL ORDER BY id DESC LIMIT 1`);
  if (!todays && make) { const t = await writeTopic(userId, today); if (t) [todays] = await db.all<TopicRow>(sql`SELECT * FROM mind_topics WHERE id = ${t.id}`); }
  const doneRows = await db.all<SessionRow>(sql`SELECT s.*, t.title FROM mind_sessions s JOIN mind_topics t ON t.id = s.topic_id WHERE s.user_id = ${userId} AND s.date = ${today} ORDER BY s.id DESC`);
  const done = { callback: doneRows.find((r) => r.part === "callback") ?? null, new: doneRows.find((r) => r.part === "new") ?? null };
  const [due] = done.callback ? [] : await db.all<TopicRow>(sql`SELECT * FROM mind_topics WHERE user_id = ${userId} AND learned_at IS NOT NULL AND next_due IS NOT NULL AND next_due <= ${today} ORDER BY next_due ASC, id ASC LIMIT 1`);
  const all = await db.all<TopicRow>(sql`SELECT * FROM mind_topics WHERE user_id = ${userId} AND learned_at IS NOT NULL ORDER BY id DESC LIMIT 60`);
  const sessions = await db.all<SessionRow>(sql`SELECT s.*, t.title FROM mind_sessions s JOIN mind_topics t ON t.id = s.topic_id WHERE s.user_id = ${userId} ORDER BY s.id DESC LIMIT 200`);
  return {
    today,
    callback: due ? topicOf(due) : null,
    newTopic: todays ? topicOf(todays) : null,
    done: { callback: done.callback ? sessionOf(done.callback) : null, new: done.new ? sessionOf(done.new) : null },
    weeks: weekly(sessions.map(sessionOf)),
    topics: all.map((r) => { const t = topicOf(r); return { id: t.id, title: t.title, domain: t.domain, stage: t.stage, nextDue: t.nextDue, lastAccuracy: t.lastAccuracy, recalls: t.recalls, learnedAt: t.learnedAt }; }),
    sttReady: sttReady(),
    aiReady: !!process.env.ANTHROPIC_API_KEY,
  };
}

function weekly(sessions: MindSession[]): MindWeek[] {
  const by = new Map<string, MindSession[]>();
  for (const s of sessions) (by.get(isoWeekOf(s.date)) ?? by.set(isoWeekOf(s.date), []).get(isoWeekOf(s.date))!).push(s);
  const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  return [...by.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 10).map(([week, ss]) => {
    const cb = ss.filter((s) => s.part === "callback");
    const first = ss[ss.length - 1].date;
    return {
      week, label: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(first + "T12:00:00")).replace(/(\w{3})\w*$/, "$1"),
      sessions: new Set(ss.map((s) => s.date)).size,
      fillersPerMin: mean(ss.map((s) => s.metrics.fillersPerMin)), pauses: mean(ss.map((s) => s.metrics.pauses)),
      accuracy: mean(cb.map((s) => s.scores.accuracy)), structure: mean(ss.map((s) => s.scores.structure)), clarity: mean(ss.map((s) => s.scores.clarity)),
    };
  });
}

/** Called by the 5-minute tick from 05:00: writes today's brief once on a session day, so it is ready before Ali opens the app. */
export async function prewriteIfSessionDay(userId: string): Promise<void> {
  await ensureMindTables();
  const today = checklistToday();
  const dow = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date(today + "T12:00:00").getDay()];
  const [row] = await db.all<{ weekdays: string | null }>(sql`SELECT weekdays FROM checklist_items WHERE user_id = ${userId} AND routine_key = 'mind' AND deleted_at IS NULL LIMIT 1`).catch(() => []);
  const days = row?.weekdays ? J<string[]>(row.weekdays, []) : ["mon", "tue", "thu", "fri"];
  if (!days.includes(dow)) return;
  const [pending] = await db.all<{ id: number }>(sql`SELECT id FROM mind_topics WHERE user_id = ${userId} AND learned_at IS NULL LIMIT 1`);
  if (!pending) await writeTopic(userId, today);
}
