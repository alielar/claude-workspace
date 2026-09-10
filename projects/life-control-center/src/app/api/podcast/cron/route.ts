/**
 * GET /api/podcast/cron · daily podcast generation.
 * Called by Vercel Cron at 04:40 UTC (06:40 Madrid summer / 05:40 winter) so the
 * episode is ready before breakfast. Idempotent; the reminders tick retries failures.
 * Auth: Vercel cron's Bearer CRON_SECRET, or ?key= for manual runs.
 */

export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { sql } from "drizzle-orm";
import { ensureTodaysPodcast, todaysEpisode } from "@/lib/podcast/generate";

/** The cron must never fail on a missing table (idempotent, same DDL as migrate). */
async function ensureTable() {
  try {
    await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS podcast_episodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      script TEXT,
      audio_url TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_attempt_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    )`));
    await db.run(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS ux_podcast_episode ON podcast_episodes(user_id, date)`));
  } catch { /* already there */ }
  try { await db.run(sql.raw(`ALTER TABLE user_settings ADD COLUMN morning_plan TEXT`)); } catch { /* already there */ }
  try { await db.run(sql.raw(`ALTER TABLE podcast_episodes ADD COLUMN audio_b64 TEXT`)); } catch { /* already there */ }
  try { await db.run(sql.raw(`ALTER TABLE podcast_episodes ADD COLUMN chapters TEXT`)); } catch { /* already there */ }
  try { await db.run(sql.raw(`ALTER TABLE podcast_episodes ADD COLUMN duration_sec INTEGER`)); } catch { /* already there */ }
}

const CRON_KEY = "a019090fd3263431b3f1b99f0b1e1884";

export async function GET(req: NextRequest) {
  const bearerOk = req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  const keyOk = req.nextUrl.searchParams.get("key") === CRON_KEY;
  if (!bearerOk && !keyOk) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const force = req.nextUrl.searchParams.get("force") === "1";
  const rebuild = req.nextUrl.searchParams.get("rebuild") === "1";

  // TEMP diagnostic: &tts_test=1 synthesizes one short line and reports the outcome.
  if (req.nextUrl.searchParams.get("tts_test") === "1") {
    try {
      const { MsEdgeTTS, OUTPUT_FORMAT } = await import("msedge-tts");
      const t0 = Date.now();
      const tts = new MsEdgeTTS();
      await tts.setMetadata("en-US-AndrewMultilingualNeural", OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const connectMs = Date.now() - t0;
      const len = Number(req.nextUrl.searchParams.get("len") ?? 40);
      const text = "The midfield looked coherent and the pressing finally clicked into place. ".repeat(Math.ceil(len / 75)).slice(0, len);
      const { audioStream } = await tts.toStream(text);
      const chunks: Buffer[] = [];
      const bytes = await new Promise<number>((resolve, reject) => {
        const guard = setTimeout(() => reject(new Error(`timeout · connect ${connectMs}ms · chunks so far ${chunks.length}`)), 30_000);
        audioStream.on("data", (c: Buffer) => chunks.push(c));
        audioStream.on("end", () => { clearTimeout(guard); resolve(Buffer.concat(chunks).length); });
        audioStream.on("error", (e: Error) => { clearTimeout(guard); reject(e); });
      });
      return NextResponse.json({ tts: "ok", bytes, connectMs });
    } catch (e) {
      return NextResponse.json({ tts: "failed", error: String((e as Error).message).slice(0, 300) });
    }
  }

  await ensureTable();
  const allUsers = await db.select().from(users);
  const results: Record<string, string> = {};
  for (const u of allUsers) {
    try {
      const ep = await ensureTodaysPodcast(u.id, force || rebuild, rebuild);
      results[u.id] = `${ep.status}${ep.audioUrl ? " · audio ok" : ""} · attempts ${ep.attempts}${ep.lastError ? ` · ${ep.lastError}` : ""}${ep.script ? ` · script ${ep.script.length} chars` : " · no script"} · ${ep.chapters.length} chapters [${ep.chapters.map((c) => `${c.title}@${c.startSec}s`).join(", ")}] · ${ep.durationSec ?? "?"}s total`;
    } catch (e) {
      results[u.id] = `error: ${String((e as Error).message).slice(0, 120)}`;
    }
  }
  // ?script=1 · echo today's script for verification (the route is already key-gated).
  if (req.nextUrl.searchParams.get("script") === "1") {
    const scripts: Record<string, string | null> = {};
    for (const u of allUsers) scripts[u.id] = (await todaysEpisode(u.id))?.script ?? null;
    return NextResponse.json({ ok: true, results, scripts });
  }
  return NextResponse.json({ ok: true, results });
}
