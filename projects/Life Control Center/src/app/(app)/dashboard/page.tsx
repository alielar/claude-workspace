/**
 * /dashboard — Life Control Center hub. V3 one-viewport layout.
 *
 * Row 1: Greeting + compact 4-headline news strip
 * Row 2: Global streak (checklist-based) | Checklist | Next Workout (enriched)
 * Row 3: Mood quick-log + Sleep score | Reading
 *
 * All time periods use the same layout — simpler, denser, everything visible.
 */

export const dynamic = "force-dynamic";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  gymSessions, programs, workoutPlans, planExercises, exerciseDb,
  newsBriefs, books, readingProgress,
  checklistItems, checklistCompletions,
  moodEntries, sleepEntries, gymSets,
} from "@/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import Link from "next/link";
import { format, subDays } from "date-fns";
import { ChecklistCard } from "@/components/dashboard/ChecklistCard";
import { CompactNewsStrip } from "@/components/dashboard/CompactNewsStrip";
import { MoodQuickLog } from "@/components/dashboard/MoodQuickLog";

// ─── Types ────────────────────────────────────────────────────────────────────

type Story = {
  headline: string;
  summary?: string;
  category: string;
  source?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function madridHour(): number {
  const s = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid", hour: "numeric", hour12: false,
  }).format(new Date());
  return parseInt(s, 10);
}

function greeting(h: number): string {
  if (h >= 5 && h < 12) return "Good morning";
  if (h >= 12 && h < 18) return "Good afternoon";
  if (h >= 18) return "Good evening";
  return "Late night";
}

/** Checklist-based streak: a day counts if ≥80% items completed */
function calcChecklistStreak(
  completions: { date: string; itemId: number }[],
  totalItems: number,
  today: string
): number {
  if (totalItems === 0) return 0;
  const threshold = Math.ceil(totalItems * 0.8);

  // Count completions per day
  const byDate = new Map<string, number>();
  for (const c of completions) {
    byDate.set(c.date, (byDate.get(c.date) ?? 0) + 1);
  }

  let streak = 0;
  const now = new Date(today + "T12:00:00");

  for (let i = 0; i < 60; i++) {
    const d = format(subDays(now, i), "yyyy-MM-dd");
    const count = byDate.get(d) ?? 0;
    if (count >= threshold) {
      streak++;
    } else if (i === 0) {
      // Today not yet complete is ok, continue checking yesterday
      continue;
    } else {
      break;
    }
  }
  return streak;
}

function fmtSleepHours(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh}h${mm > 0 ? ` ${mm}m` : ""}`;
}

/** Heatmap cell bg/border for a session type */
function heatDotStyle(name: string | null): React.CSSProperties {
  if (name === "Legs")
    return { background: "linear-gradient(135deg,rgba(124,77,255,0.6),rgba(100,255,218,0.3))" };
  if (name === "Pull")
    return { background: "linear-gradient(135deg,rgba(100,255,218,0.5),rgba(124,77,255,0.2))" };
  if (name === "Push")
    return { background: "linear-gradient(135deg,rgba(124,77,255,0.35),rgba(124,77,255,0.1))" };
  if (name)
    return { background: "linear-gradient(135deg,rgba(100,255,218,0.3),rgba(100,255,218,0.1))" };
  return { background: "rgba(255,255,255,0.06)" };
}

// Shared head-title style
const HTITLE: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8,
  fontSize: 10.5, fontWeight: 500, letterSpacing: "0.18em",
  textTransform: "uppercase", color: "var(--ink-3)",
};

const DOT: React.CSSProperties = {
  width: 5, height: 5, borderRadius: "50%",
  background: "var(--violet)", boxShadow: "0 0 6px var(--violet)", flexShrink: 0,
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const session = await auth();
  const userId  = session!.user.id;

  const now   = new Date();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(now);
  const madridH = madridHour();

  // ── Parallel data fetches ──────────────────────────────────────────────────
  const [
    recentSessions,
    scheduledPlans,
    [brief],
    currentBookResult,
    checkItems,
    recentCompletions,
    todayCompletions,
    todayMood,
    lastSleep,
  ] = await Promise.all([
    db.select({ id: gymSessions.id, date: gymSessions.date, workoutName: gymSessions.workoutName, planId: gymSessions.planId })
      .from(gymSessions)
      .where(eq(gymSessions.userId, userId))
      .orderBy(desc(gymSessions.date))
      .limit(60),

    db.select({
        planId: workoutPlans.id,
        planName: workoutPlans.name,
        assignedDays: workoutPlans.assignedDays,
        targetMuscles: workoutPlans.targetMuscles,
      })
      .from(workoutPlans)
      .innerJoin(programs, eq(workoutPlans.programId, programs.id))
      .where(and(eq(programs.userId, userId), eq(programs.isActive, true)))
      .orderBy(workoutPlans.sortOrder)
      .catch(() => [] as { planId: number; planName: string; assignedDays: string | null; targetMuscles: string | null }[]),

    db.select().from(newsBriefs)
      .where(and(eq(newsBriefs.userId, userId), eq(newsBriefs.date, today)))
      .limit(1),

    db.select().from(books)
      .where(and(eq(books.userId, userId), eq(books.status, "reading")))
      .limit(1)
      .catch(() => [] as (typeof books.$inferSelect)[]),

    db.select().from(checklistItems)
      .where(and(eq(checklistItems.userId, userId), eq(checklistItems.active, true)))
      .orderBy(checklistItems.sortOrder),

    // Last 60 days of completions for streak calc
    db.select({ date: checklistCompletions.date, itemId: checklistCompletions.itemId })
      .from(checklistCompletions)
      .where(and(
        eq(checklistCompletions.userId, userId),
        sql`${checklistCompletions.date} >= ${format(subDays(now, 60), "yyyy-MM-dd")}`
      )),

    db.select({ itemId: checklistCompletions.itemId }).from(checklistCompletions)
      .where(and(eq(checklistCompletions.userId, userId), eq(checklistCompletions.date, today))),

    db.select({ score: moodEntries.score }).from(moodEntries)
      .where(and(eq(moodEntries.userId, userId), eq(moodEntries.date, today)))
      .limit(1)
      .catch(() => [] as { score: number }[]),

    db.select({ hours: sleepEntries.hours, quality: sleepEntries.quality, bedtime: sleepEntries.bedtime, wake: sleepEntries.wake })
      .from(sleepEntries)
      .where(eq(sleepEntries.userId, userId))
      .orderBy(desc(sleepEntries.date))
      .limit(1)
      .catch(() => [] as { hours: number; quality: number; bedtime: string; wake: string }[]),
  ]);

  const [currentBook] = currentBookResult;

  // ── Reading progress ───────────────────────────────────────────────────────
  let readPct = 0, currentPage = 0;
  if (currentBook) {
    const [prog] = await db.select().from(readingProgress)
      .where(eq(readingProgress.bookId, currentBook.id)).limit(1);
    currentPage = prog?.currentPage ?? 0;
    readPct = currentBook.totalPages
      ? Math.round((currentPage / currentBook.totalPages) * 100) : 0;
  }
  const ringC = 201;
  const ringOffset = ringC - (readPct / 100) * ringC;

  // ── Streak (checklist-based) ──────────────────────────────────────────────
  const streak = calcChecklistStreak(recentCompletions, checkItems.length, today);

  // ── 7-day heatmap dots ────────────────────────────────────────────────────
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = subDays(now, 6 - i);
    const key = format(d, "yyyy-MM-dd");
    const s = recentSessions.find(s => s.date === key);
    return { label: format(d, "EEE").slice(0, 2).toUpperCase(), name: s?.workoutName ?? null, isToday: key === today };
  });

  // ── Next Workout (enriched) ────────────────────────────────────────────────
  const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
  const DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const todayDow = new Date(today + "T12:00:00").getDay();
  const todayKey = DAY_KEYS[todayDow];

  const plansWithDays = scheduledPlans
    .filter(p => p.assignedDays)
    .map(p => ({
      id: p.planId,
      name: p.planName,
      days: JSON.parse(p.assignedDays!) as string[],
      muscles: p.targetMuscles ? JSON.parse(p.targetMuscles) as string[] : [],
    }));

  const todaysWorkout = plansWithDays.find(p => p.days.includes(todayKey));
  const alreadyDoneToday = recentSessions.some(s => s.date === today);

  let upcomingPlan: { id: number; name: string; muscles: string[]; dayLabel: string } | null = null;
  if (todaysWorkout && !alreadyDoneToday) {
    upcomingPlan = { ...todaysWorkout, dayLabel: "Today" };
  } else {
    for (let offset = 1; offset <= 7; offset++) {
      const futureDow = (todayDow + offset) % 7;
      const futureKey = DAY_KEYS[futureDow];
      const plan = plansWithDays.find(p => p.days.includes(futureKey));
      if (plan) {
        upcomingPlan = { ...plan, dayLabel: offset === 1 ? "Tomorrow" : DAY_FULL[futureDow] };
        break;
      }
    }
  }

  // Fetch exercises for the upcoming workout plan
  let upcomingExercises: { name: string }[] = [];
  let lastSessionLifts: { name: string; weight: number; reps: number }[] = [];
  if (upcomingPlan) {
    const [exRows, lastSession] = await Promise.all([
      db.select({ name: exerciseDb.name })
        .from(planExercises)
        .innerJoin(exerciseDb, eq(planExercises.exerciseId, exerciseDb.id))
        .where(eq(planExercises.planId, upcomingPlan.id))
        .orderBy(planExercises.sortOrder)
        .catch(() => [] as { name: string }[]),
      // Find the most recent session with same planId
      db.select({ id: gymSessions.id })
        .from(gymSessions)
        .where(and(eq(gymSessions.userId, userId), eq(gymSessions.planId, upcomingPlan.id)))
        .orderBy(desc(gymSessions.date))
        .limit(1)
        .catch(() => [] as { id: number }[]),
    ]);
    upcomingExercises = exRows;

    if (lastSession.length > 0) {
      const sets = await db.select({
          name: gymSets.exerciseName,
          weight: gymSets.weightKg,
          reps: gymSets.reps,
        })
        .from(gymSets)
        .where(eq(gymSets.sessionId, lastSession[0].id))
        .orderBy(gymSets.setNumber)
        .catch(() => [] as { name: string; weight: number | null; reps: number | null }[]);

      // Get best set per exercise (highest weight)
      const bestByExercise = new Map<string, { weight: number; reps: number }>();
      for (const s of sets) {
        if (s.weight && s.reps) {
          const existing = bestByExercise.get(s.name);
          if (!existing || s.weight > existing.weight) {
            bestByExercise.set(s.name, { weight: s.weight, reps: s.reps });
          }
        }
      }
      lastSessionLifts = Array.from(bestByExercise.entries()).slice(0, 4).map(([name, v]) => ({
        name, weight: v.weight, reps: v.reps,
      }));
    }
  }

  // ── News ───────────────────────────────────────────────────────────────────
  let stories: Story[] = [];
  if (brief) {
    try { stories = JSON.parse(brief.content as string).stories ?? []; } catch { /* */ }
  }

  // ── Checklist ──────────────────────────────────────────────────────────────
  const completedIds = new Set(todayCompletions.map((c) => c.itemId));
  const checkTotal   = checkItems.length;

  const checkItemsSerial = checkItems.map((i) => ({
    id: i.id, title: i.title, emoji: i.emoji, source: "manual" as const,
  }));

  // ── Mood/Sleep ─────────────────────────────────────────────────────────────
  const moodScore = todayMood.length > 0 ? todayMood[0].score : null;
  const sleepData = lastSleep.length > 0 ? lastSleep[0] : null;

  const MUSCLE_EMOJI: Record<string, string> = {
    chest: "🫁", lats: "🔙", upper_back: "🔙", traps: "🔙",
    front_delts: "💪", side_delts: "💪", rear_delts: "💪",
    biceps: "💪", triceps: "💪", forearms: "🤜",
    quads: "🦵", hamstrings: "🦵", glutes: "🍑", calves: "🦵",
    abs: "🎯", obliques: "🎯",
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="page-enter">
      {/* ── Row 1: Greeting + News Strip ─────────────────────────────────── */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
          <h2 style={{ fontSize: 30, fontWeight: 300, letterSpacing: "-0.025em", margin: 0, lineHeight: 1.1 }}>
            {greeting(madridH)},{" "}
            <span style={{ background: "var(--grad)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", fontWeight: 400 }}>
              Ali
            </span>
            <span style={{ color: "var(--ink-4)" }}>.</span>
          </h2>
          <Link href="/news" className="dash-news-link" style={{ fontSize: 11, color: "var(--cyan)", textDecoration: "none", letterSpacing: "0.04em", flexShrink: 0 }}>
            See all news →
          </Link>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink-4)", marginBottom: 16, fontFamily: "var(--f-mono)", letterSpacing: "0.02em" }}>
          {format(now, "EEEE, MMMM d, yyyy")}
        </div>
        <CompactNewsStrip stories={stories} />
      </div>

      {/* ── Row 2: Streak | Checklist | Next Workout ─────────────────────── */}
      <div className="dash-row2" style={{ display: "grid", gridTemplateColumns: "240px 1fr 300px", gap: 14, marginBottom: 14 }}>

        {/* Streak card (checklist-based, with 7-day workout dots) */}
        <div className="cc-card" style={{
          padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14,
          background: `radial-gradient(60% 80% at 0% 0%, rgba(124,77,255,0.10), transparent 60%),
                       radial-gradient(50% 80% at 100% 100%, rgba(100,255,218,0.06), transparent 60%),
                       var(--bg-card)`,
        }}>
          <div style={HTITLE}>
            <span style={{ ...DOT, background: "var(--cyan)", boxShadow: "0 0 8px var(--cyan)" }} />
            Streak
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <div className="tabular-nums" style={{
              fontSize: 68, fontWeight: 200, letterSpacing: "-0.06em", lineHeight: 0.9,
              background: "var(--grad)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
              filter: "drop-shadow(0 0 18px rgba(124,77,255,0.15))",
            }}>
              {streak}
            </div>
            <span style={{ fontSize: 16, color: "var(--ink-4)", fontWeight: 300, letterSpacing: "-0.01em" }}>days</span>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--ink-4)", lineHeight: 1.45 }}>
            {streak === 0
              ? "Complete today's checklist to start your streak"
              : streak >= 7 ? "Keep the streak going!" : "Building the habit."}
          </div>

          {/* 7-day workout dots */}
          <div>
            <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-5)", marginBottom: 8, fontFamily: "var(--f-mono)" }}>
              Workouts · 7d
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {weekDays.map((d, i) => (
                <div key={i} title={d.name ?? "Rest"} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div className="dash-heat-dot" style={{
                    width: 22, height: 22, borderRadius: 6,
                    border: d.isToday && !d.name ? "1px dashed rgba(100,255,218,0.35)" : "1px solid transparent",
                    ...heatDotStyle(d.name),
                  }} />
                  <span style={{ fontSize: 8, color: d.isToday ? "var(--cyan)" : "var(--ink-5)", fontFamily: "var(--f-mono)", fontWeight: d.isToday ? 600 : 400 }}>{d.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Checklist */}
        <ChecklistCard items={checkItemsSerial} completedIds={completedIds} total={checkTotal} />

        {/* Next Workout (enriched) */}
        <div className="cc-card" style={{ padding: "18px 20px", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={HTITLE}><span style={DOT} />Next Workout</div>
            {upcomingPlan && (
              <span style={{
                fontSize: 9.5, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase",
                color: upcomingPlan.dayLabel === "Today" ? "var(--cyan)" : "var(--ink-4)",
                fontFamily: "var(--f-mono)",
              }}>
                {upcomingPlan.dayLabel}
              </span>
            )}
          </div>

          {upcomingPlan ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <div style={{
                fontSize: 17, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.25,
                background: upcomingPlan.dayLabel === "Today" ? "var(--grad)" : "none",
                WebkitBackgroundClip: upcomingPlan.dayLabel === "Today" ? "text" : undefined,
                backgroundClip: upcomingPlan.dayLabel === "Today" ? "text" : undefined,
                color: upcomingPlan.dayLabel === "Today" ? "transparent" : "var(--ink)",
              }}>
                {upcomingPlan.name}
              </div>

              {/* Muscle tags */}
              {upcomingPlan.muscles.length > 0 && (
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 10 }}>
                  {upcomingPlan.muscles.slice(0, 4).map(m => (
                    <span key={m} style={{
                      fontSize: 9.5, padding: "2px 8px", borderRadius: 5,
                      background: "rgba(124,77,255,0.08)", border: "1px solid rgba(124,77,255,0.18)",
                      color: "var(--ink-3)", fontFamily: "var(--f-mono)", letterSpacing: "0.04em",
                    }}>
                      {MUSCLE_EMOJI[m] ?? "🏋️"} {m.replace("_", " ")}
                    </span>
                  ))}
                </div>
              )}

              {/* Exercise list */}
              {upcomingExercises.length > 0 && (
                <div style={{ marginTop: 12, flex: 1 }}>
                  {upcomingExercises.slice(0, 5).map((ex, i) => (
                    <div key={i} style={{
                      fontSize: 12, color: "var(--ink-2)", padding: "5px 0",
                      borderBottom: i < Math.min(upcomingExercises.length, 5) - 1 ? "1px solid var(--line)" : "none",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ex.name}</span>
                      {(() => {
                        const lift = lastSessionLifts.find(l => l.name === ex.name);
                        return lift ? (
                          <span style={{ fontSize: 10, color: "var(--ink-5)", fontFamily: "var(--f-mono)", flexShrink: 0, marginLeft: 8 }}>
                            {lift.weight}kg × {lift.reps}
                          </span>
                        ) : null;
                      })()}
                    </div>
                  ))}
                  {upcomingExercises.length > 5 && (
                    <div style={{ fontSize: 10, color: "var(--ink-5)", marginTop: 6, fontFamily: "var(--f-mono)" }}>
                      +{upcomingExercises.length - 5} more
                    </div>
                  )}
                </div>
              )}

              {/* Start session button */}
              {upcomingPlan.dayLabel === "Today" && (
                <Link href={`/workouts/session/new?planId=${upcomingPlan.id}`} style={{ textDecoration: "none", marginTop: 14 }}>
                  <button className="cc-btn cc-btn-primary" style={{ width: "100%", padding: "10px 0", fontSize: 12, letterSpacing: "0.04em" }}>
                    Start session
                  </button>
                </Link>
              )}
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div style={{ fontSize: 13, color: "var(--ink-4)" }}>
                {plansWithDays.length === 0 ? (
                  <Link href="/workouts" className="dash-empty-link" style={{ color: "var(--cyan)", textDecoration: "none" }}>
                    Set up your first workout →
                  </Link>
                ) : "All done this week!"}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 3: Mood + Sleep | Reading ────────────────────────────────── */}
      <div className="dash-row3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>

        {/* Mood quick-log */}
        <MoodQuickLog initialScore={moodScore} />

        {/* Sleep score */}
        <Link href="/sleep" style={{ textDecoration: "none", display: "block" }}>
          <div className="cc-card cc-card-hover" style={{ padding: "18px 20px", height: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={HTITLE}><span style={{ ...DOT, background: "var(--cyan)", boxShadow: "0 0 6px var(--cyan)" }} />Sleep</div>
            </div>
            {sleepData ? (
              <div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <div className="tabular-nums" style={{
                    fontSize: 34, fontWeight: 200, letterSpacing: "-0.04em", lineHeight: 1,
                    background: "var(--grad)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
                  }}>
                    {fmtSleepHours(sleepData.hours)}
                  </div>
                  <span style={{ fontSize: 11, color: sleepData.hours >= 8 ? "var(--pos)" : "var(--warn)", fontFamily: "var(--f-mono)", letterSpacing: "0.02em" }}>
                    {sleepData.hours >= 8 ? "on target" : `${fmtSleepHours(8 - sleepData.hours)} short`}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 10.5, color: "var(--ink-4)", fontFamily: "var(--f-mono)", letterSpacing: "0.02em" }}>
                  <span>{sleepData.bedtime} → {sleepData.wake}</span>
                  <span>q{sleepData.quality}/10</span>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "var(--ink-4)" }}>
                Log last night's sleep →
              </div>
            )}
          </div>
        </Link>

        {/* Reading */}
        <Link href={currentBook ? `/library/read/${currentBook.id}` : "/library"} style={{ display: "block", textDecoration: "none" }}>
          <div className="cc-card cc-card-hover" style={{ padding: "18px 20px", height: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={HTITLE}><span style={DOT} />Reading</div>
              {currentBook && (
                <span style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "var(--f-mono)" }}>{readPct}%</span>
              )}
            </div>
            {currentBook ? (
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <svg width="48" height="48" viewBox="0 0 80 80" style={{ flexShrink: 0 }}>
                  <defs>
                    <linearGradient id="db-ring" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#7C4DFF" />
                      <stop offset="100%" stopColor="#64FFDA" />
                    </linearGradient>
                  </defs>
                  <circle fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="5" cx="40" cy="40" r="32" />
                  <circle fill="none" stroke="url(#db-ring)" strokeWidth="5" strokeLinecap="round"
                    cx="40" cy="40" r="32"
                    strokeDasharray={ringC}
                    strokeDashoffset={ringOffset}
                    transform="rotate(-90 40 40)"
                    style={{ filter: "drop-shadow(0 0 6px rgba(124,77,255,0.35))", transition: "stroke-dashoffset 0.4s var(--easeOut)" }}
                  />
                </svg>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ink)" }}>
                    {currentBook.title}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 3 }}>{currentBook.author}</div>
                  <div style={{ fontSize: 10, color: "var(--ink-5)", fontFamily: "var(--f-mono)", marginTop: 4, letterSpacing: "0.02em" }}>
                    p.{currentPage} / {currentBook.totalPages ?? "?"}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "var(--ink-4)" }}>
                Add a book to start reading →
              </div>
            )}
          </div>
        </Link>
      </div>

      <style>{`
        .dash-news-link { transition: opacity 0.15s var(--easeOut); }
        .dash-news-link:hover { opacity: 0.8; }
        .dash-empty-link { transition: opacity 0.15s var(--easeOut); }
        .dash-empty-link:hover { opacity: 0.8; }
        .dash-heat-dot { transition: transform 0.15s var(--easeOut); }
        .dash-heat-dot:hover { transform: scale(1.15); }
        @media (max-width: 900px) {
          .dash-row2 { grid-template-columns: 1fr !important; }
          .dash-row3 { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
