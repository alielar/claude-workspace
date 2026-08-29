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

  // Generate, enhance with AI summaries + deep dives, and save
  const brief = await generateNewsBrief(today);
  await enhanceStoriesWithAI(brief.stories);
  await generateDeepDives(brief.stories);

  await db.insert(newsBriefs).values({
    userId,
    date: today,
    content: JSON.stringify(brief),
  });

  return brief;
}
