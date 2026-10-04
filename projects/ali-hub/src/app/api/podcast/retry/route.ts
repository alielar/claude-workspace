/** POST /api/podcast/retry {date} · the player's "try the voice again" button (bypasses spacing).
 * `date` = a week key ("2026-W40", the weekly episode · the default since 2026-10-04) or a day. */

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { ensureTodaysPodcast, ensureWeeklyPodcast } from "@/lib/podcast/generate";
import { getWeeklyBrief, isWeekKey, briefWeek } from "@/lib/news/weekly";
import { checklistToday } from "@/lib/checklist/day";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { date?: string };
  const date = typeof body.date === "string" && /^\d{4}-(\d{2}-\d{2}|W\d{2})$/.test(body.date) ? body.date : briefWeek(checklistToday()).week;
  if (isWeekKey(date)) {
    const brief = await getWeeklyBrief(session.user.id, date);
    if (!brief) return NextResponse.json({ error: "no brief for that week" }, { status: 404 });
    return NextResponse.json({ episode: await ensureWeeklyPodcast(session.user.id, brief, true) });
  }
  return NextResponse.json({ episode: await ensureTodaysPodcast(session.user.id, true) });
}
