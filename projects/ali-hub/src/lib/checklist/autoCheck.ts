/**
 * autoCheck · shared helper called by source modules when a daily habit fires.
 *
 * Called from:
 *   - /api/workouts/log (POST)        → source: 'workout'  [wired in step 5]
 *   - /api/library/sessions (POST)    → source: 'reading'  [wired in step 5]
 *   - /api/wordbank/review (POST)     → source: 'words'    [wired in step 5]
 *   - /api/journal (POST)             → source: 'journal'  [wired when module exists]
 *   - /api/mood (POST)                → source: 'mood'     [wired when module exists]
 *
 * Idempotent · safe to call multiple times per day (unique constraint on
 * checklist_completions prevents duplicate rows).
 */

import { db } from "@/db";
import { checklistItems, checklistCompletions } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export type AutoSourceType = "workout" | "reading" | "words" | "journal" | "mood";

/** "Today" in Europe/Madrid timezone as YYYY-MM-DD */
function todayMadrid(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}

/**
 * Mark all auto-tracked checklist items for the given source as complete today.
 * No-op if the user has no items with this auto_source, or if already completed.
 */
export async function autoCheck(userId: string, source: AutoSourceType): Promise<void> {
  const today = todayMadrid();

  const items = await db
    .select({ id: checklistItems.id })
    .from(checklistItems)
    .where(
      and(
        eq(checklistItems.userId, userId),
        eq(checklistItems.active, true),
        eq(checklistItems.autoSource, source),
      )
    );

  if (items.length === 0) return;

  for (const item of items) {
    try {
      await db.insert(checklistCompletions).values({
        itemId: item.id,
        userId,
        date: today,
      });
    } catch {
      // Unique constraint violation = already completed today · ignore
    }
  }
}
