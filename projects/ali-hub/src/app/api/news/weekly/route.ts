/**
 * GET /api/news/weekly → { brief, episode, weeks } · the latest weekly brief (news/weekly.ts),
 * its podcast episode (light shape) and the list of past weeks. ?week=2026-W40 picks one.
 * ?make=1 builds last week's brief and podcast now (the Monday cron does it otherwise); with
 * &rebuild=1 it starts from scratch. Signed in only.
 */

export const maxDuration = 300;

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { ensureWeeklyBrief, getWeeklyBrief, isWeekKey, latestWeeklyBrief, listWeeks } from "@/lib/news/weekly";
import { ensureWeeklyPodcast, todaysEpisode } from "@/lib/podcast/generate";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const q = req.nextUrl.searchParams;
  const week = q.get("week");
  let brief = week && isWeekKey(week) ? await getWeeklyBrief(userId, week) : await latestWeeklyBrief(userId);
  let made: string | null = null;
  if (q.get("make") === "1") {
    const rebuild = q.get("rebuild") === "1";
    brief = await ensureWeeklyBrief(userId, { week: week && isWeekKey(week) ? week : undefined, force: rebuild });
    if (brief) {
      const ep = await ensureWeeklyPodcast(userId, brief, true, rebuild);
      made = `${brief.week} · ${brief.sections.map((s) => `${s.label} ${s.stories.length}`).join(", ")} · ${brief.readMinutes} min read · podcast ${ep.status}${ep.durationSec ? ` ${ep.durationSec}s` : ""}${ep.lastError ? ` · ${ep.lastError}` : ""}`;
    } else made = "no daily briefs for that week · nothing to build";
  }
  const episode = brief ? await todaysEpisode(userId, brief.week) : null;
  return NextResponse.json({ brief, episode, weeks: await listWeeks(userId), ...(made ? { made } : {}) }, { headers: { "Cache-Control": "no-store" } });
}
