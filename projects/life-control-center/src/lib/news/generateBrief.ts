/**
 * Shared news brief generation logic.
 * Used by both the cron route (/api/news/cron) and the manual generate route (/api/news/generate).
 *
 * Idempotent: if today's brief already exists in the DB, returns it without re-generating.
 */

import { db } from "@/db";
import { newsBriefs, userSettings } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { generateNewsBrief, type NewsBrief } from "@/lib/news-brief";
import { todayInTz } from "@/lib/utils";
import { enhanceStoriesWithAI, generateDeepDives } from "@/lib/news/summarize";
import { fetchBriefVideos } from "@/lib/news/youtube";

export async function ensureTodaysBrief(userId: string): Promise<NewsBrief> {
  const [settings] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId));

  const tz = settings?.timezone ?? "Europe/Madrid";
  const today = todayInTz(tz);

  // Return existing brief if already generated today
  const [existing] = await db
    .select()
    .from(newsBriefs)
    .where(and(eq(newsBriefs.userId, userId), eq(newsBriefs.date, today)));

  if (existing) return JSON.parse(existing.content) as NewsBrief;

  // Generate (articles + YouTube videos in parallel), enhance with AI summaries + deep dives, and save
  let enabledChannels: string[] | null = null;
  try { enabledChannels = settings?.newsChannels ? (JSON.parse(settings.newsChannels) as string[]) : null; } catch { enabledChannels = null; }
  const [brief, videos] = await Promise.all([generateNewsBrief(today), fetchBriefVideos(enabledChannels)]);
  brief.videos = videos;
  // Summaries and the deeper analysis run side by side (both read the RSS text), in small
  // concurrent batches · same number of tokens as before, a fraction of the wall time.
  await Promise.all([enhanceStoriesWithAI(brief.stories), generateDeepDives(brief.stories)]);

  await db.insert(newsBriefs).values({
    userId,
    date: today,
    content: JSON.stringify(brief),
  });

  return brief;
}
