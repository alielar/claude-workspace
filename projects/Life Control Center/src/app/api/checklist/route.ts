/**
 * GET  /api/checklist — items with today's completion, per-item streak, 7-day history,
 *                       plus day-level stats. Seeds the built-in routine steps once.
 * POST /api/checklist — create a new item
 *
 * GET Response: { items: Item[], overallStreak, monthlyPct, thirtyDayAvg, bestStreak30 }
 *
 * Day-level stats (overall streak, %, 30-day average) count routine + manual items.
 * Habits being built (kind = "habit") have their own streak but do not count
 * toward the day until promoted — that is the whole point of "building".
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { checklistItems, checklistCompletions } from "@/db/schema";
import { eq, and, gte, desc } from "drizzle-orm";
import { format, subDays } from "date-fns";
import { checklistToday } from "@/lib/checklist/day";
import { ROUTINE_SEED, type ItemKind, type RoutineKey, type TimeOfDay } from "@/lib/checklist/types";

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

function groupByDate(completions: { date: string; itemId: number }[], counted: Set<number>) {
  const byDate = new Map<string, Set<number>>();
  for (const c of completions) {
    if (!counted.has(c.itemId)) continue;
    if (!byDate.has(c.date)) byDate.set(c.date, new Set());
    byDate.get(c.date)!.add(c.itemId);
  }
  return byDate;
}

/** Consecutive days where ALL counted items were completed */
function calcOverallStreak(byDate: Map<string, Set<number>>, total: number, today: string): number {
  if (total === 0) return 0;
  const todayDone = (byDate.get(today)?.size ?? 0) >= total;
  let checkDate = todayDone ? today : format(subDays(new Date(today + "T12:00:00"), 1), "yyyy-MM-dd");
  let count = 0;
  for (let i = 0; i < 90; i++) {
    if ((byDate.get(checkDate)?.size ?? 0) >= total) {
      count++;
      checkDate = format(subDays(new Date(checkDate + "T12:00:00"), 1), "yyyy-MM-dd");
    } else break;
  }
  return count;
}

/** Completion % per day for the current month (up to and including today) */
function getMonthlyPct(byDate: Map<string, Set<number>>, total: number, today: string) {
  if (total === 0) return [];
  const currentMonth = today.substring(0, 7);
  const year = parseInt(today.substring(0, 4));
  const month = parseInt(today.substring(5, 7));
  const daysInMonth = new Date(year, month, 0).getDate();
  const result: { date: string; pct: number }[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${currentMonth}-${String(d).padStart(2, "0")}`;
    if (date > today) break;
    const count = byDate.get(date)?.size ?? 0;
    result.push({ date, pct: Math.round((count / total) * 100) });
  }
  return result;
}

/** 30-day average completion % and best all-items streak */
function getThirtyDayStats(byDate: Map<string, Set<number>>, total: number, today: string) {
  if (total === 0) return { avg: 0, bestStreak: 0 };
  let totalPct = 0, best = 0, cur = 0;
  for (const d of getLastNDates(today, 30)) {
    const count = byDate.get(d)?.size ?? 0;
    totalPct += count / total;
    if (count >= total) { cur++; if (cur > best) best = cur; } else cur = 0;
  }
  return { avg: Math.round((totalPct / 30) * 100), bestStreak: best };
}

/** Insert any built-in routine step that doesn't exist yet (matched by routine_key). */
async function seedRoutine(userId: string) {
  const existing = await db
    .select({ routineKey: checklistItems.routineKey })
    .from(checklistItems)
    .where(eq(checklistItems.userId, userId));
  const have = new Set(existing.map((r) => r.routineKey).filter(Boolean));
  const missing = ROUTINE_SEED.filter((s) => !have.has(s.routineKey));
  if (missing.length === 0) return false;
  for (const s of missing) {
    try {
      await db.insert(checklistItems).values({
        userId,
        title: s.title,
        emoji: s.emoji,
        timeOfDay: s.timeOfDay,
        kind: s.kind,
        routineKey: s.routineKey,
        color: s.color,
        notes: s.notes,
        sortOrder: s.sortOrder,
      });
    } catch { /* raced with another request — fine */ }
  }
  return true;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const today = checklistToday();
  const lookback = format(subDays(new Date(today + "T12:00:00"), 90), "yyyy-MM-dd");

  // The routine columns may not exist on a database that hasn't run the migration yet.
  // Seeding is best-effort; the list still loads without it.
  try { await seedRoutine(userId); } catch { /* migration pending */ }

  const [items, allCompletions] = await Promise.all([
    db
      .select()
      .from(checklistItems)
      .where(and(eq(checklistItems.userId, userId), eq(checklistItems.active, true)))
      .orderBy(checklistItems.sortOrder, checklistItems.createdAt),
    db
      .select()
      .from(checklistCompletions)
      .where(and(eq(checklistCompletions.userId, userId), gte(checklistCompletions.date, lookback))),
  ]);

  const last7Dates = getLastNDates(today, 7);

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
      timeOfDay: (item.timeOfDay ?? "anytime") as TimeOfDay,
      kind: ((item.kind as ItemKind) ?? "manual"),
      routineKey: (item.routineKey as RoutineKey | null) ?? null,
      completedToday: itemDates.includes(today),
      streak: calcStreak(itemDates, today),
      last7: last7Dates.map((d) => itemDates.includes(d)),
      source: "manual" as const,
      autoSource: item.autoSource ?? null,
      color: item.color ?? "violet",
      notes: item.notes ?? null,
    };
  });

  // Day-level stats: everything except habits still being built.
  const counted = new Set(enriched.filter((i) => i.kind !== "habit").map((i) => i.id));
  const byDate = groupByDate(allCompletions, counted);
  const total = counted.size;
  const { avg: thirtyDayAvg, bestStreak: bestStreak30 } = getThirtyDayStats(byDate, total, today);

  return NextResponse.json({
    items: enriched,
    overallStreak: calcOverallStreak(byDate, total, today),
    monthlyPct: getMonthlyPct(byDate, total, today),
    thirtyDayAvg,
    bestStreak30,
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { title, emoji, timeOfDay, autoSource, color, notes, kind } = await req.json();
  if (!title?.trim()) return NextResponse.json({ error: "Title required" }, { status: 400 });

  const existing = await db
    .select({ sortOrder: checklistItems.sortOrder })
    .from(checklistItems)
    .where(eq(checklistItems.userId, userId))
    .orderBy(desc(checklistItems.sortOrder))
    .limit(1);
  const nextOrder = Math.max(0, (existing[0]?.sortOrder ?? -1) + 1);

  const [item] = await db
    .insert(checklistItems)
    .values({
      userId,
      title: title.trim(),
      emoji: emoji?.trim() || null,
      timeOfDay: timeOfDay ?? "anytime",
      kind: kind === "routine" || kind === "habit" ? kind : "manual",
      autoSource: autoSource ?? null,
      color: color ?? "violet",
      notes: notes?.trim() || null,
      sortOrder: nextOrder,
    })
    .returning();

  return NextResponse.json(item, { status: 201 });
}
