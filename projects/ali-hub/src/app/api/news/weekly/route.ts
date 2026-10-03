/**
 * GET /api/news/weekly → { brief, episode, weeks } · the latest weekly brief (news/weekly.ts),
 * its podcast episode (light shape) and the list of past weeks. ?week=2026-W40 picks one.
 * ?make=1 builds last week's BRIEF now (the Monday cron does it otherwise); ?podcast=1 writes and
 * voices its episode (a second call · the two together would not fit one function run); with
 * &rebuild=1 either starts from scratch. Signed in only.
 */

export const maxDuration = 300;

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { ensureWeeklyBrief, getWeeklyBrief, isWeekKey, latestWeeklyBrief, listWeeks } from "@/lib/news/weekly";
import { ensureWeeklyPodcast, todaysEpisode } from "@/lib/podcast/generate";
import { askAI, lastAiError } from "@/lib/news/summarize";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const q = req.nextUrl.searchParams;
  // ?aiprobe=1 · which writer answers (diagnostics · the night the Anthropic credits ran out, 2026-10-04).
  if (q.get("aiprobe") === "1") { const t = await askAI("Answer with the single word: ready", 20); return NextResponse.json({ answer: t, error: lastAiError }); }
  if (q.get("aiprobe") === "models") {
    // The free models Google still serves this key · names retire without notice.
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${process.env.GEMINI_API_KEY ?? ""}`).catch(() => null);
    const j = r ? await r.json().catch(() => null) as { models?: { name: string; supportedGenerationMethods?: string[] }[] } | null : null;
    return NextResponse.json({ status: r?.status, models: (j?.models ?? []).filter((m) => m.supportedGenerationMethods?.includes("generateContent")).map((m) => m.name.replace("models/", "")) });
  }
  const week = q.get("week");
  let brief = week && isWeekKey(week) ? await getWeeklyBrief(userId, week) : await latestWeeklyBrief(userId);
  let made: string | null = null;
  const rebuild = q.get("rebuild") === "1";
  if (q.get("make") === "1") {
    brief = await ensureWeeklyBrief(userId, { week: week && isWeekKey(week) ? week : undefined, force: rebuild });
    made = brief ? `${brief.week} · ${brief.sections.map((s) => `${s.label} ${s.stories.length}`).join(", ")} · ${brief.readMinutes} min read` : "no daily briefs for that week · nothing to build";
  }
  if (q.get("podcast") === "1" && brief) {
    const ep = await ensureWeeklyPodcast(userId, brief, true, rebuild);
    made = `${made ? `${made} · ` : ""}podcast ${ep.status}${ep.durationSec ? ` ${ep.durationSec}s` : ""}${ep.lastError ? ` · ${ep.lastError}` : ""}`;
  }
  const episode = brief ? await todaysEpisode(userId, brief.week) : null;
  return NextResponse.json({ brief, episode, weeks: await listWeeks(userId), ...(made ? { made } : {}) }, { headers: { "Cache-Control": "no-store" } });
}
