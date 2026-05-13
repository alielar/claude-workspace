/**
 * GET  /api/checklist — list items with today's completion + per-item streak
 * POST /api/checklist — create a new item
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { checklistItems, checklistCompletions, workoutLogs, workoutSessions, workoutPrograms } from "@/db/schema";
import { eq, and, gte, desc } from "drizzle-orm";
import { format, subDays } from "date-fns";

/** "Today" in Europe/Madrid timezone as YYYY-MM-DD */
function todayMadrid(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}

/** Returns consecutive-day streak for a sorted (desc) list of date strings */
function calcStreak(dates: string[], today: string): number {
  if (dates.length === 0) return 0;
  const yesterday = format(subDays(new Date(today + "T12:00:00"), 1), "yyyy-MM-dd");
  // Start from today if done, otherwise yesterday
  let check = dates.includes(today) ? today : yesterday;
  let count = 0;
  for (const d of dates) {
    if (d === check) {
      count++;
      check = format(subDays(new Date(check + "T12:00:00"), 1), "yyyy-MM-dd");
    } else if (d < check) {
      break;
    }
  }
  return count;
}

const ROTATION = ["Push", "Pull", "Legs", "Core", "Push", "Pull", "Push-Up Skill"];

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const today = todayMadrid();
  const lookback = format(subDays(new Date(today + "T12:00:00"), 90), "yyyy-MM-dd");

  // Fetch items + completions in parallel
  const [items, allCompletions, recentLogs, allSessions] = await Promise.all([
    db.select().from(checklistItems)
      .where(and(eq(checklistItems.userId, userId), eq(checklistItems.active, true)))
      .orderBy(checklistItems.sortOrder, checklistItems.createdAt),

    db.select().from(checklistCompletions)
      .where(and(eq(checklistCompletions.userId, userId), gte(checklistCompletions.date, lookback))),

    db.select().from(workoutLogs)
      .where(eq(workoutLogs.userId, userId))
      .orderBy(desc(workoutLogs.startedAt))
      .limit(30),

    db.select().from(workoutSessions)
      .innerJoin(workoutPrograms, eq(workoutSessions.programId, workoutPrograms.id))
      .where(eq(workoutPrograms.userId, userId))
      .orderBy(workoutSessions.sortOrder),
  ]);

  // ── Derive next workout name ──
  const lastLog = recentLogs[0] ?? null;
  const lastSessionName = lastLog
    ? allSessions.find((s) => s.workout_sessions.id === lastLog.sessionId)?.workout_sessions.name
    : null;
  const lastIdx = lastSessionName ? ROTATION.lastIndexOf(lastSessionName) : -1;
  const nextSessionName = ROTATION[(lastIdx + 1) % ROTATION.length];

  // Did we log a workout today?
  const workoutToday = recentLogs.some(
    (l) => format(new Date(l.startedAt!), "yyyy-MM-dd") === today
  );
  // Is today's workout logged specifically the next session?
  const nextDoneToday = workoutToday && recentLogs.some((l) => {
    const name = allSessions.find((s) => s.workout_sessions.id === l.sessionId)?.workout_sessions.name;
    return name === nextSessionName && format(new Date(l.startedAt!), "yyyy-MM-dd") === today;
  });

  // ── Build item list with completion + streaks ──
  const enriched = items.map((item) => {
    const itemCompletions = allCompletions
      .filter((c) => c.itemId === item.id)
      .map((c) => c.date)
      .sort()
      .reverse();

    return {
      id: item.id,
      title: item.title,
      emoji: item.emoji,
      sortOrder: item.sortOrder,
      completedToday: itemCompletions.includes(today),
      streak: calcStreak(itemCompletions, today),
      source: "manual" as const,
    };
  });

  // ── Prepend virtual workout item ──
  const workoutItem = allSessions.length > 0
    ? {
        id: -1,               // virtual
        title: nextSessionName + " workout",
        emoji: "🏋️",
        sortOrder: -1,
        completedToday: nextDoneToday,
        streak: 0,            // not tracked for virtual
        source: "workout" as const,
        href: `/workouts`,
      }
    : null;

  const result = [
    ...(workoutItem ? [workoutItem] : []),
    ...enriched,
  ];

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { title, emoji } = await req.json();
  if (!title?.trim()) return NextResponse.json({ error: "Title required" }, { status: 400 });

  // Assign next sort order
  const existing = await db.select({ sortOrder: checklistItems.sortOrder })
    .from(checklistItems)
    .where(eq(checklistItems.userId, userId))
    .orderBy(desc(checklistItems.sortOrder))
    .limit(1);
  const nextOrder = (existing[0]?.sortOrder ?? -1) + 1;

  const [item] = await db.insert(checklistItems).values({
    userId,
    title: title.trim(),
    emoji: emoji?.trim() || null,
    sortOrder: nextOrder,
  }).returning();

  return NextResponse.json(item, { status: 201 });
}
