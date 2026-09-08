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
import { and, eq } from "drizzle-orm";
import { checklistToday } from "@/lib/checklist/day";
import { ensureTodaysBrief } from "@/lib/news/generateBrief";
import type { NewsBrief } from "@/lib/news-brief";

const VOICE = "en-US-AndrewMultilingualNeural";
const MAX_ATTEMPTS = 8;
const RETRY_SPACING_MS = 10 * 60 * 1000;

export type Episode = {
  date: string;
  status: "pending" | "ready" | "failed";
  script: string | null;
  audioUrl: string | null;
  attempts: number;
};

const rowToEpisode = (r: typeof podcastEpisodes.$inferSelect): Episode => ({
  date: r.date,
  status: (r.status as Episode["status"]) ?? "pending",
  script: r.script,
  audioUrl: r.audioUrl,
  attempts: r.attempts,
});

export async function todaysEpisode(userId: string): Promise<Episode | null> {
  const date = checklistToday();
  const [row] = await db.select().from(podcastEpisodes)
    .where(and(eq(podcastEpisodes.userId, userId), eq(podcastEpisodes.date, date)));
  return row ? rowToEpisode(row) : null;
}

/** The one Haiku call of the day: brief → spoken script. */
async function writeScript(brief: NewsBrief, date: string): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const stories = [...brief.stories]
    .sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 16)
    .map((s) => `[${s.category}${s.featured ? " · featured" : ""}] ${s.headline}\n${s.summary}\n${(s.keyPoints ?? []).join(" · ")}`)
    .join("\n\n");

  const day = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Madrid" }).format(new Date(`${date}T12:00:00Z`));

  const prompt = `You write Ali's private morning news podcast. He listens over breakfast, alone, on his phone.

ABOUT ALI (weave this in naturally, never as a list): lives on Madrid time; mornings start with a 12-minute stretch routine and Wim Hof breathing; trains with a 12 kg kettlebell several days a week; runs easypeasy, a company teaching languages, with sales calls starting 8:30; follows Real Madrid and the Morocco national team closely; deep into AI and tech, also geopolitics and business.

TODAY: ${day}.

WRITE A SPOKEN SCRIPT covering ALL the main stories below, in this shape:
- Cold open: one warm line, date, straight in. No "welcome to the show" boilerplate.
- Stories grouped naturally (football together, then tech/AI, then geopolitics/business). Featured stories get the most depth.
- Per story: what happened, why it matters to Ali specifically when there's a real angle, one wry observation where it's earned. A story worth 20 seconds gets 20 seconds.
- Sign-off: one short line sending him into his day.

HARD RULES:
- 900 to 1400 words. The length must come from covering more stories, never from padding. No filler phrases ("it's worth noting", "in other news", "interestingly"), no throat-clearing, no recaps.
- Warm, dry-witted, likeable. A sharp friend who read everything, not a news anchor.
- Plain spoken English, short sentences. Numbers written for the ear (say "two billion", not "2B").
- Output ONLY the script text. No headings, no markdown, no stage directions.

THE STORIES:
${stories}`;

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic();
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3000,
      messages: [{ role: "user", content: prompt }],
    });
    const text = (message.content[0] as { type: string; text: string }).text?.trim();
    return text && text.length > 200 ? text : null;
  } catch { return null; }
}

/** Script → MP3 buffer via the free Microsoft neural voice. Throws on failure. */
async function synthesize(script: string): Promise<Buffer> {
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import("msedge-tts");
  const tts = new MsEdgeTTS();
  await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = await tts.toStream(script);
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    const guard = setTimeout(() => reject(new Error("tts timeout")), 120_000);
    audioStream.on("data", (c: Buffer) => chunks.push(c));
    audioStream.on("end", () => { clearTimeout(guard); resolve(); });
    audioStream.on("error", (e: Error) => { clearTimeout(guard); reject(e); });
  });
  const buf = Buffer.concat(chunks);
  if (buf.length < 50_000) throw new Error(`suspiciously small audio (${buf.length} bytes)`);
  return buf;
}

/**
 * Generate (or finish generating) today's episode. Idempotent; safe to call from
 * the cron, the reminders tick and the manual retry button. Returns the episode.
 */
export async function ensureTodaysPodcast(userId: string, force = false): Promise<Episode> {
  const date = checklistToday();
  let [row] = await db.select().from(podcastEpisodes)
    .where(and(eq(podcastEpisodes.userId, userId), eq(podcastEpisodes.date, date)));

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
      return { date, status: "failed", script: null, audioUrl: null, attempts: row.attempts + 1 };
    }
    await db.update(podcastEpisodes).set({ script }).where(eq(podcastEpisodes.id, row.id));
  }

  // 2 · Voice + upload.
  try {
    const audio = await synthesize(script);
    const { put } = await import("@vercel/blob");
    const blob = await put(`podcast/${date}.mp3`, audio, {
      access: "public",
      contentType: "audio/mpeg",
      addRandomSuffix: true,
    });
    await db.update(podcastEpisodes).set({ status: "ready", audioUrl: blob.url }).where(eq(podcastEpisodes.id, row.id));
    return { date, status: "ready", script, audioUrl: blob.url, attempts: row.attempts + 1 };
  } catch {
    await db.update(podcastEpisodes).set({ status: "failed" }).where(eq(podcastEpisodes.id, row.id));
    return { date, status: "failed", script, audioUrl: null, attempts: row.attempts + 1 };
  }
}
