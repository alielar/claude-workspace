/**
 * /workouts — main overview page
 * Dense single-page layout: PR ticker, Up Next, Info tiles, This Week, Calendar, Running.
 */

import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  programs, workoutPlans, planExercises, exerciseDb,
  gymSessions, gymSets, exercisePrs,
} from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { format } from "date-fns";
import Link from "next/link";
import RunningCard from "@/components/workouts/RunningCard";
import PrTickerClient from "@/components/workouts/PrTickerClient";
import MonthCalendar from "@/components/workouts/MonthCalendar";
import WorkoutDrawers from "@/components/workouts/WorkoutDrawers";
import WeeklyVolume from "@/components/workouts/WeeklyVolume";
import UpNextCard from "@/components/workouts/UpNextCard";
import InfoTiles from "@/components/workouts/InfoTiles";
import OpenDrawerButton from "@/components/workouts/OpenDrawerButton";
import CoachTicker from "@/components/workouts/CoachTicker";
import ResumeSessionBanner from "@/components/workouts/ResumeSessionBanner";
import AutoSeedProgram from "@/components/workouts/AutoSeedProgram";

export const dynamic = "force-dynamic";

function todayMadrid(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}

export default async function WorkoutsPage() {
  const session = await auth();
  const userId = session!.user!.id!;
  const today = todayMadrid();
  const now = new Date();
  const todayDow = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][
    new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(now)).getDay()
  ] ?? "mon";

  // ── Plans — find workout plans from the ACTIVE program only ─────────────
  type PlanRow = {
    id: number; programId: number; name: string; type: string; sortOrder: number;
    assignedDays: string | null; targetMuscles: string | null;
  };
  let plans: PlanRow[] = await db
    .select({
      id: workoutPlans.id,
      programId: workoutPlans.programId,
      name: workoutPlans.name,
      type: workoutPlans.type,
      sortOrder: workoutPlans.sortOrder,
      assignedDays: workoutPlans.assignedDays,
      targetMuscles: workoutPlans.targetMuscles,
    })
    .from(workoutPlans)
    .innerJoin(programs, eq(workoutPlans.programId, programs.id))
    .where(and(eq(programs.userId, userId), eq(programs.isActive, true)))
    .orderBy(workoutPlans.sortOrder);

  // ── PRs ────────────────────────────────────────────────────────────────────
  const prs = await db
    .select({
      id: exercisePrs.id,
      exerciseId: exercisePrs.exerciseId,
      exerciseName: exercisePrs.exerciseName,
      muscleGroup: exerciseDb.primaryMuscle,
      bestWeightKg: exercisePrs.bestWeightKg,
      bestReps: exercisePrs.bestReps,
      estimated1rm: exercisePrs.estimated1rm,
      achievedAt: exercisePrs.achievedAt,
    })
    .from(exercisePrs)
    .leftJoin(exerciseDb, eq(exercisePrs.exerciseId, exerciseDb.id))
    .where(eq(exercisePrs.userId, userId))
    .orderBy(desc(exercisePrs.achievedAt))
    .limit(6);

  // ── Session count YTD ─────────────────────────────────────────────────────
  const sessionYTD = await db
    .select({ count: sql<number>`count(*)` })
    .from(gymSessions)
    .where(and(eq(gymSessions.userId, userId), sql`${gymSessions.date} >= ${format(now, "yyyy")}-01-01`));
  const ytdCount = sessionYTD[0]?.count ?? 0;

  // ── Check for unfinished (in-progress) sessions ───────────────────────────
  const [activeSession] = await db
    .select({ id: gymSessions.id, workoutName: gymSessions.workoutName, date: gymSessions.date })
    .from(gymSessions)
    .where(and(
      eq(gymSessions.userId, userId),
      sql`${gymSessions.durationSeconds} IS NULL`,
    ))
    .orderBy(desc(gymSessions.createdAt))
    .limit(1);

  // ── Check if today's workout already done ─────────────────────────────────
  const todaySessions = await db
    .select({ planId: gymSessions.planId })
    .from(gymSessions)
    .where(and(eq(gymSessions.userId, userId), eq(gymSessions.date, today)));
  const doneTodayPlanIds = new Set(todaySessions.map(s => s.planId).filter(Boolean));

  // ── Determine "Up Next" from day-of-week assignments ──────────────────────
  const DOW_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const todayIdx = DOW_ORDER.indexOf(todayDow);
  let upNextPlan: PlanRow | null = null;

  // Check today first, then upcoming days — skip plans already done today
  for (let offset = 0; offset < 7 && !upNextPlan; offset++) {
    const dow = DOW_ORDER[(todayIdx + offset) % 7];
    for (const p of plans) {
      if (!p.assignedDays) continue;
      // Skip if this plan was already completed today and we're checking today
      if (offset === 0 && doneTodayPlanIds.has(p.id)) continue;
      try {
        const days: string[] = JSON.parse(p.assignedDays);
        if (days.includes(dow)) { upNextPlan = p; break; }
      } catch { /* skip */ }
    }
  }
  if (!upNextPlan && plans.length > 0) upNextPlan = plans[0];

  // ── Exercise counts + exercises for Up Next ───────────────────────────────
  const exCountMap = new Map<number, number>();
  if (plans.length > 0) {
    const planExCounts = await Promise.all(
      plans.map(async (p) => {
        const [row] = await db
          .select({ count: sql<number>`count(*)` })
          .from(planExercises)
          .where(eq(planExercises.planId, p.id));
        return { planId: p.id, count: row?.count ?? 0 };
      })
    );
    for (const r of planExCounts) exCountMap.set(r.planId, r.count);
  }

  // Get exercises for all plans (for UpNextCard)
  const planExerciseMap = new Map<number, { name: string; primaryMuscle: string | null }[]>();
  if (plans.length > 0) {
    for (const p of plans) {
      const rows = await db
        .select({ name: exerciseDb.name, primaryMuscle: exerciseDb.primaryMuscle })
        .from(planExercises)
        .innerJoin(exerciseDb, eq(planExercises.exerciseId, exerciseDb.id))
        .where(eq(planExercises.planId, p.id))
        .orderBy(planExercises.sortOrder)
        .limit(8);
      planExerciseMap.set(p.id, rows);
    }
  }

  // ── Last-done map ─────────────────────────────────────────────────────────
  const recentSessions = plans.length > 0
    ? await db
        .select({ planId: gymSessions.planId, date: gymSessions.date })
        .from(gymSessions)
        .where(and(eq(gymSessions.userId, userId), sql`${gymSessions.planId} IS NOT NULL`))
        .orderBy(desc(gymSessions.date))
        .limit(20)
    : [];

  const lastDoneMap = new Map<number, string>();
  for (const s of recentSessions) {
    if (s.planId && !lastDoneMap.has(s.planId)) lastDoneMap.set(s.planId, s.date);
  }

  // ── Month calendar data ────────────────────────────────────────────────────
  const monthStart = `${today.slice(0, 7)}-01`;
  const lastDayOfMonth = new Date(parseInt(today.slice(0, 4)), parseInt(today.slice(5, 7)), 0).getDate();
  const monthEnd = `${today.slice(0, 7)}-${String(lastDayOfMonth).padStart(2, "0")}`;

  const monthSessions = await db
    .select({
      id: gymSessions.id,
      date: gymSessions.date,
      workoutName: gymSessions.workoutName,
      durationSeconds: gymSessions.durationSeconds,
    })
    .from(gymSessions)
    .where(
      and(
        eq(gymSessions.userId, userId),
        sql`${gymSessions.date} >= ${monthStart}`,
        sql`${gymSessions.date} <= ${monthEnd}`
      )
    );

  const monthSessionIds = monthSessions.map((s) => s.id);
  const monthAgg = monthSessionIds.length > 0
    ? await db
        .select({
          sessionId: gymSets.sessionId,
          setCount: sql<number>`count(*)`.as("set_count"),
          totalVolume: sql<number>`sum(coalesce(weight_kg, 0) * coalesce(reps, 0))`.as("total_volume"),
        })
        .from(gymSets)
        .where(sql`${gymSets.sessionId} in (${sql.join(monthSessionIds.map((id) => sql`${id}`), sql`,`)})`)
        .groupBy(gymSets.sessionId)
    : [];

  const monthAggMap = new Map(monthAgg.map((r) => [r.sessionId, r]));

  const calendarSessions = monthSessions
    .filter((s) => monthAggMap.has(s.id))
    .map((s) => {
      const agg = monthAggMap.get(s.id)!;
      return {
        id: s.id,
        date: s.date,
        sessionName: s.workoutName,
        workoutName: s.workoutName,
        durationSeconds: s.durationSeconds,
        setCount: agg.setCount,
        totalVolume: Math.round(agg.totalVolume),
      };
    });

  const allAssignedDays: string[] = [];
  for (const p of plans) {
    if (p.assignedDays) {
      try {
        const days: string[] = JSON.parse(p.assignedDays);
        for (const d of days) {
          if (!allAssignedDays.includes(d)) allAssignedDays.push(d);
        }
      } catch { /* ignore */ }
    }
  }

  const weekNum = format(now, "w");
  const expectedPlanNames = ["Push", "Pull", "Legs", "Upper"];
  const hasCorrectProgram = plans.length === 4 && expectedPlanNames.every(n => plans.some(p => p.name === n));
  const hasWorkouts = hasCorrectProgram;

  // ── Prepare UpNextCard plan data ──────────────────────────────────────────
  const upNextPlans = plans.map(p => ({
    id: p.id,
    name: p.name,
    assignedDays: p.assignedDays,
    targetMuscles: p.targetMuscles,
    exerciseCount: exCountMap.get(p.id) ?? 0,
    lastDone: lastDoneMap.get(p.id) ?? null,
    exercises: planExerciseMap.get(p.id) ?? [],
  }));

  const infoTilePlans = plans.map(p => ({
    id: p.id,
    name: p.name,
    assignedDays: p.assignedDays,
    targetMuscles: p.targetMuscles,
    exerciseCount: exCountMap.get(p.id) ?? 0,
  }));

  // Hidden drawer triggers
  const drawerComponent = <WorkoutDrawers mode="hidden" />;

  return (
    <div className="page-enter" style={{ padding: "28px 32px 64px", maxWidth: 1500, margin: "0 auto" }}>

      {/* ── Page title ────────────────────────────────────────────────────── */}
      <div className="cc-pagetitle" style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>Workouts<span className="grad-text">.</span></h1>
          <div className="sub">
            {hasWorkouts
              ? `${plans.map((p) => p.name).join(" · ")} · Week ${weekNum} · ${ytdCount} sessions YTD`
              : `Week ${weekNum} · ${ytdCount} sessions YTD`
            }
          </div>
        </div>
        <OpenDrawerButton
          drawer="exercises"
          className="cc-btn"
          style={{ fontSize: 12, padding: "6px 14px" }}
        >
          Exercises
        </OpenDrawerButton>
      </div>

      {/* ── PR Ticker ────────────────────────────────────────────────────── */}
      {prs.length > 0 && <PrTickerClient initialPrs={prs} />}

      {/* ── Coach Notes ticker — rolling weekly insight + overload calls ──── */}
      <CoachTicker />

      {/* ── Resume in-progress session banner ───────────────────────────── */}
      {activeSession && (
        <ResumeSessionBanner
          sessionId={activeSession.id}
          workoutName={activeSession.workoutName}
          date={activeSession.date}
        />
      )}

      {/* ── Up Next hero (or empty state if no workouts) ─────────────────── */}
      {hasWorkouts && upNextPlan ? (
        <UpNextCard
          plans={upNextPlans}
          initialPlanId={upNextPlan.id}
          todayDow={todayDow}
        />
      ) : (
        <div className="cc-card" style={{ padding: 0, overflow: "visible" }}>
          <div style={{
            padding: "48px 40px", textAlign: "center",
            background: `
              radial-gradient(50% 60% at 50% 0%, rgba(124,77,255,0.08), transparent 70%),
              var(--bg-card)`,
          }}>
            <div className="cc-grad-text" style={{
              fontSize: 48, fontWeight: 200, letterSpacing: "-0.04em",
            }}>
              Setting up…
            </div>
            <p style={{ color: "var(--ink-3)", fontSize: 14, lineHeight: 1.6, maxWidth: 420, margin: "0 auto 28px" }}>
              Your 4-Day Split program is being activated. This page will refresh automatically.
            </p>
            <AutoSeedProgram />
          </div>
        </div>
      )}

      {/* ── Info tiles (Workouts / Exercises / Analytics) — always visible ── */}
      <InfoTiles plans={infoTilePlans} />

      {/* ── Bottom row: This Week + Calendar + Running — always visible ───── */}
      <div className="workout-bottom-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
        <div>
          <WeeklyVolume />
          <RunningCard />
        </div>
        <div>
          <MonthCalendar
            initialSessions={calendarSessions}
            assignedDays={allAssignedDays}
            today={today}
            upNextPlanId={upNextPlan?.id ?? null}
            monthSessionCount={calendarSessions.length}
          />
        </div>
      </div>

      {drawerComponent}
    </div>
  );
}
