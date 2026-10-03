/**
 * Daily news podcast (2026-09-08) · server only.
 *
 * Pipeline: ensure today's brief exists → Haiku writes the script as a friend
 * explaining the day (ONCE per day, cached in podcast_episodes.script across audio
 * retries; ~5 min guide, longer when the day earns it) → a deterministic date lint
 * (no "yesterday"/"last night" about events · see auditDates) →
 * Microsoft neural voice via msedge-tts (free, unofficial — can break; that's why
 * the app falls back to showing the script and keeps retrying) → MP3 base64 in Turso.
 *
 * Content order (Ali 2026-09-27): AI and tech first and deepest · business and ventures,
 * Morocco included when there is something real · geopolitics last. NO football in the
 * podcast (the News page keeps its highlights; `PODCAST_SKIP` filters the brief here).
 *
 * Why it sounded "AI-generated" (three attempts, all in the prompt): partly the writing
 * (the same three-beat shape for every story, a bridge sentence opening every chapter),
 * partly the voicing: the script was cut into ~380-character pieces voiced independently,
 * so the intonation reset every 25 seconds and there was no pause between thoughts.
 * Now: paragraphs are the unit (one thought each), each paragraph is voiced whole, half a
 * second of silence is spliced between two paragraphs, and the voice is a constant below
 * with the candidates.
 *
 * Since 2026-10-03 the same pipeline (`produceEpisode`) also makes the WEEKLY episode, keyed by
 * the ISO week ("2026-W40") instead of a date, from the weekly brief (news/weekly.ts) · 10-15
 * min, the main podcast now. The daily one keeps running (it costs nothing) behind a small
 * button on News, with a 30-day archive.
 *
 * Failure behaviour (Ali's explicit requirement, never a silent morning):
 *  · script exists but audio failed → the play card shows "voice is down · read it
 *    instead" with the full script, and every reminders tick between 06:30–10:30
 *    retries the audio (10-min spacing, max 8 attempts).
 *  · nothing at all → the card says so and offers the News tab.
 */

import { db } from "@/db";
import { noDash } from "@/lib/utils";
import { podcastEpisodes } from "@/db/schema";
import { and, eq, lt, desc, like, notLike } from "drizzle-orm";
import { checklistToday } from "@/lib/checklist/day";
import { ensureTodaysBrief } from "@/lib/news/generateBrief";
import type { NewsBrief } from "@/lib/news-brief";
import { isWeekKey, prettyRange, weeklyMaterials, type WeeklyBrief } from "@/lib/news/weekly";
import { askAI, lastAiError } from "@/lib/news/summarize";

// Free Microsoft voices worth hearing for a breakfast brief (Edge "Conversation" set):
//   en-US-BrianMultilingualNeural  · approachable, casual, sincere (the current one)
//   en-US-AndrewMultilingualNeural · warm, confident, the most "talking to you" of the set
//   en-GB-RyanNeural               · British, friendly, a little more formal
// Samples of the same paragraph were sent to Ali on 2026-09-27; change this one line to switch.
const VOICE = "en-US-BrianMultilingualNeural";
// A breath between two thoughts: 23 silent MPEG-2 Layer III frames (24 kHz · 48 kbps · mono ·
// exactly the format the voice returns; header ff f3 64 c4 + zero body = silence, 24 ms each,
// 552 ms in all). Edge's endpoint rejects SSML <break/>, so the pause is spliced in as audio.
// Same bitrate, so the byte → seconds mapping for chapters stays exact.
const SILENT_FRAME = Buffer.alloc(144);
Buffer.from([0xff, 0xf3, 0x64, 0xc4]).copy(SILENT_FRAME);
const PARAGRAPH_GAP = Buffer.concat(Array.from({ length: 23 }, () => SILENT_FRAME));
/** Brief categories that never reach the podcast (Ali 2026-09-27: football is News-only). */
const PODCAST_SKIP = new Set(["football"]);
/** The podcast's running order · the writer sees the stories grouped this way. */
const PODCAST_ORDER = ["ai", "tech", "business", "geopolitics", "other"];
// Ali (2026-09-11): slow the narration down slightly · SSML prosody rate, relative.
const SPEAKING_RATE = "-8%";
const MAX_ATTEMPTS = 8;
const RETRY_SPACING_MS = 10 * 60 * 1000;

export type Chapter = { title: string; startSec: number };

export type Episode = {
  date: string;
  status: "pending" | "ready" | "failed";
  script: string | null;
  audioUrl: string | null;
  attempts: number;
  chapters: Chapter[];
  durationSec: number | null;
  /** transient · last failure reason, for diagnostics only */
  lastError?: string;
  /** transient · relative day words still in the script after the date audit (should be []) */
  dateFlags?: string[];
};

const parseChaptersJson = (json: string | null): Chapter[] => {
  try { const v = JSON.parse(json ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
};

const rowToEpisode = (r: typeof podcastEpisodes.$inferSelect): Episode => ({
  date: r.date,
  status: (r.status as Episode["status"]) ?? "pending",
  script: r.script,
  audioUrl: r.audioUrl,
  attempts: r.attempts,
  chapters: parseChaptersJson(r.chapters),
  durationSec: r.durationSec ?? null,
});

/** The last N DAILY episodes (newest first), light shape · the News archive (30 days, Ali 2026-10-03). */
export async function recentEpisodes(userId: string, n = KEEP_EPISODES): Promise<Episode[]> {
  const rows = await db.select({
    date: podcastEpisodes.date, status: podcastEpisodes.status, script: podcastEpisodes.script,
    audioUrl: podcastEpisodes.audioUrl, attempts: podcastEpisodes.attempts,
    chapters: podcastEpisodes.chapters, durationSec: podcastEpisodes.durationSec,
  }).from(podcastEpisodes).where(and(eq(podcastEpisodes.userId, userId), notLike(podcastEpisodes.date, "%-W%"))).orderBy(desc(podcastEpisodes.date)).limit(n);
  return rows.map((row) => ({ date: row.date, status: (row.status as Episode["status"]) ?? "pending", script: row.script, audioUrl: row.audioUrl, attempts: row.attempts, chapters: parseChaptersJson(row.chapters), durationSec: row.durationSec ?? null }));
}

/** The weekly episodes (newest first), light shape. */
export async function weeklyEpisodes(userId: string, n = KEEP_WEEKLY): Promise<Episode[]> {
  const rows = await db.select({
    date: podcastEpisodes.date, status: podcastEpisodes.status, script: podcastEpisodes.script,
    audioUrl: podcastEpisodes.audioUrl, attempts: podcastEpisodes.attempts,
    chapters: podcastEpisodes.chapters, durationSec: podcastEpisodes.durationSec,
  }).from(podcastEpisodes).where(and(eq(podcastEpisodes.userId, userId), like(podcastEpisodes.date, "%-W%"))).orderBy(desc(podcastEpisodes.date)).limit(n);
  return rows.map((row) => ({ date: row.date, status: (row.status as Episode["status"]) ?? "pending", script: row.script, audioUrl: row.audioUrl, attempts: row.attempts, chapters: parseChaptersJson(row.chapters), durationSec: row.durationSec ?? null }));
}

/** Retention (Ali 2026-10-03: a 30-day archive): daily episodes stay 30 days with their audio;
 * the newest KEEP_WEEKLY weekly episodes stay. Older rows are deleted, audio included. */
export async function pruneEpisodes(userId: string): Promise<void> {
  const dayCutoff = new Date(Date.now() - KEEP_EPISODES * 86400_000).toISOString().slice(0, 10);
  await db.delete(podcastEpisodes).where(and(eq(podcastEpisodes.userId, userId), notLike(podcastEpisodes.date, "%-W%"), lt(podcastEpisodes.date, dayCutoff)));
  const weeks = await db.select({ date: podcastEpisodes.date }).from(podcastEpisodes)
    .where(and(eq(podcastEpisodes.userId, userId), like(podcastEpisodes.date, "%-W%"))).orderBy(desc(podcastEpisodes.date)).limit(KEEP_WEEKLY);
  if (weeks.length === KEEP_WEEKLY) {
    const oldest = weeks[weeks.length - 1].date;
    await db.delete(podcastEpisodes).where(and(eq(podcastEpisodes.userId, userId), like(podcastEpisodes.date, "%-W%"), lt(podcastEpisodes.date, oldest)));
  }
}

export async function todaysEpisode(userId: string, date = checklistToday()): Promise<Episode | null> {
  // Never select audio_b64 here · it's megabytes and this runs on every Today load.
  const [row] = await db.select({
    date: podcastEpisodes.date, status: podcastEpisodes.status, script: podcastEpisodes.script,
    audioUrl: podcastEpisodes.audioUrl, attempts: podcastEpisodes.attempts,
    chapters: podcastEpisodes.chapters, durationSec: podcastEpisodes.durationSec,
  }).from(podcastEpisodes)
    .where(and(eq(podcastEpisodes.userId, userId), eq(podcastEpisodes.date, date)));
  if (!row) return null;
  return { date: row.date, status: (row.status as Episode["status"]) ?? "pending", script: row.script, audioUrl: row.audioUrl, attempts: row.attempts, chapters: parseChaptersJson(row.chapters), durationSec: row.durationSec ?? null };
}

// ── Dates ─────────────────────────────────────────────────────────────────────
// ROOT CAUSE of the "yesterday" bug (Wed 9 + Thu 10 Sep 2026): the writer only saw
// a coarse relative age per story ("published 1 day(s) ago" covered anything from
// 24 to 36 hours), had no calendar at all, and story text written on Tuesday night
// says "tonight" / "last night" in its own frame. Haiku collapsed all of that into
// "yesterday". Fix: every story carries its absolute publish weekday + time, the
// prompt carries today's / yesterday's dates and forbids relative day words for
// events (weekdays only), and a deterministic lint re-checks the finished script.
const TZ = "Europe/Madrid";
const longDay = (d: Date) => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(d);
const weekdayTime = (d: Date) => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ }).format(d);

/** Relative day words the script must not use for events (the lint · case-insensitive). */
const RELATIVE_DAY_RE = /\b(yesterday|last night|this morning|earlier today|later today|tonight|this evening|this afternoon|overnight)\b/gi;
export const relativeDayWords = (script: string): string[] => {
  // The greeting line and the closing "For the day" chapter legitimately say
  // "this morning" · only the news body is checked.
  const body = script.replace(/^###\s*For the day[\s\S]*$/im, "").replace(/^Good morning[^\n]*$/im, "");
  const seen = new Set<string>();
  for (const m of body.matchAll(RELATIVE_DAY_RE)) seen.add(m[1].toLowerCase());
  return [...seen];
};

function dayContext(date: string) {
  const noon = new Date(`${date}T12:00:00Z`);
  const minus = (n: number) => new Date(noon.getTime() - n * 86400_000);
  return { today: longDay(noon), yesterday: longDay(minus(1)), dayBefore: longDay(minus(2)) };
}

/** Stories → the text block the writer (and the date auditor) see, with absolute publish stamps. */
function storiesBlock(brief: NewsBrief, max = 20): string {
  const now = Date.now();
  const stamp = (iso?: string) => {
    if (!iso) return "publish time unknown";
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "publish time unknown";
    const h = Math.max(0, Math.round((now - t) / 3600_000));
    return `published ${weekdayTime(new Date(t))} Madrid time · about ${h} hour${h === 1 ? "" : "s"} before this episode`;
  };
  const rank = (c: string) => { const i = PODCAST_ORDER.indexOf(c); return i < 0 ? PODCAST_ORDER.length : i; };
  return [...brief.stories]
    .filter((s) => !PODCAST_SKIP.has(s.category))
    .sort((a, b) => rank(a.category) - rank(b.category) || (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || (b.score ?? 0) - (a.score ?? 0))
    .slice(0, max)
    .map((s) => `[${s.category}${s.featured ? " · featured" : ""} · ${stamp(s.publishedAt)}]\n${s.headline}\n${s.summary}\n${(s.keyPoints ?? []).join(" · ")}`)
    .join("\n\n");
}

/** The script writer · Gemini (free) first, Haiku second (summarize.ts askAI); the failure reason rides in lastError. */
let lastHaikuError: string | null = null;
async function haiku(prompt: string, maxTokens: number): Promise<string | null> {
  const text = await askAI(prompt, maxTokens);
  lastHaikuError = text ? null : (lastAiError ?? "no answer");
  if (!text || text.length <= 200) { if (text) lastHaikuError = `short answer (${text.length} chars)`; return null; }
  return text;
}

// ── Length ────────────────────────────────────────────────────────────────────
// Ali (2026-09-11): five minutes is a guide, not a cap. Cover what matters, never
// pad, never truncate a story worth hearing. So: a wide sanity band instead of the
// old 4-6 min gate. Brian at the slower rate (-8 %) runs ≈ 160 words/min.
/** How many days of daily episodes stay reachable, audio included (Ali 2026-10-03: 30-day archive). */
export const KEEP_EPISODES = 30;
/** How many weekly episodes stay. */
export const KEEP_WEEKLY = 8;
const MIN_WORDS = 650;
const MAX_WORDS = 1550;
const MIN_SEC = 240;   // 4 min · below this the day was under-told
const MAX_SEC = 600;   // 10 min · above this it stops being a breakfast brief
const wordCount = (s: string) => s.replace(/^###.*$/gm, "").split(/\s+/).filter(Boolean).length;

const TONE_RULES = `HOW IT SOUNDS (Ali's brief, 2026-09-27 · "a friend explaining what's happening, something I actually want to listen to"):
- You are Ali's friend who follows this stuff closely, talking to him over breakfast. Not a presenter, not an anchor, not an explainer video. You talk the way people talk: contractions (it's, they've, that's), short sentences mixed with a longer one, the occasional one-word sentence. You may react in one honest line ("that's a lot of money", "I didn't expect that one") as long as the facts stay exactly what the stories say.
- Explain what happened, why, and what it means · but NEVER in the same shape twice in a row. Sometimes lead with the consequence, sometimes with the surprising detail, sometimes with the question Ali would ask. If two stories read like the same paragraph with the nouns swapped, rewrite one.
- Go deepest on "what it means": who gains, who loses, what changes next, what to watch. For AI and tech, this is where you spend your time. When the honest answer is "nobody knows yet", say what the two likely outcomes are.
- Explain names, places and terms in a few words the first time ("Enflame, a Chinese company that makes the chips AI runs on"). Assume he has the basics and none of the background.
- Plain words. No jargon, no business-speak: never "leverage", "headwinds", "stakeholders", "ecosystem", "calculus", "signals", "narrative", "paradigm", "unprecedented", "dynamics", "landscape", "pivotal", "game-changer", "underscores", "delve". A technical word you can't avoid: say it, then say what it means.
- Numbers for the ear ("two hundred million", "about a third", "roughly one in five").
- Zero filler. Every sentence carries a fact, a cause, a consequence or one honest reaction. Banned: "it's worth noting", "interestingly", "notably", "let's dive in", "stay tuned", "that's all for", "as always", "in other news", "moving on", "without further ado", "at the end of the day", "the bottom line is", "make no mistake", "time will tell", "remains to be seen", "one thing is clear", "buckle up", "so, to sum up". No teasers, no recaps, no sentence that only announces the next sentence, no rhetorical questions as padding.
- Changing subject: do it the way a person does, in half a sentence, and vary it ("Okay. Money." · "Closer to home for you now." · "Right, the world." · sometimes nothing at all, just the next story). Never the same bridge twice, never a bridge that describes the structure of the podcast.
- FORMAT FOR THE VOICE: write in SHORT PARAGRAPHS, one thought each (two to four sentences), separated by a blank line. The voice takes a breath at every blank line, so a new paragraph = a new thought. Punctuate for speech: commas where you would pause, a full stop where you would stop. No lists, no bullets, no headings besides the ### chapter lines.`

/** The one Haiku call of the day: brief → spoken script, split into titled chapters. */
async function writeScript(brief: NewsBrief, date: string): Promise<string | null> {
  const ctx = dayContext(date);
  const prompt = `You write Ali's private morning news podcast. He listens over breakfast at about 07:30 Madrid time. The whole point: give him a clear overview of what is going on in the world. Simple. Nothing cleverer than that.

ABOUT ALI (mention only when a story genuinely touches him): runs easypeasy, a small company teaching languages online; builds with AI every day and loves the tech; follows business and geopolitics; Moroccan, lives in Spain, interested in business opportunities in Morocco. Football is NOT part of this podcast, even if a story mentions it.

${TONE_RULES}

DATES AND TIMING — ABSOLUTE RULES (a past episode called a Tuesday match "yesterday" on a Thursday; that must never happen again):
- TODAY is ${ctx.today}. Yesterday was ${ctx.yesterday}. The day before was ${ctx.dayBefore}.
- Every story below shows WHEN IT WAS PUBLISHED (weekday, date, time). That is when the article was written, NOT necessarily when the event happened. An article written on Wednesday about a match can describe a Tuesday game.
- Words like "yesterday", "last night", "today", "this morning", "tonight" INSIDE a story's text are relative to that story's publish date, not to this morning. Translate them: a story published Wednesday that says "last night" means Tuesday night.
- When you say when something happened, NAME THE WEEKDAY: "on Tuesday night", "on Wednesday". Never use "yesterday", "last night", "this morning", "tonight" or "today" for events. The only "today" allowed is the greeting and the closing chapter.
- If you are not sure when something happened, leave the timing out. Never guess.
- Never present something that already happened as upcoming. Never invent results, numbers or facts that are not in the stories. If the stories do not say who won, do not say who won.

STRUCTURE — chapters, each starting with a line "### <short title>" (2-4 words), in THIS order:
1. Open: one warm good-morning line with the weekday and date, then straight into the biggest AI or tech story of the day. No preamble about what's coming.
2. "### AI and tech" (one or several chapters if the day is big): this is the heart of the podcast · go deepest here. Models, chips, companies, what people are building, what it means for someone who builds with these tools.
3. "### Business" (or a sharper title): companies, markets, money, ventures. When a story touches Morocco (investment, a company setting up there, an industry taking off, a rule changing) include it and say plainly why it could matter for someone who might do business there. Never invent a Moroccan angle when there isn't one.
4. "### The world": geopolitics, kept to what actually matters and why.
5. Last, "### For the day": two or three human sentences to start the day well, about the day itself, NOT about sales, work or productivity. Then a simple goodbye.
Skip trivial stories. Never a football story, never a football result, never a football chapter.

LENGTH: five minutes is the guide, not the cap. Aim for roughly 800-1000 words. Go longer, up to ${MAX_WORDS} words, when there are genuinely that many stories worth telling (five in AI and tech, three in business and three in the world is a real morning). Never pad a thin day; never cut a story worth hearing to fit. Under ${MIN_WORDS} words is too short.

Output ONLY the chapter lines and the spoken text. No markdown besides the ### lines, no stage directions.

THE STORIES:
${storiesBlock(brief)}`;
  return haiku(prompt, 3200);
}

/** The weekly podcast's script (2026-10-03) · the main podcast now: the previous week's developments
 * in the same three chapters as the written weekly brief, 10 to 15 minutes. */
async function writeWeeklyScript(brief: WeeklyBrief): Promise<string | null> {
  const prompt = `You write Ali's private WEEKLY news podcast. He listens on Monday, over breakfast or on a walk, for ten to fifteen minutes. The whole point: the developments of LAST WEEK (${prettyRange(brief.from, brief.to)}), in depth, in the order below, told by a friend who followed it all.

ABOUT ALI (mention only when a story genuinely touches him): runs easypeasy, a small company teaching languages online; builds with AI every day and loves the tech; follows business and geopolitics; Moroccan, lives in Spain, interested in business opportunities in Morocco. Football is NOT part of this podcast.

${TONE_RULES}

DATES: this is a look back at a whole week. Place events by WEEKDAY ("on Tuesday", "by Friday") or by "last week" · never "yesterday", "today", "tonight" or "this morning" for events. Never invent facts, numbers, names or outcomes that are not in the material below. When the material says nobody knows yet, say so.

STRUCTURE · chapters, each starting with a line "### <short title>" (2-4 words), in THIS order:
1. Open: one warm good-morning line naming the week, then straight into the biggest development of the week. No preamble about what is coming.
2. "### AI and tech" (one or several chapters): the heart of it · go deepest here, the week's arc, what it means for someone who builds with these tools.
3. "### Business": companies, markets, money, ventures · Morocco when the material has something real.
4. "### The world": geopolitics, what mattered and why.
5. Last, "### For the week": two or three human sentences for the week ahead, NOT about sales or productivity. Then a simple goodbye.

LENGTH: twelve minutes is the guide. Aim for 1800 to 2200 words; never under ${WEEKLY_MIN_WORDS}, never over ${WEEKLY_MAX_WORDS}. Every development in the material deserves real time · do not rush the later chapters.

Output ONLY the chapter lines and the spoken text. No markdown besides the ### lines, no stage directions.

THE WEEK'S BRIEF:
${weeklyMaterials(brief)}`;
  return haiku(prompt, 6000);
}
const WEEKLY_MIN_WORDS = 1500;
const WEEKLY_MAX_WORDS = 2600;
const WEEKLY_MIN_SEC = 420;    // 7 min · wide on purpose: a second voicing of a 15-min script would not fit the function run
const WEEKLY_MAX_SEC = 1200;   // 20 min

/**
 * Deterministic second line of defence: if the finished script still uses a
 * relative day word, one Haiku pass rewrites ONLY those time references into
 * weekdays (or removes them), using the stories' absolute publish stamps.
 */
async function auditDates(script: string, brief: NewsBrief, date: string): Promise<string | null> {
  const ctx = dayContext(date);
  const prompt = `You are checking a morning podcast script for date mistakes. TODAY is ${ctx.today}; yesterday was ${ctx.yesterday}; the day before was ${ctx.dayBefore}.

The script uses relative day words (yesterday, last night, this morning, tonight, this evening, overnight...) for events. That is forbidden: events must be placed by WEEKDAY ("on Tuesday night"), or the timing removed when unsure.

For every such phrase: work out the real day from the matching story below (its publish stamp is when the article was written; words like "last night" inside the story are relative to that publish date) and replace the phrase with the correct weekday. If you cannot be sure, delete the time reference. Leave the greeting and the closing "For the day" chapter alone. Change NOTHING else: same chapters, same "### Title" lines, same wording everywhere else. Output the full corrected script only.

THE STORIES:
${storiesBlock(brief)}

THE SCRIPT:
${script}`;
  const out = await haiku(prompt, 3400);
  return out && /^###/m.test(out) ? out : null;
}

/** Ask Haiku to stretch or trim an out-of-range script without touching facts or structure. */
async function reviseScriptLength(script: string, targetWords: number, band: [number, number] = [MIN_WORDS, MAX_WORDS]): Promise<string | null> {
  const [MIN_WORDS, MAX_WORDS] = band;
  const current = wordCount(script);
  const direction = current > targetWords
    ? "Trim it: cut the least important sentences and tighten wording. Never cut a whole chapter."
    : "Extend it: give the existing stories more of the plain-words explanation (what happened, why, what it means) already implied by the script's facts, or split a dense sentence into two. NEVER invent facts, names, numbers or outcomes that are not already in the script.";
  const prompt = `This podcast script is ${current} words; it must be about ${targetWords} words (hard range ${MIN_WORDS}-${MAX_WORDS}). ${direction}

Keep EXACTLY the same chapter structure and "### Title" lines, the same order, the same friend-over-breakfast tone, the short paragraphs separated by blank lines, the "For the day" closing last. Keep every weekday reference exactly as it is and do not introduce "yesterday", "last night" or "today" for events. Output only the revised script.

${script}`;
  const out = await haiku(prompt, 3400);
  return out && /^###/m.test(out) ? out : null;
}

/** The library drops the text into the SSML body as is · escape it, then add our own tags. */
const xmlEscape = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Paragraphs are the unit (one thought each, the writer is told so): every paragraph is
 * voiced whole, so the intonation runs through the thought. A paragraph over ~900
 * characters (≈ 55 s · what the service reliably finishes) is cut at sentence ends. Before
 * 2026-09-27 the script was cut every ~380 characters regardless of meaning and each cut
 * voiced on its own, so the intonation restarted mid-thought and nothing ever paused.
 */
function splitScript(script: string, max = 900): string[] {
  const sep = /\n\s*\n/.test(script) ? /\n\s*\n/ : /\n/;
  const paras = script.split(sep).map((p) => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
  const units: string[] = [];
  for (const p of paras) {
    if (p.length <= max) { units.push(p); continue; }
    let cur = "";
    for (const sentence of p.split(/(?<=[.!?])\s+/)) {
      if (cur && cur.length + sentence.length + 1 > max) { units.push(cur); cur = sentence; }
      else cur = cur ? `${cur} ${sentence}` : sentence;
    }
    if (cur) units.push(cur);
  }
  return units;
}

/** One piece (SSML body) → MP3 buffer. */
async function synthesizePiece(ssml: string): Promise<Buffer> {
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import("msedge-tts");
  const tts = new MsEdgeTTS();
  await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = await tts.toStream(ssml, { rate: SPEAKING_RATE });
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    const guard = setTimeout(() => reject(new Error("tts timeout")), 60_000);
    audioStream.on("data", (c: Buffer) => chunks.push(c));
    audioStream.on("end", () => { clearTimeout(guard); resolve(); });
    audioStream.on("close", () => { clearTimeout(guard); resolve(); });
    audioStream.on("error", (e: Error) => { clearTimeout(guard); reject(e); });
  });
  const buf = Buffer.concat(chunks);
  if (buf.length < 5_000) throw new Error(`piece too small (${buf.length} bytes)`);
  return buf;
}

/** The script's "### Title" lines split it into chapters; the titles are never spoken. */
function parseScriptChapters(script: string): { title: string; text: string }[] {
  const parts = script.split(/^###\s*(.+)$/m);
  // parts = [preamble, title1, text1, title2, text2, ...]
  const out: { title: string; text: string }[] = [];
  if (parts[0].trim()) out.push({ title: "Morning brief", text: parts[0].trim() });
  for (let i = 1; i < parts.length - 1; i += 2) {
    const text = (parts[i + 1] ?? "").trim();
    if (text) out.push({ title: parts[i].trim().slice(0, 40), text });
  }
  return out.length ? out : [{ title: "Morning brief", text: script.trim() }];
}

/** One paragraph per piece, 3 workers, one retry each (the service drops the occasional stream) · a breath between pieces. */
async function synthesizeText(text: string): Promise<Buffer> {
  const pieces = splitScript(text).map(xmlEscape);
  const buffers: Buffer[] = new Array(pieces.length);
  let i = 0;
  const worker = async () => {
    while (i < pieces.length) {
      const idx = i++;
      try { buffers[idx] = await synthesizePiece(pieces[idx]); }
      catch { buffers[idx] = await synthesizePiece(pieces[idx]); }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return Buffer.concat(buffers.flatMap((b, idx) => (idx ? [PARAGRAPH_GAP, b] : [b])));
}

const CBR_BYTES_PER_SEC = 6000; // 48 kbps constant-bitrate mono

/**
 * Script → MP3 + chapter start times. Each chapter is synthesized separately and the
 * constant bitrate makes byte offsets map linearly to seconds, so chapter markers
 * are exact without any audio analysis.
 */
async function synthesize(script: string): Promise<{ audio: Buffer; chapters: Chapter[]; durationSec: number }> {
  const parts = parseScriptChapters(script);
  const buffers: Buffer[] = [];
  const chapters: Chapter[] = [];
  let bytes = 0;
  for (const part of parts) {
    chapters.push({ title: part.title, startSec: Math.round(bytes / CBR_BYTES_PER_SEC) });
    const buf = await synthesizeText(part.text);
    buffers.push(buf);
    bytes += buf.length;
  }
  const audio = Buffer.concat(buffers);
  if (audio.length < 50_000) throw new Error(`suspiciously small audio (${audio.length} bytes)`);
  return { audio, chapters, durationSec: Math.round(audio.length / CBR_BYTES_PER_SEC) };
}

/**
 * Generate (or finish generating) today's episode. Idempotent; safe to call from
 * the cron, the reminders tick and the manual retry button. Returns the episode.
 */
export async function ensureTodaysPodcast(userId: string, force = false, rebuild = false): Promise<Episode> {
  const date = checklistToday();
  return produceEpisode(userId, date, {
    force, rebuild,
    write: async () => { const brief = await ensureTodaysBrief(userId); const script = await writeScript(brief, date); return script ? { script, brief } : null; },
    words: [MIN_WORDS, MAX_WORDS], seconds: [MIN_SEC, MAX_SEC],
  });
}

/** The WEEKLY episode (2026-10-03) · keyed by the week ("2026-W40"), same pipeline, longer bands. */
export async function ensureWeeklyPodcast(userId: string, brief: WeeklyBrief, force = false, rebuild = false): Promise<Episode> {
  return produceEpisode(userId, brief.week, {
    force, rebuild,
    write: async () => { const script = await writeWeeklyScript(brief); return script ? { script, brief: null } : null; },
    words: [WEEKLY_MIN_WORDS, WEEKLY_MAX_WORDS], seconds: [WEEKLY_MIN_SEC, WEEKLY_MAX_SEC],
  });
}

type Produce = {
  force: boolean; rebuild: boolean;
  /** Writes the script (once per key) · the daily writer also hands back its brief for the date audit. */
  write: () => Promise<{ script: string; brief: NewsBrief | null } | null>;
  words: [number, number]; seconds: [number, number];
};

/** One episode, by key (a date or a week): script once, then voice with retries · see the header. */
async function produceEpisode(userId: string, date: string, p: Produce): Promise<Episode> {
  const [minWords, maxWords] = p.words;
  const [minSec, maxSec] = p.seconds;
  let [row] = await db.select().from(podcastEpisodes)
    .where(and(eq(podcastEpisodes.userId, userId), eq(podcastEpisodes.date, date)));

  // rebuild (cron-only, manual) wipes the episode and regenerates from scratch ·
  // used when the script format or voice changes mid-day.
  if (p.rebuild && row) {
    await db.update(podcastEpisodes)
      .set({ script: null, audioB64: null, audioUrl: null, chapters: null, durationSec: null, status: "pending" })
      .where(eq(podcastEpisodes.id, row.id));
    [row] = await db.select().from(podcastEpisodes)
      .where(and(eq(podcastEpisodes.userId, userId), eq(podcastEpisodes.date, date)));
  }

  if (row?.status === "ready" && row.audioUrl) return rowToEpisode(row);
  if (!p.force && row && row.attempts >= MAX_ATTEMPTS) return rowToEpisode(row);
  if (!p.force && row?.lastAttemptAt && Date.now() - row.lastAttemptAt.getTime() < RETRY_SPACING_MS) return rowToEpisode(row);

  if (!row) {
    try {
      await db.insert(podcastEpisodes).values({ userId, date, status: "pending", attempts: 0 });
    } catch { /* raced with another tick · fine */ }
    [row] = await db.select().from(podcastEpisodes)
      .where(and(eq(podcastEpisodes.userId, userId), eq(podcastEpisodes.date, date)));
    if (!row) throw new Error("podcast row missing after insert");
  }
  await db.update(podcastEpisodes)
    .set({ attempts: row.attempts + 1, lastAttemptAt: new Date() })
    .where(eq(podcastEpisodes.id, row.id));

  // 1 · Script (once per key · this is the AI call).
  let script = row.script;
  if (!script) {
    const written = await p.write();
    if (!written) {
      await db.update(podcastEpisodes).set({ status: "failed" }).where(eq(podcastEpisodes.id, row.id));
      return { date, status: "failed", script: null, audioUrl: null, attempts: row.attempts + 1, chapters: [], durationSec: null, lastError: `script generation failed${lastHaikuError ? ` · ${lastHaikuError}` : ""}` };
    }
    script = written.script;
    // Date lint (the "yesterday" bug): relative day words about events → one
    // corrective pass with the absolute publish stamps, then re-check. Daily only.
    if (written.brief && relativeDayWords(script).length) {
      const fixed = await auditDates(script, written.brief, date);
      if (fixed) script = fixed;
    }
    // Length sanity band, BEFORE voicing: fix an out-of-range script, up to twice.
    for (let pass = 0; pass < 2; pass++) {
      const words = wordCount(script);
      if (words >= minWords && words <= maxWords) break;
      const revised = await reviseScriptLength(script, Math.round((minWords + maxWords) / 2), p.words);
      if (!revised) break; // reviser down · voice the original rather than ship nothing
      script = revised;
    }
    script = noDash(script); // the captions show the script · no em dashes anywhere on the hub
    await db.update(podcastEpisodes).set({ script }).where(eq(podcastEpisodes.id, row.id));
  }

  // 2 · Voice + store. The MP3 lives base64 in the DB (Ali's Vercel Blob store is
  // suspended; ~3 MB/day in Turso is free) and is served by /api/podcast/audio.
  try {
    let { audio, chapters, durationSec } = await synthesize(script);
    // Length band, AFTER voicing: the measured duration is the truth. If the
    // word estimate missed, revise toward the right length and voice once more.
    if (durationSec < minSec || durationSec > maxSec) {
      const mid = (minSec + maxSec) / 2;
      const targetWords = Math.min(maxWords - 50, Math.max(minWords + 50, Math.round(wordCount(script) * (mid / durationSec))));
      const revised = await reviseScriptLength(script, targetWords, p.words);
      if (revised) {
        try {
          const second = await synthesize(revised);
          // Keep whichever attempt is closer to the window.
          const miss = (x: number) => (x < minSec ? minSec - x : x > maxSec ? x - maxSec : 0);
          if (miss(second.durationSec) <= miss(durationSec)) {
            script = revised;
            ({ audio, chapters, durationSec } = second);
            await db.update(podcastEpisodes).set({ script }).where(eq(podcastEpisodes.id, row.id));
          }
        } catch { /* second voicing failed · ship the first */ }
      }
    }
    const audioUrl = `/api/podcast/audio?date=${date}`;
    try { await pruneEpisodes(userId); } catch { /* best-effort housekeeping */ }
    await db.update(podcastEpisodes)
      .set({ status: "ready", audioUrl, audioB64: audio.toString("base64"), chapters: JSON.stringify(chapters), durationSec })
      .where(eq(podcastEpisodes.id, row.id));
    return { date, status: "ready", script, audioUrl, attempts: row.attempts + 1, chapters, durationSec, dateFlags: isWeekKey(date) ? [] : relativeDayWords(script) };
  } catch (e) {
    await db.update(podcastEpisodes).set({ status: "failed" }).where(eq(podcastEpisodes.id, row.id));
    return { date, status: "failed", script, audioUrl: null, attempts: row.attempts + 1, chapters: [], durationSec: null, lastError: `audio: ${String((e as Error).message).slice(0, 150)}` };
  }
}
