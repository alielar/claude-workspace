"use server";
/**
 * /workouts — main overview page
 * Handles both: empty state (no workouts) and populated state (workouts exist).
 */

import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  programs, workoutPlans, planExercises, exerciseDb,
  gymSessions, gymSets, exercisePrs,
} from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import Link from "next/link";
import { format, differenceInDays } from "date-fns";
import RunningCard from "@/components/workouts/RunningCard";
import PrTickerClient from "@/components/workouts/PrTickerClient";
import MonthCalendar from "@/components/workouts/MonthCalendar";
import WorkoutDrawers from "@/components/workouts/WorkoutDrawers";
import OpenDrawerButton from "@/components/workouts/OpenDrawerButton";

function todayMadrid(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}

function daysAgo(dateStr: string): string {
  const d = differenceInDays(new Date(todayMadrid()), new Date(dateStr));
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  return `${d}d ago`;
}

const MUSCLE_LABELS: Record<string, string> = {
  chest: "Chest", front_delts: "Front Delts", side_delts: "Side Delts",
  rear_delts: "Rear Delts", triceps: "Triceps", biceps: "Biceps",
  lats: "Lats", upper_back: "Upper Back", traps: "Traps",
  quads: "Quads", hamstrings: "Hams", glutes: "Glutes",
  calves: "Calves", abs: "Abs", obliques: "Obliques",
  forearms: "Forearms", serratus: "Serratus",
};

const DAY_LABELS: Record<string, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

export default async function WorkoutsPage() {
  const session = await auth();
  const userId = session!.user!.id!;
  const today = todayMadrid();
  const now = new Date();
  const todayDow = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][
    new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(now)).getDay()
  ] ?? "mon";

  // ── Active program ────────────────────────────────────────────────────────
  const [activeProgram] = await db
    .select()
    .from(programs)
    .where(and(eq(programs.userId, userId), eq(programs.isActive, true)))
    .limit(1);

  // ── Plans (if any) ────────────────────────────────────────────────────────
  // Use raw SQL to gracefully handle missing columns (assigned_days, target_muscles)
  // during builds before migration has run
  type PlanRow = {
    id: number; programId: number; name: string; type: string; sortOrder: number;
    assignedDays: string | null; targetMuscles: string | null;
  };
  let plans: PlanRow[] = [];
  if (activeProgram) {
    try {
      plans = (await db
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
        .where(eq(workoutPlans.programId, activeProgram.id))
        .orderBy(workoutPlans.sortOrder));
    } catch {
      // Fallback: columns don't exist yet (pre-migration)
      const fallback = await db
        .select({
          id: workoutPlans.id,
          programId: workoutPlans.programId,
          name: workoutPlans.name,
          type: workoutPlans.type,
          sortOrder: workoutPlans.sortOrder,
        })
        .from(workoutPlans)
        .where(eq(workoutPlans.programId, activeProgram.id))
        .orderBy(workoutPlans.sortOrder);
      plans = fallback.map((p) => ({ ...p, assignedDays: null, targetMuscles: null }));
    }
  }

  // ── PRs (always show, historical data) ────────────────────────────────────
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

  // ── Determine "Up Next" from day-of-week assignments ──────────────────────
  const todaysPlans = plans.filter((p) => {
    if (!p.assignedDays) return false;
    try {
      const days: string[] = JSON.parse(p.assignedDays);
      return days.includes(todayDow);
    } catch { return false; }
  });
  const upNextPlan = todaysPlans[0] ?? plans[0] ?? null;
  const isRestDay = todaysPlans.length === 0 && plans.length > 0;

  // ── Exercise counts + exercises for Up Next ───────────────────────────────
  let upNextExercises: { name: string; primaryMuscle: string | null }[] = [];
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

    if (upNextPlan) {
      upNextExercises = await db
        .select({ name: exerciseDb.name, primaryMuscle: exerciseDb.primaryMuscle })
        .from(planExercises)
        .innerJoin(exerciseDb, eq(planExercises.exerciseId, exerciseDb.id))
        .where(eq(planExercises.planId, upNextPlan.id))
        .orderBy(planExercises.sortOrder)
        .limit(8);
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

  // ── Parse target muscles for display ──────────────────────────────────────
  function parseMuscles(plan: typeof plans[0]): string {
    if (!plan.targetMuscles) return "";
    try {
      const arr: string[] = JSON.parse(plan.targetMuscles);
      return arr.map((m) => MUSCLE_LABELS[m] ?? m).join(" · ");
    } catch { return ""; }
  }

  function parseDays(plan: typeof plans[0]): string {
    if (!plan.assignedDays) return "";
    try {
      const arr: string[] = JSON.parse(plan.assignedDays);
      return arr.map((d) => DAY_LABELS[d] ?? d).join(", ");
    } catch { return ""; }
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

  // Aggregate set counts + volume for month sessions
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

  const calendarSessions = monthSessions.map((s) => {
    const agg = monthAggMap.get(s.id);
    return {
      id: s.id,
      date: s.date,
      sessionName: s.workoutName,
      workoutName: s.workoutName,
      durationSeconds: s.durationSeconds,
      setCount: agg?.setCount ?? 0,
      totalVolume: Math.round(agg?.totalVolume ?? 0),
    };
  });

  // Collect all assigned days across all plans
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

  const hasWorkouts = plans.length > 0;

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <div className="page-enter" style={{ padding: "28px 32px 64px", maxWidth: 1500, margin: "0 auto" }}>

      {/* ── Page title ────────────────────────────────────────────────────── */}
      <div className="cc-pagetitle" style={{ marginBottom: 26 }}>
        <div>
          <h1>Workouts<span className="grad-text">.</span></h1>
          <div className="sub">
            {hasWorkouts
              ? `${plans.map((p) => p.name).join(" · ")} · Week ${weekNum} · ${ytdCount} sessions YTD`
              : `Week ${weekNum} · ${ytdCount} sessions YTD`
            }
          </div>
        </div>
        <WorkoutDrawers mode="hidden" />
      </div>

      {/* ── PR Ticker ────────────────────────────────────────────────────── */}
      {prs.length > 0 && <PrTickerClient initialPrs={prs} />}

      {/* ── Main 2-col layout ────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "8fr 4fr", gap: 14 }}>

        {/* LEFT */}
        <div>
          {hasWorkouts && upNextPlan ? (
            <>
              {/* ── Up Next hero card ────────────────────────────────────── */}
              <div className="cc-card" style={{
                marginBottom: 14, padding: 0, overflow: "hidden",
                background: `
                  radial-gradient(60% 80% at 0% 0%, rgba(179,136,255,0.16), transparent 60%),
                  radial-gradient(50% 80% at 100% 100%, rgba(126,231,255,0.10), transparent 60%),
                  var(--bg-card)`,
              }}>
                <div style={{ padding: "30px 32px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10.5, letterSpacing: "0.20em", textTransform: "uppercase" as const, color: "var(--ink-3)", marginBottom: 12 }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: isRestDay ? "var(--ink-4)" : "var(--cyan)", boxShadow: isRestDay ? "none" : "0 0 8px var(--cyan)", flexShrink: 0 }} />
                        {isRestDay ? "Rest day · no session planned" : `Today · ${upNextPlan.name}`}
                      </div>
                      <div style={{
                        fontSize: 64, fontWeight: 200, letterSpacing: "-0.04em", lineHeight: 0.9,
                        background: "var(--grad)", WebkitBackgroundClip: "text", backgroundClip: "text",
                        color: "transparent", filter: "drop-shadow(0 0 24px rgba(179,136,255,0.20))",
                      }}>
                        {upNextPlan.name.toUpperCase()}
                      </div>
                      <div style={{ display: "flex", gap: 18, marginTop: 14, color: "var(--ink-2)", fontSize: 12.5, alignItems: "center", flexWrap: "wrap" as const }}>
                        <span>{exCountMap.get(upNextPlan.id) ?? 0} exercises</span>
                        {parseMuscles(upNextPlan) && (
                          <>
                            <span style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--ink-4)" }} />
                            <span>{parseMuscles(upNextPlan)}</span>
                          </>
                        )}
                        {parseDays(upNextPlan) && (
                          <>
                            <span style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--ink-4)" }} />
                            <span>{parseDays(upNextPlan)}</span>
                          </>
                        )}
                        {lastDoneMap.get(upNextPlan.id) && (
                          <>
                            <span style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--ink-4)" }} />
                            <span>last: {daysAgo(lastDoneMap.get(upNextPlan.id)!)}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <Link
                      href={`/workouts/session/new?planId=${upNextPlan.id}`}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 10,
                        padding: "14px 22px", borderRadius: 10,
                        background: "var(--grad)", color: "#0A0A14",
                        fontSize: 14, fontWeight: 600, letterSpacing: "-0.005em",
                        boxShadow: "0 0 24px rgba(179,136,255,0.30), inset 0 1px 0 rgba(255,255,255,0.40)",
                        flexShrink: 0,
                      }}
                    >
                      Start session
                    </Link>
                  </div>

                  {/* Exercise preview grid */}
                  {upNextExercises.length > 0 && (
                    <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                      {upNextExercises.map((ex, i) => (
                        <div key={i} style={{
                          display: "grid", gridTemplateColumns: "24px 1fr auto",
                          alignItems: "center", gap: 12, padding: "10px 14px",
                          border: "1px solid var(--line)", borderRadius: 10,
                          background: "rgba(255,255,255,0.018)", fontSize: 13,
                        }}>
                          <span style={{ fontFamily: "var(--f-mono)", color: "var(--ink-4)", fontSize: 10.5, letterSpacing: "0.06em" }}>
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span style={{ color: "var(--ink)" }}>{ex.name}</span>
                          <span style={{ fontFamily: "var(--f-mono)", color: "var(--ink-3)", fontSize: 11.5 }}>
                            {MUSCLE_LABELS[ex.primaryMuscle ?? ""] ?? ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Footer */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--line)" }}>
                    <div style={{ display: "flex", gap: 24, fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.02em" }}>
                      <span><strong style={{ color: "var(--ink)", fontWeight: 500, fontFamily: "var(--f-mono)", marginRight: 4 }}>{exCountMap.get(upNextPlan.id) ?? 0}</strong>exercises</span>
                    </div>
                    <Link href={`/workouts/templates/${upNextPlan.id}`} style={{ fontSize: 11, color: "var(--ink-4)", letterSpacing: "0.04em" }}>
                      Edit workout →
                    </Link>
                  </div>
                </div>
              </div>

              {/* ── All Sessions grid ─────────────────────────────────────── */}
              <div className="cc-card">
                <div className="cc-card-head">
                  <div className="title">All Workouts</div>
                  <div className="tail">{plans.length} workouts</div>
                </div>
                <div className="cc-card-body">
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                    {plans.map((p) => {
                      const isNext = p.id === upNextPlan.id;
                      const lastDate = lastDoneMap.get(p.id);
                      const muscles = parseMuscles(p);
                      const days = parseDays(p);
                      return (
                        <Link key={p.id} href={`/workouts/session/new?planId=${p.id}`} style={{ display: "block", textDecoration: "none" }}>
                          <div style={{
                            padding: 16, borderRadius: 12, cursor: "pointer", position: "relative", transition: "all 0.12s",
                            border: `1px solid ${isNext ? "rgba(179,136,255,0.30)" : "var(--line)"}`,
                            background: isNext
                              ? "radial-gradient(70% 80% at 0% 0%, rgba(179,136,255,0.12), transparent 60%), rgba(255,255,255,0.025)"
                              : "rgba(255,255,255,0.018)",
                          }}>
                            {isNext && (
                              <span style={{ position: "absolute", top: 8, right: 8, fontSize: 8.5, fontFamily: "var(--f-mono)", color: "var(--cyan)", letterSpacing: "0.12em" }}>
                                NEXT
                              </span>
                            )}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                              <div style={{ fontSize: 16, fontWeight: 500, letterSpacing: "-0.005em" }}>{p.name}</div>
                              <div style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: "0.04em", fontFamily: "var(--f-mono)" }}>
                                {exCountMap.get(p.id) ?? 0} ex
                              </div>
                            </div>
                            {muscles && (
                              <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 4, letterSpacing: "0.01em" }}>
                                {muscles}
                              </div>
                            )}
                            {days && (
                              <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 4, fontFamily: "var(--f-mono)", letterSpacing: "0.04em" }}>
                                {days}
                              </div>
                            )}
                            {lastDate && (
                              <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 4, fontFamily: "var(--f-mono)", letterSpacing: "0.04em" }}>
                                last: {daysAgo(lastDate)}
                              </div>
                            )}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* ── EMPTY STATE — no workouts ──────────────────────────────── */
            <div className="cc-card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{
                padding: "48px 40px", textAlign: "center",
                background: `
                  radial-gradient(50% 60% at 50% 0%, rgba(179,136,255,0.08), transparent 70%),
                  var(--bg-card)`,
              }}>
                <div style={{
                  fontSize: 48, fontWeight: 200, letterSpacing: "-0.04em", lineHeight: 1,
                  background: "var(--grad)", WebkitBackgroundClip: "text", backgroundClip: "text",
                  color: "transparent", marginBottom: 16,
                }}>
                  Build your program
                </div>
                <p style={{ color: "var(--ink-3)", fontSize: 14, lineHeight: 1.6, maxWidth: 420, margin: "0 auto 28px" }}>
                  Create your workouts: Push, Pull, Legs, or whatever splits you want.
                  Assign days, pick exercises, and start logging.
                </p>
                <OpenDrawerButton
                  drawer="workouts"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    padding: "14px 28px", borderRadius: 10,
                    background: "var(--grad)", color: "#0A0A14",
                    fontSize: 15, fontWeight: 600, letterSpacing: "-0.005em",
                    boxShadow: "0 0 24px rgba(179,136,255,0.30), inset 0 1px 0 rgba(255,255,255,0.40)",
                    border: "none", cursor: "pointer",
                  }}
                >
                  + Create your first workout
                </OpenDrawerButton>

                {/* Historical session count */}
                {ytdCount > 0 && (
                  <div style={{ marginTop: 24, fontSize: 11, color: "var(--ink-4)", letterSpacing: "0.04em" }}>
                    {ytdCount} sessions logged · your history and PRs are preserved
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Section cards ────────────────────────────────────────── */}
          <WorkoutDrawers mode="cards" />
        </div>

        {/* RIGHT */}
        <div>
          {/* Month calendar */}
          <MonthCalendar
            initialSessions={calendarSessions}
            assignedDays={allAssignedDays}
            today={today}
            upNextPlanId={upNextPlan?.id ?? null}
            monthSessionCount={calendarSessions.length}
          />

          {/* Running card */}
          <RunningCard />
        </div>
      </div>
    </div>
  );
}
