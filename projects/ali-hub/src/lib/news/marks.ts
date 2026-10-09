/**
 * Per-person "watched" (2026-10-09 · a second account on the hub). `yt_videos` and `highlights` are
 * SHARED tables (one row per video for everyone) and their `watched_at` column is ALI's tick, kept as
 * it was so nothing of his changes and the retention rule in highlights.ts keeps reading it. Every
 * other account ticks here: `watch_marks(user_id, video_id, watched_at)`, one row per person and video.
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";

let ensured: Promise<void> | null = null;
export function ensureMarks(): Promise<void> {
  ensured ??= (async () => {
    try { await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS watch_marks (user_id TEXT NOT NULL, video_id TEXT NOT NULL, watched_at INTEGER NOT NULL, PRIMARY KEY (user_id, video_id))`)); } catch { /* exists */ }
  })();
  return ensured;
}

/** The ids this person has ticked, with when · a Map so a list can sort by it. */
export async function marksFor(userId: string): Promise<Map<string, number>> {
  await ensureMarks();
  const rows = await db.all<{ video_id: string; watched_at: number }>(sql`SELECT video_id, watched_at FROM watch_marks WHERE user_id = ${userId}`).catch(() => []);
  return new Map(rows.map((r) => [r.video_id, Number(r.watched_at)]));
}

export async function setMark(userId: string, videoId: string, watched: boolean): Promise<void> {
  await ensureMarks();
  if (watched) await db.run(sql`INSERT INTO watch_marks (user_id, video_id, watched_at) VALUES (${userId}, ${videoId}, ${Date.now()}) ON CONFLICT(user_id, video_id) DO UPDATE SET watched_at = excluded.watched_at`);
  else await db.run(sql`DELETE FROM watch_marks WHERE user_id = ${userId} AND video_id = ${videoId}`);
}
