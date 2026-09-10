/**
 * Daily news podcast (2026-09-08) · server only.
 *
 * Pipeline: ensure today's brief exists → Haiku writes a tight, personal 5–10 min
 * script (ONCE per day, cached in podcast_episodes.script across audio retries) →
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

/** The one Haiku call of the day: brief → spoken script, split into titled chapters. */
async function writeScript(brief: NewsBrief, date: string): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const now = Date.now();
  const age = (iso?: string) => {
    if (!iso) return "publish time unknown";
    const h = Math.round((now - Date.parse(iso)) / 3600_000);
    return h <= 1 ? "published within the last hour" : h < 24 ? `published ${h} hours ago` : `published ${Math.round(h / 24)} day(s) ago`;
  };
  const stories = [...brief.stories]
    .sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 16)
    .map((s) => `[${s.category}${s.featured ? " · featured" : ""} · ${age(s.publishedAt)}] ${s.headline}\n${s.summary}\n${(s.keyPoints ?? []).join(" · ")}`)
    .join("\n\n");

  const day = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Madrid" }).format(new Date(`${date}T12:00:00Z`));

  const prompt = `You write Ali's private morning news podcast. He listens over breakfast at about 07:30 Madrid time, before a day of sales calls. Calm, precise, zero fluff.

ABOUT ALI (weave in naturally when a story has a real angle for him): runs easypeasy, a company teaching languages; deep into AI and tech; follows business and geopolitics; follows Real Madrid and the Morocco national team.

TODAY: ${day} morning. Every story below carries its publish age.

ACCURACY — ABSOLUTE RULES:
- Never present something that already happened as upcoming. If a story previews an event whose date/time has already passed by this morning, either skip it or, if another story carries the outcome, report the outcome.
- Never guess results or facts not in the stories. If the stories don't say who won, do not say who won.

STRUCTURE — output as chapters, each starting with a line "### <short chapter title>" (2-4 words):
- "### Top story" · the single most important non-football story, opened with one calm good-morning line and the date. 40-60 seconds.
- Then 3-5 chapters covering business, AI/tech, geopolitics and anything else important. Group related stories. This is the body: roughly four minutes ALL TOGETHER.
- "### Football" · LAST chapter, about 30 seconds only: Real Madrid and Morocco essentials, results and confirmed news only.
- End the football chapter with one short send-off line into his day.

LENGTH — HARD REQUIREMENT: the episode must run between 4 and 6 minutes spoken, which at this reading pace means 760-980 words total. Write inside that band. The way to use the budget is more stories told tightly, never one story padded. No filler phrases, no "it's worth noting", no throat-clearing, no recaps, no headlines-style teasers.

TONE: calm and steady for early morning, but serious - he is genuinely listening for the news. Dry warmth allowed, jokes rationed.

Plain spoken English, short sentences, numbers written for the ear. Output ONLY the chapter lines and script text. No markdown besides the ### chapter lines, no stage directions.

THE STORIES:
${stories}`;

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic();
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2200,
      messages: [{ role: "user", content: prompt }],
    });
    const text = (message.content[0] as { type: string; text: string }).text?.trim();
    return text && text.length > 200 ? text : null;
  } catch { return null; }
}

// ── 4-6 minute guard ─────────────────────────────────────────────────────────
// Ali's hard rule (2026-09-10): every episode runs 4:00-6:00, never outside.
// Enforced twice: on the script's word count BEFORE voicing (Brian measures at
// ~175 words/min on real episodes — 2026-09-10 calibration: 157 s and 229 s
// episodes both ≈ 17.5 chars/s — so 760-1000 words lands safely inside 4-6 min),
// and on the measured audio duration after voicing, with one revise-and-revoice
// if it still missed.
const MIN_WORDS = 760;
const MAX_WORDS = 1000;
const MIN_SEC = 240;
const MAX_SEC = 360;
const wordCount = (s: string) => s.replace(/^###.*$/gm, "").split(/\s+/).filter(Boolean).length;

/** Ask Haiku to stretch or trim an out-of-range script without touching facts or structure. */
async function reviseScriptLength(script: string, targetWords: number): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const current = wordCount(script);
  const direction = current > targetWords
    ? "Trim it: cut the least important sentences and tighten wording. Never cut a whole chapter."
    : "Extend it: give the existing stories more precise detail already implied by the script's facts, or split a dense sentence into two. NEVER invent facts, names, numbers or outcomes that are not already in the script.";
  const prompt = `This podcast script is ${current} words; it must be about ${targetWords} words (hard range ${MIN_WORDS}-${MAX_WORDS}). ${direction}

Keep EXACTLY the same chapter structure and "### Title" lines, the same order, the same tone, football last and short. Output only the revised script.

${script}`;
  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic();
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2600,
      messages: [{ role: "user", content: prompt }],
    });
    const text = (message.content[0] as { type: string; text: string }).text?.trim();
    return text && text.length > 200 && /^###/m.test(text) ? text : null;
  } catch { return null; }
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
  const { audioStream } = await tts.toStream(text);
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
    // 4-6 min gate, BEFORE voicing: fix an out-of-range script, up to twice.
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
    // 4-6 min gate, AFTER voicing: the measured duration is the truth. If the
    // word estimate missed, revise toward the right length and voice once more.
    if (durationSec < MIN_SEC || durationSec > MAX_SEC) {
      const targetWords = Math.min(MAX_WORDS - 30, Math.max(MIN_WORDS + 30, Math.round(wordCount(script) * (300 / durationSec))));
      const revised = await reviseScriptLength(script, targetWords);
      if (revised) {
        try {
          const second = await synthesize(revised);
          // Keep whichever attempt is closer to the 4-6 window.
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
    return { date, status: "ready", script, audioUrl, attempts: row.attempts + 1, chapters, durationSec };
  } catch (e) {
    await db.update(podcastEpisodes).set({ status: "failed" }).where(eq(podcastEpisodes.id, row.id));
    return { date, status: "failed", script, audioUrl: null, attempts: row.attempts + 1, chapters: [], durationSec: null, lastError: `audio: ${String((e as Error).message).slice(0, 150)}` };
  }
}
