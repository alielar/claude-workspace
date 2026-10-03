/**
 * GET /api/news/videos → { picks, later, fetchedAt } · the News page's two daily picks and the
 * watch-later list (2026-10-03), read from the yt_videos table. The reminders tick polls the
 * channel feeds every 30 min; when the table looks stale or empty this GET polls inline (raced
 * against 7 s) so a first open is never blank. ?poll=1 forces a poll and reports it.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listVideos, pollVideos, videosStale } from "@/lib/news/videos";
import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensureSettingsColumns } from "@/lib/db/ensureColumns";

/** Watch-later channels switched off in Settings stay out of the list (null = all on). */
async function enabledFor(userId: string): Promise<string[] | null> {
  try {
    await ensureSettingsColumns();
    const [s] = await db.select({ newsChannels: userSettings.newsChannels }).from(userSettings).where(eq(userSettings.userId, userId));
    const v = s?.newsChannels ? JSON.parse(s.newsChannels) : null;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null;
  } catch { return null; }
}

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  if (url.searchParams.get("poll") === "1") {
    const r = await pollVideos({ force: true });
    return NextResponse.json({ poll: r, ...(await listVideos(await enabledFor(session.user.id))) }, { headers: { "Cache-Control": "no-store" } });
  }
  if (await videosStale()) await Promise.race([pollVideos().catch(() => null), new Promise((r) => setTimeout(r, 7000))]);
  return NextResponse.json(await listVideos(await enabledFor(session.user.id)), { headers: { "Cache-Control": "no-store" } });
}
