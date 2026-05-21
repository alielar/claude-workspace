"use server";
/**
 * /workouts — main overview page
 * Wired to: programs, workout_plans, plan_exercises, exercise_db,
 *           gym_sessions, exercise_prs
 */

import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  programs, workoutPlans, planExercises, exerciseDb,
  gymSessions, exercisePrs,
} from "@/db/schema";
import { eq, and, desc, isNotNull, sql } from "drizzle-orm";
import Link from "next/link";
import { format, startOfWeek, addDays, differenceInDays } from "date-fns";

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
  lats: "Lats", upper_back: "Upper Back", upper_traps: "Upper Traps",
  quads: "Quads", hamstrings: "Hams", glutes: "Glutes",
  calves: "Calves", abs: "Abs", obliques: "Obliques",
  forearms: "Forearms", serratus: "Serratus", unknown: "—",
};

const PLAN_MUSCLES: Record<string, string> = {
  Push: "Chest · Shoulders · Triceps",
  Pull: "Back · Biceps · Traps · Forearms",
  Legs: "Quads · Hams · Glutes · Calves",
  "Push-Up SESH": "Calisthenics · Core · Skill",
};

const PLAN_DURATION: Record<string, string> = {
  Push: "~47m", Pull: "~44m", Legs: "~33m", "Push-Up SESH": "~17m",
};

export default async function WorkoutsPage() {
  const session = await auth();
  const userId = session!.user!.id!;
  const today = todayMadrid();
  const now = new Date();

  // ── Active program ────────────────────────────────────────────────────────
  const [activeProgram] = await db
    .select()
    .from(programs)
    .where(and(eq(programs.userId, userId), eq(programs.isActive, true)))
    .limit(1);

  // If no active program, show empty state
  if (!activeProgram) {
    return (
      <div style={{ padding: "28px 32px 64px", maxWidth: 1500, margin: "0 auto" }}>
        <div className="cc-pagetitle">
          <div>
            <h1>Workouts<span className="grad-text">.</span></h1>
            <div className="sub">No active program</div>
          </div>
        </div>
        <div className="cc-card" style={{ padding: 48, textAlign: "center" }}>
          <p style={{ color: "var(--ink-3)", marginBottom: 20 }}>
            No active program found. Run the import script to load your Beta program.
          </p>
          <Link href="/workouts/templates" className="cc-btn cc-btn-primary">
            Manage Programs
          </Link>
        </div>
      </div>
    );
  }

  // ── Plans with exercise counts ────────────────────────────────────────────
  const plans = await db
    .select({
      id: workoutPlans.id,
      name: workoutPlans.name,
      type: workoutPlans.type,
      sortOrder: workoutPlans.sortOrder,
    })
    .from(workoutPlans)
    .where(eq(workoutPlans.programId, activeProgram.id))
    .orderBy(workoutPlans.sortOrder);

  const planExCounts = await Promise.all(
    plans.map(async (p) => {
      const [row] = await db
        .select({ count: sql<number>`count(*)` })
        .from(planExercises)
        .where(eq(planExercises.planId, p.id));
      return { planId: p.id, count: row?.count ?? 0 };
    })
  );
  const exCountMap = new Map(planExCounts.map((r) => [r.planId, r.count]));

  // ── "Up Next" — plan done least recently ────────────────────────────────
  const recentSessions = await db
    .select({ planId: gymSessions.planId, date: gymSessions.date })
    .from(gymSessions)
    .where(and(eq(gymSessions.userId, userId), isNotNull(gymSessions.planId)))
    .orderBy(desc(gymSessions.date))
    .limit(20);

  // For each plan, find its most recent session date
  const lastDoneMap = new Map<number, string>();
  for (const s of recentSessions) {
    if (s.planId && !lastDoneMap.has(s.planId)) {
      lastDoneMap.set(s.planId, s.date);
    }
  }

  // "Up Next" = plan with oldest (or no) last-done date
  const plansWithLastDone = plans.map((p) => ({
    ...p,
    lastDone: lastDoneMap.get(p.id) ?? "1970-01-01",
  }));
  plansWithLastDone.sort((a, b) => a.lastDone.localeCompare(b.lastDone));
  const upNextPlan = plansWithLastDone[0];

  // Get exercises for Up Next plan
  const upNextExercises = await db
    .select({ name: exerciseDb.name, primaryMuscle: exerciseDb.primaryMuscle })
    .from(planExercises)
    .innerJoin(exerciseDb, eq(planExercises.exerciseId, exerciseDb.id))
    .where(eq(planExercises.planId, upNextPlan.id))
    .orderBy(planExercises.sortOrder)
    .limit(8);

  const upNextLastDate = lastDoneMap.get(upNextPlan.id);

  // ── PRs ───────────────────────────────────────────────────────────────────
  const prs = await db
    .select()
    .from(exercisePrs)
    .where(eq(exercisePrs.userId, userId))
    .orderBy(desc(exercisePrs.achievedAt))
    .limit(6);

  // ── This week's gym sessions ──────────────────────────────────────────────
  const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const weekEnd = format(addDays(startOfWeek(now, { weekStartsOn: 1 }), 6), "yyyy-MM-dd");

  const weekSessions = await db
    .select({ date: gymSessions.date, planId: gymSessions.planId, workoutName: gymSessions.workoutName })
    .from(gymSessions)
    .where(
      and(
        eq(gymSessions.userId, userId),
        sql`${gymSessions.date} >= ${weekStart}`,
        sql`${gymSessions.date} <= ${weekEnd}`
      )
    );

  const weekSessionMap = new Map<string, string>(); // date → workoutName
  for (const s of weekSessions) weekSessionMap.set(s.date, s.workoutName);

  // ── Build week strip ─────────────────────────────────────────────────────
  const mon = startOfWeek(now, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(mon, i);
    const dateStr = format(d, "yyyy-MM-dd");
    const sessionName = weekSessionMap.get(dateStr);
    // Extract short name: "Beta (Push)" → "Push"
    const shortName = sessionName?.match(/\((.+)\)/)?.[1] ?? null;
    return {
      dow: format(d, "EEE").toUpperCase(),
      dnum: format(d, "d"),
      dateStr,
      sessionName: shortName,
      isToday: dateStr === today,
      isRest: !shortName && dateStr < today,
    };
  });

  const weekNum = format(now, "w");
  const sessionYTD = await db
    .select({ count: sql<number>`count(*)` })
    .from(gymSessions)
    .where(and(eq(gymSessions.userId, userId), sql`${gymSessions.date} >= ${format(now, "yyyy")}-01-01`));

  return (
    <div className="page-enter" style={{ padding: "28px 32px 64px", maxWidth: 1500, margin: "0 auto" }}>

      {/* ── Page title ────────────────────────────────────────────────────── */}
      <div className="cc-pagetitle" style={{ marginBottom: 26 }}>
        <div>
          <h1>Workouts<span className="grad-text">.</span></h1>
          <div className="sub">
            {activeProgram.name} · Push · Pull · Legs · Wk {weekNum} of {format(now, "yyyy")} · {sessionYTD[0]?.count ?? 0} sessions YTD
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/workouts/history" className="cc-btn">History</Link>
          <Link href="/workouts/templates" className="cc-btn">Templates</Link>
          <Link href="/workouts/exercises" className="cc-btn">Exercises</Link>
        </div>
      </div>

      {/* ── PR Ticker ─────────────────────────────────────────────────────── */}
      {prs.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div className="cc-sechead">
            Recent PRs
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-4)", letterSpacing: "0.04em", textTransform: "none", fontWeight: 400 }}>
              personal records · all time
            </span>
          </div>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6, scrollbarWidth: "thin" as const }}>
            {prs.map((pr) => (
              <div key={pr.id} style={{ flexShrink: 0, padding: "14px 18px", border: "1px solid var(--line)", borderRadius: 12, background: "rgba(255,255,255,0.018)", minWidth: 220 }}>
                <div style={{ fontSize: 9.5, letterSpacing: "0.20em", textTransform: "uppercase" as const, color: "var(--warn)", fontWeight: 600 }}>
                  ↑ {pr.exerciseName}
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>
                  {MUSCLE_LABELS[pr.exerciseName] ?? ""}
                </div>
                <div style={{ fontSize: 22, fontWeight: 300, letterSpacing: "-0.02em", marginTop: 4, fontFamily: "var(--f-mono)", color: "var(--ink)" }}>
                  {pr.bestWeightKg != null ? `${pr.bestWeightKg}` : "BW"}
                  <span style={{ color: "var(--ink-3)", fontSize: 13 }}>
                    {pr.bestWeightKg != null ? " kg" : ""}
                    {pr.bestReps != null ? ` × ${pr.bestReps}` : ""}
                  </span>
                </div>
                {pr.estimated1rm != null && (
                  <div style={{ fontSize: 10, color: "var(--ink-4)", letterSpacing: "0.04em", marginTop: 2, fontFamily: "var(--f-mono)" }}>
                    est. 1RM {pr.estimated1rm}kg · {daysAgo(pr.achievedAt)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Main 2-col layout (8fr / 4fr) ────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "8fr 4fr", gap: 14 }}>

        {/* LEFT */}
        <div>

          {/* Up Next hero card */}
          <div className="cc-card" style={{
            marginBottom: 14, padding: 0, overflow: "hidden",
            background: `
              radial-gradient(60% 80% at 0% 0%, rgba(179,136,255,0.16), transparent 60%),
              radial-gradient(50% 80% at 100% 100%, rgba(126,231,255,0.10), transparent 60%),
              var(--bg-card)`,
          }}>
            <div style={{ padding: "30px 32px" }}>
              {/* Label + Start button */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10.5, letterSpacing: "0.20em", textTransform: "uppercase" as const, color: "var(--ink-3)", marginBottom: 12 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--cyan)", boxShadow: "0 0 8px var(--cyan)", flexShrink: 0 }} />
                    Up Next · today
                  </div>
                  <div style={{
                    fontSize: 64, fontWeight: 200, letterSpacing: "-0.04em", lineHeight: 0.9,
                    background: "var(--grad)", WebkitBackgroundClip: "text", backgroundClip: "text",
                    color: "transparent", filter: "drop-shadow(0 0 24px rgba(179,136,255,0.20))",
                  }}>
                    {upNextPlan.name.toUpperCase()}
                  </div>
                  <div style={{ display: "flex", gap: 18, marginTop: 14, color: "var(--ink-2)", fontSize: 12.5, alignItems: "center", flexWrap: "wrap" as const }}>
                    <span>{PLAN_DURATION[upNextPlan.name] ?? "~45m"} · {exCountMap.get(upNextPlan.id) ?? 0} exercises</span>
                    <span style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--ink-4)" }} />
                    <span>{PLAN_MUSCLES[upNextPlan.name] ?? ""}</span>
                    {upNextLastDate && (
                      <>
                        <span style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--ink-4)" }} />
                        <span>last: {daysAgo(upNextLastDate)}</span>
                      </>
                    )}
                  </div>
                </div>
                {/* Start Session button — Sub-Phase 3 route */}
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
                  ▶ Start session
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
                  <span><strong style={{ color: "var(--ink)", fontWeight: 500, fontFamily: "var(--f-mono)", marginRight: 4 }}>{activeProgram.name}</strong>· Cycle {activeProgram.cycles ?? "?"}</span>
                  <span><strong style={{ color: "var(--ink)", fontWeight: 500, fontFamily: "var(--f-mono)", marginRight: 4 }}>{exCountMap.get(upNextPlan.id) ?? 0}</strong>exercises</span>
                </div>
                <Link href={`/workouts/templates/${upNextPlan.id}`} style={{ fontSize: 11, color: "var(--ink-4)", letterSpacing: "0.04em" }}>
                  Edit template →
                </Link>
              </div>
            </div>
          </div>

          {/* All Sessions grid */}
          <div className="cc-card">
            <div className="cc-card-head">
              <div className="title">All Sessions</div>
              <div className="tail">{plans.length} templates · tap to start</div>
            </div>
            <div className="cc-card-body">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {plans.map((p) => {
                  const isNext = p.id === upNextPlan.id;
                  const lastDate = lastDoneMap.get(p.id);
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
                            {exCountMap.get(p.id) ?? 0} · {PLAN_DURATION[p.name] ?? "–"}
                          </div>
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 4, letterSpacing: "0.01em" }}>
                          {PLAN_MUSCLES[p.name] ?? p.type}
                        </div>
                        {lastDate && (
                          <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 6, fontFamily: "var(--f-mono)", letterSpacing: "0.04em" }}>
                            last: {daysAgo(lastDate)}
                          </div>
                        )}
                      </div>
                    </Link>
                  );
                })}
                {/* Running placeholder */}
                <div style={{
                  padding: 16, borderRadius: 12,
                  border: "1px solid rgba(126,231,255,0.20)",
                  background: "radial-gradient(60% 80% at 100% 0%, rgba(126,231,255,0.10), transparent 60%), rgba(255,255,255,0.018)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <div style={{ fontSize: 16, fontWeight: 500 }}>Running</div>
                    <div style={{ fontSize: 10.5, color: "var(--ink-3)", fontFamily: "var(--f-mono)" }}>∞ · 30m</div>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 4 }}>Zone 2 + intervals · 3×/wk</div>
                  <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 6, fontFamily: "var(--f-mono)" }}>5K goal · coming soon</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div>

          {/* Week strip */}
          <div className="cc-card" style={{ marginBottom: 14 }}>
            <div className="cc-card-head">
              <div className="title">
                Wk {weekNum} · {format(mon, "MMM d")}–{format(addDays(mon, 6), "d")}
              </div>
              <div className="tail">{weekSessions.length} / 7 days</div>
            </div>
            <div className="cc-card-body">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
                {weekDays.map(({ dow, dnum, dateStr, sessionName, isToday, isRest }) => (
                  <div key={dateStr} style={{
                    padding: "12px 6px", textAlign: "left", position: "relative", overflow: "hidden", borderRadius: 10,
                    border: `1px solid ${isToday ? "rgba(179,136,255,0.40)" : "var(--line)"}`,
                    background: isToday
                      ? "radial-gradient(70% 80% at 0% 0%, rgba(179,136,255,0.18), transparent 60%), rgba(255,255,255,0.025)"
                      : "rgba(255,255,255,0.018)",
                    boxShadow: isToday ? "0 0 20px rgba(179,136,255,0.18), inset 0 0 10px rgba(179,136,255,0.06)" : "none",
                  }}>
                    {isToday && (
                      <span style={{ position: "absolute", top: 5, right: 5, fontSize: 7, fontFamily: "var(--f-mono)", color: "var(--cyan)", letterSpacing: "0.10em" }}>
                        NOW
                      </span>
                    )}
                    <div style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase" as const, color: "var(--ink-3)", fontWeight: 600 }}>{dow}</div>
                    <div style={{ fontSize: 16, fontWeight: 500, marginTop: 1, color: "var(--ink)" }}>{dnum}</div>
                    <div style={{ marginTop: 8, fontSize: 11, color: isToday ? "var(--violet)" : isRest ? "var(--ink-4)" : sessionName ? "var(--ink-2)" : "var(--ink-4)" }}>
                      {sessionName ? "🏋" : isRest ? "—" : "·"}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 500, marginTop: 4, color: isToday ? "var(--ink)" : isRest ? "var(--ink-3)" : "var(--ink-2)", lineHeight: 1.2 }}>
                      {sessionName ?? (isRest ? "Rest" : "—")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Running placeholder */}
          <div className="cc-card">
            <div className="cc-card-head">
              <div className="title" style={{ color: "var(--cyan)" }}>Running · 5K Goal</div>
              <div className="tail">non-stop target</div>
            </div>
            <div className="cc-card-body">
              <div style={{ padding: 16, border: "1px solid rgba(126,231,255,0.20)", borderRadius: 12, background: "radial-gradient(60% 80% at 100% 0%, rgba(126,231,255,0.10), transparent 60%), rgba(255,255,255,0.018)" }}>
                <div style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase" as const, color: "var(--cyan)", fontWeight: 600 }}>Furthest non-stop</div>
                <div style={{ fontSize: 28, fontWeight: 200, letterSpacing: "-0.03em", marginTop: 6, fontFamily: "var(--f-mono)" }}>
                  —<span style={{ color: "var(--ink-3)", fontSize: 14 }}> / 5.0 km</span>
                </div>
                <div style={{ marginTop: 10, height: 5, background: "rgba(255,255,255,0.04)", borderRadius: 99 }}>
                  <div style={{ height: "100%", width: "0%", background: "var(--grad)", borderRadius: 99 }} />
                </div>
              </div>
              <div style={{ marginTop: 12, fontSize: 11, color: "var(--ink-4)", letterSpacing: "0.04em", textAlign: "center" as const }}>
                Apple Health integration · coming soon
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
