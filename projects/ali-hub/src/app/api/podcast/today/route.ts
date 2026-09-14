/**
 * GET /api/podcast/today[?date=YYYY-MM-DD] → that day's episode (default today: status, script,
 * audio URL) plus the last 3 episodes (light) for the News list. Older episodes are deleted
 * by the generator, so "recent" is exactly what is still playable.
 */

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { recentEpisodes, todaysEpisode } from "@/lib/podcast/generate";
import { checklistToday } from "@/lib/checklist/day";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = req.nextUrl.searchParams.get("date");
  const date = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : checklistToday();
  const [ep, recent] = await Promise.all([todaysEpisode(session.user.id, date), recentEpisodes(session.user.id)]);
  return NextResponse.json({ episode: ep, recent });
}
