/**
 * GET /api/workouts/analytics
 * Returns all data needed for /workouts/analytics in one call.
 *
 * Response: {
 *   muscleVolume: { thisWeek, lastWeek, last4WeeksAvg }   — sets per muscle
 *   weeklyTrend:  Array<{ weekStart, tonnage, sessions }> — last 12 weeks
 *   exercises:    Array<{ id, name, primaryMuscle }>       — for dropdown
 *   prTimeline:   Array<PR>                                — all PRs, newest first
 *   heatmap:      Array<{ date, workoutName, durationSeconds }>
 *   stats:        { totalThisYear, currentStreak, longestStreak }
 * }
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { gymSessions, gymSets, exerciseDb, exercisePrs } from "@/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";

function todayMadrid(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}

/** Return the ISO Monday (YYYY-MM-DD) for a given date string */
function isoWeekMonday(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const day = d.getUTCDay(); // 0=Sun, 1=Mon … 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Add N days to a YYYY-MM-DD string */
function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const today = todayMadrid();
  const thisWeekMon = isoWeekMonday(today);
  const lastWeekMon = shiftDate(thisWeekMon, -7);
  const lastWeekSun = shiftDate(thisWeekMon, -1);
  const fourWeeksAgo = shiftDate(thisWeekMon, -28);
  const twelveWeeksAgo = shiftDate(thisWeekMon, -84);
  const yearStart = today.slice(0, 4) + "-01-01";

  // ── All sets in last 12 weeks with muscle + tonnage data ─────────────────
  const rawSets = await db
    .select({
      sessionDate: gymSessions.date,
      sessionId:   gymSessions.id,
      muscle:      exerciseDb.primaryMuscle,
      weightKg:    gymSets.weightKg,
      reps:        gymSets.reps,
    })
    .from(gymSets)
    .innerJoin(gymSessions, eq(gymSets.sessionId, gymSessions.id))
    .leftJoin(exerciseDb, eq(gymSets.exerciseId, exerciseDb.id))
    .where(
      and(
        eq(gymSessions.userId, userId),
        sql`${gymSessions.date} >= ${twelveWeeksAgo}`,
      )
    );

  // ── Muscle volume ────────────────────────────────────────────────────────
  const muscleThisWeek: Record<string, number> = {};
  const muscleLastWeek: Record<string, number> = {};
  const muscleLast4Weeks: Record<string, number> = {};

  for (const s of rawSets) {
    if (!s.muscle) continue;
    const wk = isoWeekMonday(s.sessionDate);
    if (wk === thisWeekMon) {
      muscleThisWeek[s.muscle] = (muscleThisWeek[s.muscle] ?? 0) + 1;
    }
    if (s.sessionDate >= lastWeekMon && s.sessionDate <= lastWeekSun) {
      muscleLastWeek[s.muscle] = (muscleLastWeek[s.muscle] ?? 0) + 1;
    }
    if (s.sessionDate >= fourWeeksAgo) {
      muscleLast4Weeks[s.muscle] = (muscleLast4Weeks[s.muscle] ?? 0) + 1;
    }
  }

  // ── Weekly tonnage trend (last 12 weeks) ─────────────────────────────────
  const weekMap: Record<string, { tonnage: number; sessionIds: Set<number> }> = {};

  for (const s of rawSets) {
    const wk = isoWeekMonday(s.sessionDate);
    if (!weekMap[wk]) weekMap[wk] = { tonnage: 0, sessionIds: new Set() };
    if (s.weightKg && s.reps) weekMap[wk].tonnage += s.weightKg * s.reps;
    weekMap[wk].sessionIds.add(s.sessionId);
  }

  const weeklyTrend = Array.from({ length: 12 }, (_, i) => {
    const wk = shiftDate(thisWeekMon, -77 + i * 7); // 12 weeks, oldest first
    const data = weekMap[wk];
    return {
      weekStart: wk,
      tonnage: Math.round(data?.tonnage ?? 0),
      sessions: data?.sessionIds.size ?? 0,
    };
  });

  // ── Exercise list (for progression dropdown) ─────────────────────────────
  const exercises = await db
    .select({ id: exerciseDb.id, name: exerciseDb.name, primaryMuscle: exerciseDb.primaryMuscle })
    .from(exerciseDb)
    .where(eq(exerciseDb.userId, userId))
    .orderBy(exerciseDb.name);

  // ── PR timeline ──────────────────────────────────────────────────────────
  const prTimeline = await db
    .select({
      id:           exercisePrs.id,
      exerciseName: exercisePrs.exerciseName,
      muscleGroup:  exerciseDb.primaryMuscle,
      bestWeightKg: exercisePrs.bestWeightKg,
      bestReps:     exercisePrs.bestReps,
      estimated1rm: exercisePrs.estimated1rm,
      achievedAt:   exercisePrs.achievedAt,
    })
    .from(exercisePrs)
    .leftJoin(exerciseDb, eq(exercisePrs.exerciseId, exerciseDb.id))
    .where(eq(exercisePrs.userId, userId))
    .orderBy(desc(exercisePrs.achievedAt));

  // ── Year heatmap ─────────────────────────────────────────────────────────
  const yearSessions = await db
    .select({
      date:            gymSessions.date,
      workoutName:     gymSessions.workoutName,
      durationSeconds: gymSessions.durationSeconds,
    })
    .from(gymSessions)
    .where(
      and(
        eq(gymSessions.userId, userId),
        sql`${gymSessions.date} >= ${yearStart}`,
      )
    )
    .orderBy(gymSessions.date);

  // ── Stats: streaks ───────────────────────────────────────────────────────
  const sessionDateSet = new Set(yearSessions.map((s) => s.date));
  const totalThisYear = yearSessions.length;

  // Current streak: consecutive days back from today
  let currentStreak = 0;
  for (let i = 0; i < 365; i++) {
    const d = shiftDate(today, -i);
    if (sessionDateSet.has(d)) {
      currentStreak++;
    } else if (i > 0) {
      break; // gap — streak ends
    }
  }

  // Longest streak across all dates
  const sortedDates = Array.from(sessionDateSet).sort();
  let longest = 0;
  let run = 0;
  for (let i = 0; i < sortedDates.length; i++) {
    if (i === 0) {
      run = 1;
    } else {
      const prev = new Date(sortedDates[i - 1] + "T12:00:00Z");
      const curr = new Date(sortedDates[i] + "T12:00:00Z");
      const gap = Math.round((curr.getTime() - prev.getTime()) / 86400000);
      run = gap === 1 ? run + 1 : 1;
    }
    longest = Math.max(longest, run);
  }

  return NextResponse.json({
    muscleVolume: {
      thisWeek:      muscleThisWeek,
      lastWeek:      muscleLastWeek,
      last4WeeksAvg: Object.fromEntries(
        Object.entries(muscleLast4Weeks).map(([k, v]) => [k, Math.round((v / 4) * 10) / 10])
      ),
    },
    weeklyTrend,
    exercises,
    prTimeline,
    heatmap: yearSessions,
    stats: { totalThisYear, currentStreak, longestStreak: longest },
  });
}
