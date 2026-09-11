/**
 * GET /api/workouts/weekly-volume
 * Returns sets per muscle group for the current week (Mon-Sun).
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { gymSessions, gymSets, exerciseDb } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

function todayMadrid(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}

function getWeekRange(today: string): { start: string; end: string } {
  const d = new Date(today);
  const dow = d.getDay(); // 0=Sun
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (dt: Date) => dt.toISOString().slice(0, 10);
  return { start: fmt(monday), end: fmt(sunday) };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = todayMadrid();
  const { start, end } = getWeekRange(today);

  // Get all sets for this week with their muscle groups
  const rows = await db
    .select({
      primaryMuscle: exerciseDb.primaryMuscle,
      setCount: sql<number>`count(*)`.as("set_count"),
    })
    .from(gymSets)
    .innerJoin(gymSessions, eq(gymSets.sessionId, gymSessions.id))
    .leftJoin(exerciseDb, eq(gymSets.exerciseId, exerciseDb.id))
    .where(
      and(
        eq(gymSessions.userId, session.user.id),
        sql`${gymSessions.date} >= ${start}`,
        sql`${gymSessions.date} <= ${end}`,
      )
    )
    .groupBy(exerciseDb.primaryMuscle);

  const volume: Record<string, number> = {};
  for (const r of rows) {
    if (r.primaryMuscle) {
      volume[r.primaryMuscle] = r.setCount;
    }
  }

  return NextResponse.json({ weekStart: start, weekEnd: end, volume });
}
