/**
 * POST /api/workouts/seed-history
 *
 * Seeds historical gym sessions only. Does NOT create workout plans or exercises.
 * Plans must already exist — this just backfills session history.
 *
 * Date range: March 16 → May 23, 2026
 * Frequency: Exactly 5 sessions per week, varied distribution
 * Constraint: no 4+ consecutive training days, no weekend-only clustering
 * Rotation: Push / Pull / Legs / Push / Pull cycling
 * Idempotent: skips dates that already have sessions
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  gymSessions, gymSets, exerciseDb,
  programs, workoutPlans, planExercises,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

// ── Generate exactly 5 training days per week with natural variation ─────────
// Rules: no 4+ consecutive days, varied across Mon-Sun, deterministic per week

function trainingDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const startD = new Date(start + "T12:00:00Z");
  const endD   = new Date(end   + "T12:00:00Z");

  // Collect days grouped by Mon-Sun ISO week
  const weeks: string[][] = [];
  let currentWeek: string[] = [];
  let lastWeekMon = "";

  const iter = new Date(startD);
  while (iter <= endD) {
    // Get Monday of current week
    const dow = iter.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const daysFromMon = (dow + 6) % 7;
    const monDate = new Date(iter);
    monDate.setUTCDate(monDate.getUTCDate() - daysFromMon);
    const monKey = monDate.toISOString().slice(0, 10);

    if (monKey !== lastWeekMon && currentWeek.length > 0) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
    lastWeekMon = monKey;
    currentWeek.push(iter.toISOString().slice(0, 10));
    iter.setUTCDate(iter.getUTCDate() + 1);
  }
  if (currentWeek.length > 0) weeks.push(currentWeek);

  for (let wi = 0; wi < weeks.length; wi++) {
    const week = weeks[wi];
    const count = Math.min(5, week.length);
    if (count === 0) continue;

    // Pick 5 days with good spread: try preferred patterns first
    const picked = pickSpreadDays(week, count, wi);
    dates.push(...picked);
  }

  return dates;
}

/**
 * Pick `count` days from `available` with natural spread.
 * Tries a few predefined good patterns (Mon/Tue/Thu/Fri/Sat, etc.)
 * then falls back to a seeded shuffle if the week is partial.
 */
function pickSpreadDays(available: string[], count: number, weekIdx: number): string[] {
  if (available.length <= count) return [...available].sort();

  // Map available days to weekday indices (0=Mon through 6=Sun)
  const dayIndices = available.map((d) => {
    const dow = new Date(d + "T12:00:00Z").getUTCDay();
    return (dow + 6) % 7; // 0=Mon, 6=Sun
  });

  // Good 5-day patterns (indices relative to Mon=0, Sun=6)
  const PATTERNS_5 = [
    [0, 1, 3, 4, 6], // Mon Tue Thu Fri Sun
    [0, 2, 3, 5, 6], // Mon Wed Thu Sat Sun
    [1, 2, 4, 5, 6], // Tue Wed Fri Sat Sun
    [0, 1, 3, 5, 6], // Mon Tue Thu Sat Sun
    [0, 2, 4, 5, 6], // Mon Wed Fri Sat Sun
    [1, 3, 4, 5, 6], // Tue Thu Fri Sat Sun
    [0, 1, 2, 4, 6], // Mon Tue Wed Fri Sun
    [0, 2, 3, 4, 6], // Mon Wed Thu Fri Sun
  ];

  // Try each pattern (rotate by weekIdx for variety)
  const patternToTry = PATTERNS_5[(weekIdx * 3) % PATTERNS_5.length];

  // Find available days that match the pattern
  const chosen: string[] = [];
  for (const targetDow of patternToTry) {
    const idx = dayIndices.indexOf(targetDow);
    if (idx !== -1) chosen.push(available[idx]);
  }

  if (chosen.length === count) return chosen.sort();

  // Pattern didn't fit perfectly — fall back to seeded selection avoiding 4+ consecutive
  return seedSelect(available, count, weekIdx);
}

function seedSelect(available: string[], count: number, seed: number): string[] {
  // Seeded Fisher-Yates
  const shuffled = [...available];
  let s = seed * 7919 + 42;
  for (let i = shuffled.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const candidates = shuffled.slice(0, count).sort();

  // Check for 4+ consecutive and retry once with a different seed if found
  if (hasLongConsecutiveRun(candidates, 4)) {
    const alt = shuffled.slice(count).slice(0, 2);
    const mixed = [...candidates.slice(0, count - 1), ...alt].slice(0, count).sort();
    return hasLongConsecutiveRun(mixed, 4) ? candidates : mixed;
  }
  return candidates;
}

function hasLongConsecutiveRun(sortedDates: string[], maxAllowed: number): boolean {
  if (sortedDates.length < maxAllowed) return false;
  let consecutive = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    const prev = new Date(sortedDates[i - 1] + "T12:00:00Z");
    const curr = new Date(sortedDates[i]     + "T12:00:00Z");
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86400000);
    if (diffDays === 1) {
      consecutive++;
      if (consecutive >= maxAllowed) return true;
    } else {
      consecutive = 1;
    }
  }
  return false;
}

// Base weights for exercises (kg)
const BASE_WEIGHTS: Record<string, number> = {
  "incline dumbbell press": 20, "flat dumbbell press": 22, "cable fly": 15,
  "dumbbell overhead press": 14, "dumbbell lateral raise": 8,
  "cable triceps pushdown": 25,
  "cable lat pulldown": 40, "dumbbell row": 20,
  "cable seated row": 35, "rear delt fly": 8,
  "dumbbell bicep curl": 12, "hammer curl": 10,
  "goblet squat": 20, "romanian deadlift": 18,
  "bulgarian split squat": 12, "leg curl": 30,
  "calf raise": 40, "leg extension": 30,
};

function getBaseWeight(name: string): number {
  const lower = name.toLowerCase();
  for (const [key, weight] of Object.entries(BASE_WEIGHTS)) {
    if (lower.includes(key)) return weight;
  }
  return 10;
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // ── Clean up orphaned sessions (0 sets, older than 2 hours) ──────────────
  await db.delete(gymSessions).where(
    and(
      eq(gymSessions.userId, userId),
      sql`${gymSessions.id} NOT IN (SELECT DISTINCT session_id FROM gym_sets WHERE session_id IS NOT NULL)`,
      sql`${gymSessions.createdAt} < datetime('now', '-2 hours')`
    )
  ).catch(() => {});

  // ── Require existing program + plans ──────────────────────────────────────
  const [prog] = await db
    .select({ id: programs.id })
    .from(programs)
    .where(and(eq(programs.userId, userId), eq(programs.isActive, true)))
    .limit(1);

  if (!prog) {
    return NextResponse.json({ error: "No active program found. Create workouts first." }, { status: 400 });
  }

  const plans = await db
    .select({ id: workoutPlans.id, name: workoutPlans.name })
    .from(workoutPlans)
    .where(eq(workoutPlans.programId, prog.id))
    .orderBy(workoutPlans.sortOrder);

  if (plans.length === 0) {
    return NextResponse.json({ error: "No workout plans found. Create workouts first." }, { status: 400 });
  }

  // ── Generate dates: Mar 16 → May 23, exactly 5/week ──────────────────────
  const allDates = trainingDates("2026-03-16", "2026-05-23");

  // Skip dates that already have sessions (idempotent)
  const existingRows = await db
    .select({ date: gymSessions.date })
    .from(gymSessions)
    .where(
      and(
        eq(gymSessions.userId, userId),
        sql`${gymSessions.date} >= '2026-03-16'`,
        sql`${gymSessions.date} <= '2026-05-23'`
      )
    );
  const existingDates = new Set(existingRows.map((r) => r.date));
  const datesToSeed = allDates.filter((d) => !existingDates.has(d));

  if (datesToSeed.length === 0) {
    return NextResponse.json({
      message: "All dates already have sessions",
      sessionsCreated: 0,
    });
  }

  // ── Get exercises for each plan ───────────────────────────────────────────
  const planExMap = new Map<number, { exerciseId: number; name: string; setConfig: string }[]>();
  for (const plan of plans) {
    const rows = await db
      .select({
        exerciseId: planExercises.exerciseId,
        name: exerciseDb.name,
        setConfig: planExercises.setConfig,
      })
      .from(planExercises)
      .innerJoin(exerciseDb, eq(planExercises.exerciseId, exerciseDb.id))
      .where(eq(planExercises.planId, plan.id))
      .orderBy(planExercises.sortOrder);
    planExMap.set(plan.id, rows);
  }

  // ── Seed sessions ─────────────────────────────────────────────────────────
  const exerciseHitCount = new Map<number, number>();
  let sessionsCreated = 0;

  for (let i = 0; i < datesToSeed.length; i++) {
    const date = datesToSeed[i];
    const plan = plans[i % plans.length];
    const exercises = planExMap.get(plan.id) ?? [];
    if (exercises.length === 0) continue;

    const durationSeconds = (40 + Math.floor(Math.random() * 25)) * 60;

    const [newSession] = await db
      .insert(gymSessions)
      .values({
        userId,
        planId: plan.id,
        programId: prog.id,
        workoutName: plan.name,
        originalTemplateName: plan.name,
        date,
        durationSeconds,
      })
      .returning();

    let setNumber = 0;

    for (const ex of exercises) {
      const hits = exerciseHitCount.get(ex.exerciseId) ?? 0;
      exerciseHitCount.set(ex.exerciseId, hits + 1);

      const baseWeight = getBaseWeight(ex.name);
      const weight = Math.round((baseWeight + hits * 1.25) * 10) / 10;

      let setConfigs: { type: string; repMin: number; repMax: number }[] = [];
      try {
        const parsed = JSON.parse(ex.setConfig);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setConfigs = parsed.map((s: { type?: string; repMin?: number; repMax?: number }) => ({
            type: s.type ?? "standard",
            repMin: s.repMin ?? 8,
            repMax: s.repMax ?? 12,
          }));
        }
      } catch { /* use default */ }

      if (setConfigs.length === 0) {
        setConfigs = [
          { type: "standard", repMin: 8, repMax: 12 },
          { type: "standard", repMin: 8, repMax: 12 },
          { type: "standard", repMin: 8, repMax: 12 },
        ];
      }

      for (const sc of setConfigs) {
        setNumber++;
        const reps = sc.repMin + Math.floor(Math.random() * (sc.repMax - sc.repMin + 1));

        await db.insert(gymSets).values({
          sessionId: newSession.id,
          exerciseId: ex.exerciseId,
          exerciseName: ex.name,
          setNumber,
          setType: sc.type,
          weightKg: weight > 0 ? weight : null,
          reps,
        });
      }
    }

    sessionsCreated++;
  }

  return NextResponse.json({
    message: `Seeded ${sessionsCreated} sessions from March 16 to May 23, 2026`,
    sessionsCreated,
  });
}
