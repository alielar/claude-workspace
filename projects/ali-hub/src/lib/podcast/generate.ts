/**
 * Daily news podcast (2026-09-08) · server only.
 *
 * Pipeline: ensure today's brief exists → Haiku writes the script as a friend
 * explaining the day (ONCE per day, cached in podcast_episodes.script across audio
 * retries; ~5 min guide, longer when the day earns it) → a deterministic date lint
 * (no "yesterday"/"last night" about events · see auditDates) →
 * Microsoft neural voice via msedge-tts (free, unofficial — can break; that's why
 * the app falls back to showing the script and keeps retrying) → MP3 in Vercel Blob.
 *
 * Failure behaviour (Ali's explicit requirement, never a silent morning):
 *  · script exists but audio failed → the play card shows "voice is down · read it
 *    instead" with the full script, and every reminders tick between 06:30–10:30
 *    retries the audio (10-min spacing, max 8 attempts).
 *  · nothing at all → the card says so and offers the News tab.
 */

import { db } from "@/db";
import { podcastEpisodes } from "@/db/schema";
import { and, eq, lt } from "drizzle-orm";
import { checklistToday } from "@/lib/checklist/day";
import { ensureTodaysBrief } from "@/lib/news/generateBrief";
import type { NewsBrief } from "@/lib/news-brief";

// Brian: calm, low-key, sincere · early-morning listenable but still a serious news read.
const VOICE = "en-US-BrianMultilingualNeural";
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

export async function todaysEpisode(userId: string): Promise<Episode | null> {
  const date = checklistToday();
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
  return [...brief.stories]
    .sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || (b.score ?? 0) - (a.score ?? 0))
    .slice(0, max)
    .map((s) => `[${s.category}${s.featured ? " · featured" : ""} · ${stamp(s.publishedAt)}]\n${s.headline}\n${s.summary}\n${(s.keyPoints ?? []).join(" · ")}`)
    .join("\n\n");
}

async function haiku(prompt: string, maxTokens: number): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic();
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    });
    const text = (message.content[0] as { type: string; text: string }).text?.trim();
    return text && text.length > 200 ? text : null;
  } catch { return null; }
}

// ── Length ────────────────────────────────────────────────────────────────────
// Ali (2026-09-11): five minutes is a guide, not a cap. Cover what matters, never
// pad, never truncate a story worth hearing. So: a wide sanity band instead of the
// old 4-6 min gate. Brian at the slower rate (-8 %) runs ≈ 160 words/min.
const MIN_WORDS = 650;
const MAX_WORDS = 1550;
const MIN_SEC = 240;   // 4 min · below this the day was under-told
const MAX_SEC = 600;   // 10 min · above this it stops being a breakfast brief
const wordCount = (s: string) => s.replace(/^###.*$/gm, "").split(/\s+/).filter(Boolean).length;

const TONE_RULES = `TONE AND LANGUAGE (Ali's brief, 2026-09-11):
- You are a smart friend who follows the news closely, sitting across the breakfast table, explaining what is going on in the world to someone who has the basics but is NOT an expert in geopolitics, AI or finance. Friendly, transparent, plain words.
- Every story follows the same three beats in plain words: here is what happened · here is why it happened · here is what it means (for the world, for Europe, sometimes for Ali).
- Explain names, places and terms in a few words the first time ("Enflame, a Chinese company that makes the chips AI runs on"). Assume he does not know the background; give it in one or two sentences.
- Simple vocabulary. Short sentences. The words you would say out loud. No jargon and no business-speak: never "leverage", "headwinds", "stakeholders", "ecosystem", "calculus", "signals", "narrative", "paradigm", "unprecedented", "dynamics", "geopolitical landscape". If a technical word is unavoidable, say it, then say what it means.
- Numbers written for the ear ("two hundred million", "about a third"). No filler ("it's worth noting", "interestingly", "notably"). No headline-style teasers, no recaps.
- Transitions: when the topic changes, one natural linking sentence so it never feels like a jump ("That's the money side. Now to something closer to home for you: AI." · "Leaving politics for a moment..."). Every chapter after the first opens with such a bridge.`;

/** The one Haiku call of the day: brief → spoken script, split into titled chapters. */
async function writeScript(brief: NewsBrief, date: string): Promise<string | null> {
  const ctx = dayContext(date);
  const prompt = `You write Ali's private morning news podcast. He listens over breakfast at about 07:30 Madrid time. The whole point: give him a clear overview of what is going on in the world. Simple. Nothing cleverer than that.

ABOUT ALI (mention only when a story genuinely touches him): runs easypeasy, a small company teaching languages; loves AI and tech; follows business and geopolitics; follows Real Madrid and the Morocco national team.

${TONE_RULES}

DATES AND TIMING — ABSOLUTE RULES (a past episode called a Tuesday match "yesterday" on a Thursday; that must never happen again):
- TODAY is ${ctx.today}. Yesterday was ${ctx.yesterday}. The day before was ${ctx.dayBefore}.
- Every story below shows WHEN IT WAS PUBLISHED (weekday, date, time). That is when the article was written, NOT necessarily when the event happened. An article written on Wednesday about a match can describe a Tuesday game.
- Words like "yesterday", "last night", "today", "this morning", "tonight" INSIDE a story's text are relative to that story's publish date, not to this morning. Translate them: a story published Wednesday that says "last night" means Tuesday night.
- When you say when something happened, NAME THE WEEKDAY: "on Tuesday night", "on Wednesday". Never use "yesterday", "last night", "this morning", "tonight" or "today" for events. The only "today" allowed is the greeting and the closing chapter.
- If you are not sure when something happened, leave the timing out. Never guess.
- Never present something that already happened as upcoming. Never invent results, numbers or facts that are not in the stories. If the stories do not say who won, do not say who won.

STRUCTURE — chapters, each starting with a line "### <short title>" (2-4 words):
- First chapter: one warm good-morning line with the weekday and date, then straight into the most important story of the day (not football).
- Then chapters by theme (the world and politics, AI and tech, business and money, anything else that matters). Group related stories. Cover the stories that matter; skip the trivial ones.
- "### Football": Real Madrid and Morocco only, results and confirmed news, near the end and short.
- Last chapter, "### For the day": two or three sentences to start the day well. General and human, about the day itself, NOT about sales, work, clients or productivity. Then a simple goodbye.

LENGTH: five minutes is the guide, not the cap. Aim for roughly 800-1000 words. Go longer, up to ${MAX_WORDS} words, when there are genuinely that many stories worth telling (four in geopolitics and five in AI is a real morning). Never pad a thin day; never cut a story worth hearing to fit. Under ${MIN_WORDS} words is too short.

Output ONLY the chapter lines and the spoken text. No markdown besides the ### lines, no stage directions.

THE STORIES:
${storiesBlock(brief)}`;
  return haiku(prompt, 3200);
}

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
async function reviseScriptLength(script: string, targetWords: number): Promise<string | null> {
  const current = wordCount(script);
  const direction = current > targetWords
    ? "Trim it: cut the least important sentences and tighten wording. Never cut a whole chapter."
    : "Extend it: give the existing stories more of the plain-words explanation (what happened, why, what it means) already implied by the script's facts, or split a dense sentence into two. NEVER invent facts, names, numbers or outcomes that are not already in the script.";
  const prompt = `This podcast script is ${current} words; it must be about ${targetWords} words (hard range ${MIN_WORDS}-${MAX_WORDS}). ${direction}

Keep EXACTLY the same chapter structure and "### Title" lines, the same order, the same friendly plain-words tone, football near the end and short, the "For the day" closing last. Keep every weekday reference exactly as it is and do not introduce "yesterday", "last night" or "today" for events. Output only the revised script.

${script}`;
  const out = await haiku(prompt, 3400);
  return out && /^###/m.test(out) ? out : null;
}

/** Split on sentence ends into pieces the voice service reliably finishes (~1 min each). */
function splitScript(script: string, max = 380): string[] {
  const sentences = script.split(/(?<=[.!?])\s+/);
  const parts: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if (cur && cur.length + s.length + 1 > max) { parts.push(cur); cur = s; }
    else cur = cur ? `${cur} ${s}` : s;
  }
  if (cur) parts.push(cur);
  return parts;
}

/** One piece → MP3 buffer. */
async function synthesizePiece(text: string): Promise<Buffer> {
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import("msedge-tts");
  const tts = new MsEdgeTTS();
  await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = await tts.toStream(text, { rate: SPEAKING_RATE });
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

/** ~400-char pieces, 3 workers, one retry each (the service drops long/occasional streams). */
async function synthesizeText(text: string): Promise<Buffer> {
  const pieces = splitScript(text);
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
  return Buffer.concat(buffers);
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
  let [row] = await db.select().from(podcastEpisodes)
    .where(and(eq(podcastEpisodes.userId, userId), eq(podcastEpisodes.date, date)));

  // rebuild (cron-only, manual) wipes today's episode and regenerates from scratch ·
  // used when the script format or voice changes mid-day.
  if (rebuild && row) {
    await db.update(podcastEpisodes)
      .set({ script: null, audioB64: null, audioUrl: null, chapters: null, durationSec: null, status: "pending" })
      .where(eq(podcastEpisodes.id, row.id));
    [row] = await db.select().from(podcastEpisodes)
      .where(and(eq(podcastEpisodes.userId, userId), eq(podcastEpisodes.date, date)));
  }

  if (row?.status === "ready" && row.audioUrl) return rowToEpisode(row);
  if (!force && row && row.attempts >= MAX_ATTEMPTS) return rowToEpisode(row);
  if (!force && row?.lastAttemptAt && Date.now() - row.lastAttemptAt.getTime() < RETRY_SPACING_MS) return rowToEpisode(row);

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

  // 1 · Script (once per day · this is the daily AI call).
  let script = row.script;
  if (!script) {
    const brief = await ensureTodaysBrief(userId);
    script = await writeScript(brief, date);
    if (!script) {
      await db.update(podcastEpisodes).set({ status: "failed" }).where(eq(podcastEpisodes.id, row.id));
      return { date, status: "failed", script: null, audioUrl: null, attempts: row.attempts + 1, chapters: [], durationSec: null, lastError: "script generation failed" };
    }
    // Date lint (the "yesterday" bug): relative day words about events → one
    // corrective pass with the absolute publish stamps, then re-check.
    if (relativeDayWords(script).length) {
      const fixed = await auditDates(script, brief, date);
      if (fixed) script = fixed;
    }
    // Length sanity band, BEFORE voicing: fix an out-of-range script, up to twice.
    for (let pass = 0; pass < 2; pass++) {
      const words = wordCount(script);
      if (words >= MIN_WORDS && words <= MAX_WORDS) break;
      const revised = await reviseScriptLength(script, Math.round((MIN_WORDS + MAX_WORDS) / 2));
      if (!revised) break; // reviser down · voice the original rather than ship nothing
      script = revised;
    }
    await db.update(podcastEpisodes).set({ script }).where(eq(podcastEpisodes.id, row.id));
  }

  // 2 · Voice + store. The MP3 lives base64 in the DB (Ali's Vercel Blob store is
  // suspended; ~3 MB/day in Turso is free) and is served by /api/podcast/audio.
  try {
    let { audio, chapters, durationSec } = await synthesize(script);
    // Length band, AFTER voicing: the measured duration is the truth. If the
    // word estimate missed, revise toward the right length and voice once more.
    if (durationSec < MIN_SEC || durationSec > MAX_SEC) {
      const targetWords = Math.min(MAX_WORDS - 50, Math.max(MIN_WORDS + 50, Math.round(wordCount(script) * (360 / durationSec))));
      const revised = await reviseScriptLength(script, targetWords);
      if (revised) {
        try {
          const second = await synthesize(revised);
          // Keep whichever attempt is closer to the 4-10 min window.
          const miss = (s: number) => (s < MIN_SEC ? MIN_SEC - s : s > MAX_SEC ? s - MAX_SEC : 0);
          if (miss(second.durationSec) <= miss(durationSec)) {
            script = revised;
            ({ audio, chapters, durationSec } = second);
            await db.update(podcastEpisodes).set({ script }).where(eq(podcastEpisodes.id, row.id));
          }
        } catch { /* second voicing failed · ship the first */ }
      }
    }
    const audioUrl = `/api/podcast/audio?date=${date}`;
    await db.update(podcastEpisodes)
      .set({ status: "ready", audioUrl, audioB64: audio.toString("base64"), chapters: JSON.stringify(chapters), durationSec })
      .where(eq(podcastEpisodes.id, row.id));
    // Retention: audio survives 2 days (today + one late catch-up), then the ~3 MB
    // blob is dropped; the tiny script rows are removed entirely after 30 days.
    try {
      const audioCutoff = new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10);
      await db.update(podcastEpisodes).set({ audioB64: null }).where(lt(podcastEpisodes.date, audioCutoff));
      const rowCutoff = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
      await db.delete(podcastEpisodes).where(lt(podcastEpisodes.date, rowCutoff));
    } catch { /* pruning is best-effort */ }
    return { date, status: "ready", script, audioUrl, attempts: row.attempts + 1, chapters, durationSec, dateFlags: relativeDayWords(script) };
  } catch (e) {
    await db.update(podcastEpisodes).set({ status: "failed" }).where(eq(podcastEpisodes.id, row.id));
    return { date, status: "failed", script, audioUrl: null, attempts: row.attempts + 1, chapters: [], durationSec: null, lastError: `audio: ${String((e as Error).message).slice(0, 150)}` };
  }
}
