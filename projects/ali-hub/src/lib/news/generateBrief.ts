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
import { ensureSettingsColumns } from "@/lib/db/ensureColumns";

export async function ensureTodaysBrief(userId: string): Promise<NewsBrief> {
  await ensureSettingsColumns();
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

  // The RSS stories only (videos left the brief on 2026-10-03 · the News page reads them from
  // yt_videos). NO AI since 2026-10-04 (Ali: "I will rely on the YouTube channels and the weekly
  // stuff"): the daily summaries and deep dives are gone, the WEEKLY brief writes from these rows
  // (enhanceStoriesWithAI / generateDeepDives in summarize.ts stay for a manual run).
  const brief = await generateNewsBrief(today);

  await db.insert(newsBriefs).values({
    userId,
    date: today,
    content: JSON.stringify(brief),
  });

  return brief;
}
