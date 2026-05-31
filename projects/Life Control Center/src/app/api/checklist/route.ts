/**
 * GET  /api/checklist — list items with today's completion + per-item streak + historical data
 * POST /api/checklist — create a new item
 *
 * GET Response: { items: Item[], overallStreak, monthlyPct, thirtyDayAvg, bestStreak30 }
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  checklistItems,
  checklistCompletions,
  gymSessions,
  workoutPlans,
  programs,
} from "@/db/schema";
import { eq, and, gte, desc } from "drizzle-orm";
import { format, subDays } from "date-fns";

/**
 * "Today" for checklist purposes — if it's before 4 AM in Madrid,
 * we treat it as still being the previous day so late-night check-offs
 * count toward yesterday's list.
 */
function checklistToday(): string {
  const now = new Date();
  const madridHour = parseInt(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "numeric", hour12: false }).format(now)
  );
  const offset = madridHour < 4 ? -1 : 0;
  const adjusted = new Date(now.getTime() + offset * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(adjusted);
}

function calcStreak(dates: string[], today: string): number {
  if (dates.length === 0) return 0;
  const yesterday = format(subDays(new Date(today + "T12:00:00"), 1), "yyyy-MM-dd");
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

/** Last N date strings ending today, oldest first */
function getLastNDates(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) =>
    format(subDays(new Date(today + "T12:00:00"), n - 1 - i), "yyyy-MM-dd")
  );
}

/** Consecutive days where ALL db items were completed */
function calcOverallStreak(
  completions: { date: string; itemId: number }[],
  totalItems: number,
  today: string
): number {
  if (totalItems === 0) return 0;

  const byDate = new Map<string, Set<number>>();
  for (const c of completions) {
    if (!byDate.has(c.date)) byDate.set(c.date, new Set());
    byDate.get(c.date)!.add(c.itemId);
  }

  const todayDone = (byDate.get(today)?.size ?? 0) >= totalItems;
  let checkDate = todayDone
    ? today
    : format(subDays(new Date(today + "T12:00:00"), 1), "yyyy-MM-dd");
  let count = 0;

  for (let i = 0; i < 90; i++) {
    if ((byDate.get(checkDate)?.size ?? 0) >= totalItems) {
      count++;
      checkDate = format(subDays(new Date(checkDate + "T12:00:00"), 1), "yyyy-MM-dd");
    } else {
      break;
    }
  }

  return count;
}

/** Completion % per day for the current month (up to and including today) */
function getMonthlyPct(
  completions: { date: string; itemId: number }[],
  totalItems: number,
  today: string
): { date: string; pct: number }[] {
  if (totalItems === 0) return [];

  const currentMonth = today.substring(0, 7);
  const year = parseInt(today.substring(0, 4));
  const month = parseInt(today.substring(5, 7));
  const daysInMonth = new Date(year, month, 0).getDate();

  const byDate = new Map<string, Set<number>>();
  for (const c of completions) {
    if (c.date.startsWith(currentMonth)) {
      if (!byDate.has(c.date)) byDate.set(c.date, new Set());
      byDate.get(c.date)!.add(c.itemId);
    }
  }

  const result: { date: string; pct: number }[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${currentMonth}-${String(d).padStart(2, "0")}`;
    if (date > today) break;
    const count = byDate.get(date)?.size ?? 0;
    result.push({ date, pct: Math.round((count / totalItems) * 100) });
  }

  return result;
}

/** 30-day average completion % and best all-items streak */
function getThirtyDayStats(
  completions: { date: string; itemId: number }[],
  totalItems: number,
  today: string
): { avg: number; bestStreak: number } {
  if (totalItems === 0) return { avg: 0, bestStreak: 0 };

  const days = getLastNDates(today, 30);

  const byDate = new Map<string, Set<number>>();
  for (const c of completions) {
    if (!byDate.has(c.date)) byDate.set(c.date, new Set());
    byDate.get(c.date)!.add(c.itemId);
  }

  let totalPct = 0;
  let best = 0, cur = 0;
  for (const d of days) {
    const count = byDate.get(d)?.size ?? 0;
    totalPct += count / totalItems;
    if (count >= totalItems) {
      cur++;
      if (cur > best) best = cur;
    } else {
      cur = 0;
    }
  }

  return { avg: Math.round((totalPct / 30) * 100), bestStreak: best };
}

const ROTATION = ["Push", "Pull", "Legs", "Core", "Push", "Pull", "Push-Up Skill"];

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const today = checklistToday();
  const lookback = format(subDays(new Date(today + "T12:00:00"), 90), "yyyy-MM-dd");

  const [items, allCompletions, recentGymSessions] = await Promise.all([
    db
      .select()
      .from(checklistItems)
      .where(and(eq(checklistItems.userId, userId), eq(checklistItems.active, true)))
      .orderBy(checklistItems.sortOrder, checklistItems.createdAt),

    db
      .select()
      .from(checklistCompletions)
      .where(and(eq(checklistCompletions.userId, userId), gte(checklistCompletions.date, lookback))),

    db
      .select({
        id: gymSessions.id,
        workoutName: gymSessions.workoutName,
        date: gymSessions.date,
        durationSeconds: gymSessions.durationSeconds,
      })
      .from(gymSessions)
      .where(eq(gymSessions.userId, userId))
      .orderBy(desc(gymSessions.date))
      .limit(30),
  ]);

  // ── Derive next workout name from actual gym sessions ──
  const lastGymSession = recentGymSessions.find(s => s.durationSeconds !== null) ?? null;
  const lastSessionName = lastGymSession?.workoutName ?? null;
  const lastIdx = lastSessionName ? ROTATION.lastIndexOf(lastSessionName) : -1;
  const nextSessionName = ROTATION[(lastIdx + 1) % ROTATION.length];

  // Check if any workout was done today (finished sessions only)
  const todayFinished = recentGymSessions.filter(s => s.date === today && s.durationSeconds !== null);
  const nextDoneToday = todayFinished.some(s => s.workoutName === nextSessionName);

  // ── last 7 dates ──
  const last7Dates = getLastNDates(today, 7);

  // ── Build enriched items ──
  const enriched = items.map((item) => {
    const itemDates = allCompletions
      .filter((c) => c.itemId === item.id)
      .map((c) => c.date)
      .sort()
      .reverse();

    return {
      id: item.id,
      title: item.title,
      emoji: item.emoji,
      sortOrder: item.sortOrder,
      timeOfDay: (item.timeOfDay ?? "anytime") as "morning" | "afternoon" | "evening" | "anytime",
      completedToday: itemDates.includes(today),
      streak: calcStreak(itemDates, today),
      last7: last7Dates.map((d) => itemDates.includes(d)),
      source: "manual" as const,
      autoSource: item.autoSource ?? null,
      color: item.color ?? "violet",
      notes: item.notes ?? null,
    };
  });

  // ── Aggregate stats (DB items only, excludes virtual workout) ──
  const totalItems = items.length;
  const overallStreak = calcOverallStreak(allCompletions, totalItems, today);
  const monthlyPct = getMonthlyPct(allCompletions, totalItems, today);
  const { avg: thirtyDayAvg, bestStreak: bestStreak30 } = getThirtyDayStats(
    allCompletions,
    totalItems,
    today
  );

  // ── Virtual workout item — shows whether any workout was done today ──
  const anyWorkoutDoneToday = todayFinished.length > 0;
  const workoutItem =
    recentGymSessions.length > 0
      ? {
          id: -1,
          title: anyWorkoutDoneToday
            ? todayFinished[0].workoutName + " workout"
            : nextSessionName + " workout",
          emoji: "🏋️",
          sortOrder: -1,
          timeOfDay: "anytime" as const,
          completedToday: anyWorkoutDoneToday,
          streak: 0,
          last7: last7Dates.map((d) => recentGymSessions.some(s => s.date === d && s.durationSeconds !== null)),
          source: "workout" as const,
          autoSource: null,
          color: "cyan",
          notes: null,
          href: `/workouts`,
        }
      : null;

  const resultItems = [...(workoutItem ? [workoutItem] : []), ...enriched];

  return NextResponse.json({
    items: resultItems,
    overallStreak,
    monthlyPct,
    thirtyDayAvg,
    bestStreak30,
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { title, emoji, timeOfDay, autoSource, color, notes } = await req.json();
  if (!title?.trim()) return NextResponse.json({ error: "Title required" }, { status: 400 });

  const existing = await db
    .select({ sortOrder: checklistItems.sortOrder })
    .from(checklistItems)
    .where(eq(checklistItems.userId, userId))
    .orderBy(desc(checklistItems.sortOrder))
    .limit(1);
  const nextOrder = (existing[0]?.sortOrder ?? -1) + 1;

  const [item] = await db
    .insert(checklistItems)
    .values({
      userId,
      title: title.trim(),
      emoji: emoji?.trim() || null,
      timeOfDay: timeOfDay ?? "anytime",
      autoSource: autoSource ?? null,
      color: color ?? "violet",
      notes: notes?.trim() || null,
      sortOrder: nextOrder,
    })
    .returning();

  return NextResponse.json(item, { status: 201 });
}
