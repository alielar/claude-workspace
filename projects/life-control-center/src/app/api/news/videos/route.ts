/**
 * GET /api/news/videos → { videos } · the Videos row on News, fetched live from the
 * enabled channels (fast: public Atom feeds in parallel). Independent of the 06:00
 * brief on purpose (2026-09-12): the brief's own video list is frozen at generation
 * and a device holding a stale copy showed no videos at all (Ali's laptop).
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { fetchBriefVideos } from "@/lib/news/youtube";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [settings] = await db.select({ newsChannels: userSettings.newsChannels }).from(userSettings).where(eq(userSettings.userId, session.user.id)).catch(() => []);
  let enabled: string[] | null = null;
  try { enabled = settings?.newsChannels ? (JSON.parse(settings.newsChannels) as string[]) : null; } catch { enabled = null; }
  const videos = await fetchBriefVideos(enabled);
  return NextResponse.json({ videos, fetchedAt: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
