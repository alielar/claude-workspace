/**
 * /dashboard — Command center.
 *
 * Layout (desktop 12-col grid):
 *   Row 1 — header (greeting + date + quick links)
 *   Row 2 — Streaks & Stats (8 col) │ Next Workout (4 col)
 *   Row 3 — Checklist (4) + Word Bank (4) + Reading (4)
 *   Row 4 — News Brief (8) │ Mood (4)
 *   Row 5 — Last 7 Days heatmap (12)
 *
 * Mobile: single column stack.
 */

import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  workoutSessions, workoutPrograms, workoutLogs,
  exercises as exercisesTable, personalRecords,
  newsBriefs, books, readingProgress, wordBankEntries,
  checklistItems, checklistCompletions,
} from "@/db/schema";
import { eq, desc, and, lte, gte } from "drizzle-orm";
import Link from "next/link";
import {
  Play, ArrowRight, Flame, Activity, BookOpen, BookMarked,
  Newspaper, SmilePlus, CheckSquare, Clock, Dumbbell, Check,
} from "lucide-react";
import { format, subDays, startOfWeek } from "date-fns";

// ─── Design constants ────────────────────────────────────────────────────────
const GAP = "12px";

// ─── Session config ──────────────────────────────────────────────────────────
const SESSION_COLORS: Record<string, { primary: string; bg: string }> = {
  Push:            { primary: "#F97316", bg: "rgba(249,115,22,0.12)"  },
  Pull:            { primary: "#22D3EE", bg: "rgba(34,211,238,0.10)"  },
  Legs:            { primary: "#F59E0B", bg: "rgba(245,158,11,0.10)"  },
  Core:            { primary: "#F472B6", bg: "rgba(244,114,182,0.10)" },
  "Push-Up Skill": { primary: "#818CF8", bg: "rgba(129,140,248,0.10)" },
};

const ROTATION = ["Push", "Pull", "Legs", "Core", "Push", "Pull", "Push-Up Skill"];
const SESSION_DURATION: Record<string, string> = {
  Push: "~50 min", Pull: "~50 min", Legs: "~55 min",
  Core: "~20 min", "Push-Up Skill": "~15 min",
};

type NewsStory = { headline: string; summary: string; category: string };

const CATEGORY_COLORS: Record<string, string> = {
  football: "#F97316", geopolitics: "#EF4444", business: "#10B981",
  tech: "#22D3EE", ai: "#818CF8", politics: "#EF4444",
  "morocco/mena": "#F97316", "business/markets": "#10B981", other: "#A1A1AA",
};

function greeting(h: number) {
  if (h < 5)  return "Still up";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// ─── Mini bar chart (no deps) ────────────────────────────────────────────────
function WorkoutBars({ days }: { days: boolean[] }) {
  return (
    <div className="flex items-end gap-[3px]" style={{ height: 28 }}>
      {days.map((active, i) => (
        <div
          key={i}
          style={{
            width: 6,
            height: active ? 22 : 5,
            borderRadius: 3,
            background: active ? "var(--accent-primary)" : "var(--bg-elevated-3)",
            opacity: active ? (0.6 + 0.4 * (i / days.length)) : 1,
            transition: "height 0.3s ease",
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  );
}

// ─── Stat tile inside Streaks card ──────────────────────────────────────────
function StatTile({
  label, value, unit, glow, icon: Icon,
}: {
  label: string; value: number | string; unit?: string;
  glow?: boolean; icon: React.ElementType;
}) {
  return (
    <div
      className="flex flex-col gap-1.5 p-3 rounded-xl"
      style={{
        background: glow ? "var(--accent-primary-glow)" : "var(--bg-elevated-2)",
        border: `1px solid ${glow ? "rgba(124,92,255,0.2)" : "var(--border-subtle)"}`,
        flex: "1 1 0",
        minWidth: 0,
      }}
    >
      <Icon size={13} style={{ color: glow ? "var(--accent-bright)" : "var(--text-tertiary)" }} />
      <div className="flex items-baseline gap-1 tabular-nums">
        <span style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>
          {value}
        </span>
        {unit && (
          <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 500 }}>{unit}</span>
        )}
      </div>
      <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>
        {label}
      </span>
    </div>
  );
}

export default async function DashboardPage() {
  const session = await auth();
  const userId  = session!.user!.id!;
  const userName = session!.user!.name?.split(" ")[0] ?? "Ali";

  const now       = new Date();
  const today     = format(now, "yyyy-MM-dd");
  const hour      = now.getHours();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });

  // ── Parallel data fetches ─────────────────────────────────────────────────
  const [
    allSessions, recentLogs, prs, [brief],
    [currentBook], dueWords, totalWords,
    checkItems, todayCompletions,
  ] = await Promise.all([
    db.select().from(workoutSessions)
      .innerJoin(workoutPrograms, eq(workoutSessions.programId, workoutPrograms.id))
      .where(eq(workoutPrograms.userId, userId))
      .orderBy(workoutSessions.sortOrder),

    db.select().from(workoutLogs)
      .where(eq(workoutLogs.userId, userId))
      .orderBy(desc(workoutLogs.startedAt))
      .limit(60),

    db.select({
      exerciseName: exercisesTable.name,
      bestWeightKg: personalRecords.bestWeightKg,
      estimated1rm: personalRecords.estimated1rm,
      achievedAt:   personalRecords.achievedAt,
    })
      .from(personalRecords)
      .innerJoin(exercisesTable, eq(personalRecords.exerciseId, exercisesTable.id))
      .where(eq(personalRecords.userId, userId))
      .orderBy(desc(personalRecords.estimated1rm))
      .limit(3),

    db.select().from(newsBriefs)
      .where(and(eq(newsBriefs.userId, userId), eq(newsBriefs.date, today)))
      .limit(1),

    db.select().from(books)
      .where(and(eq(books.userId, userId), eq(books.status, "reading")))
      .limit(1),

    db.select({ id: wordBankEntries.id }).from(wordBankEntries)
      .where(and(eq(wordBankEntries.userId, userId), lte(wordBankEntries.nextReviewDate, today))),

    db.select({ id: wordBankEntries.id }).from(wordBankEntries)
      .where(eq(wordBankEntries.userId, userId)),

    // Checklist items — gracefully handle if table doesn't exist yet
    db.select().from(checklistItems)
      .where(and(eq(checklistItems.userId, userId), eq(checklistItems.active, true)))
      .orderBy(checklistItems.sortOrder)
      .catch(() => []),

    db.select({ itemId: checklistCompletions.itemId }).from(checklistCompletions)
      .where(and(eq(checklistCompletions.userId, userId), eq(checklistCompletions.date, today)))
      .catch(() => []),
  ]);

  // Derived checklist stats for widget
  const completedItemIds = new Set(todayCompletions.map((c) => c.itemId));
  const checkDone  = checkItems.filter((i) => completedItemIds.has(i.id)).length;
  const checkTotal = checkItems.length;

  // ── Next session in rotation ──────────────────────────────────────────────
  const lastLog = recentLogs[0] ?? null;
  const lastSessionName = lastLog
    ? allSessions.find((s) => s.workout_sessions.id === lastLog.sessionId)?.workout_sessions.name
    : null;
  const lastIdx = lastSessionName ? ROTATION.lastIndexOf(lastSessionName) : -1;
  const nextSessionName = ROTATION[(lastIdx + 1) % ROTATION.length];
  const nextSession = allSessions.find((s) => s.workout_sessions.name === nextSessionName);
  const nextColor = SESSION_COLORS[nextSessionName] ?? SESSION_COLORS.Push;

  // ── Hero card exercises ───────────────────────────────────────────────────
  const heroExercises = nextSession
    ? await db.select({ name: exercisesTable.name, muscleGroup: exercisesTable.muscleGroup })
        .from(exercisesTable)
        .where(eq(exercisesTable.sessionId, nextSession.workout_sessions.id))
        .orderBy(exercisesTable.sortOrder)
        .limit(5)
    : [];

  // ── Streak calc ───────────────────────────────────────────────────────────
  let streak = 0;
  if (recentLogs.length > 0) {
    const logDays = [...new Set(recentLogs.map((l) => format(new Date(l.startedAt!), "yyyy-MM-dd")))];
    let check = format(now, "yyyy-MM-dd");
    if (!logDays.includes(check)) check = format(subDays(now, 1), "yyyy-MM-dd");
    for (const day of logDays) {
      if (day === check) {
        streak++;
        check = format(subDays(new Date(check), 1), "yyyy-MM-dd");
      } else if (day < check) break;
    }
  }

  const weekCount = recentLogs.filter((l) => new Date(l.startedAt!) >= weekStart).length;

  // ── Books read this year ──────────────────────────────────────────────────
  const thisYear = now.getFullYear();
  const finishedBooks = await db.select({ id: books.id }).from(books)
    .where(and(eq(books.userId, userId), eq(books.status, "finished")));
  const booksThisYear = finishedBooks.length; // rough; refine when year field added

  // ── Reading progress ──────────────────────────────────────────────────────
  let readPct = 0, currentPage = 0;
  if (currentBook) {
    const [prog] = await db.select().from(readingProgress)
      .where(eq(readingProgress.bookId, currentBook.id)).limit(1);
    currentPage = prog?.currentPage ?? 0;
    readPct = currentBook.totalPages
      ? Math.round((currentPage / currentBook.totalPages) * 100) : 0;
  }

  // ── Last 30 days workout activity (for bar chart) ─────────────────────────
  const last30 = Array.from({ length: 30 }, (_, i) => {
    const d = format(subDays(now, 29 - i), "yyyy-MM-dd");
    return recentLogs.some((l) => format(new Date(l.startedAt!), "yyyy-MM-dd") === d);
  });

  // ── 7-day heatmap ─────────────────────────────────────────────────────────
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d   = subDays(now, 6 - i);
    const key = format(d, "yyyy-MM-dd");
    const log = recentLogs.find((l) => format(new Date(l.startedAt!), "yyyy-MM-dd") === key);
    const name = log
      ? allSessions.find((s) => s.workout_sessions.id === log.sessionId)?.workout_sessions.name ?? null
      : null;
    return { label: format(d, "EEE"), dayNum: format(d, "d"), name, isToday: key === today };
  });

  // ── News stories ──────────────────────────────────────────────────────────
  let stories: NewsStory[] = [];
  if (brief) {
    try { stories = (JSON.parse(brief.content).stories ?? []).slice(0, 3); } catch { /* */ }
  }

  return (
    <div
      className="page-enter"
      style={{ padding: "20px 20px 28px", minHeight: "100dvh" }}
    >
      {/* ──────────────────────────────────────────────────────────────────
          ROW 1: Header
      ────────────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
            {greeting(hour)},{" "}
            <span className="text-gradient">{userName}</span>
          </h1>
          <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2, fontWeight: 500 }}>
            {format(now, "EEEE, MMMM d")}
          </p>
        </div>
        {/* Quick links */}
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { label: "News",     href: "/news",      c: "var(--module-news)" },
            { label: `${dueWords.length} due`,  href: "/wordbank",  c: "var(--module-wordbank)" },
            { label: "Journal",  href: "/journal",   c: "var(--module-journal)" },
          ].map((p) => (
            <Link
              key={p.href}
              href={p.href}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-all hover:opacity-80"
              style={{
                background: `color-mix(in srgb, ${p.c} 12%, transparent)`,
                color: p.c,
                border: `1px solid color-mix(in srgb, ${p.c} 20%, transparent)`,
              }}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────
          Main grid
      ────────────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: GAP }}>

        {/* Row 2: Streaks (8) + Next Workout (4) */}
        <div
          className="dashboard-row2"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)",
            gap: GAP,
          }}
        >
          {/* ── STREAKS & STATS ── */}
          <div
            className="card p-4 flex flex-col gap-3"
            style={{ minHeight: 160 }}
          >
            <div className="flex items-center justify-between">
              <p className="section-label">Streak & stats</p>
              {streak > 0 && (
                <div className="flex items-center gap-1.5">
                  <Flame size={13} style={{ color: "#F97316" }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#F97316" }}>
                    {streak} day{streak !== 1 ? "s" : ""}
                  </span>
                </div>
              )}
            </div>

            {/* Stat tiles row */}
            <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
              <StatTile
                label="Streak"
                value={streak}
                unit="days"
                glow={streak >= 3}
                icon={Flame}
              />
              <StatTile
                label="This week"
                value={weekCount}
                unit="sessions"
                icon={Activity}
              />
              <StatTile
                label="Books '26"
                value={booksThisYear}
                unit="/ 12"
                icon={BookOpen}
              />
              <StatTile
                label="Words"
                value={totalWords.length}
                icon={BookMarked}
              />
            </div>

            {/* Workout frequency bar chart */}
            <div>
              <p style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 600, marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                30-day activity
              </p>
              <WorkoutBars days={last30} />
            </div>
          </div>

          {/* ── NEXT WORKOUT ── */}
          {allSessions.length > 0 && nextSession ? (
            <Link href={`/workouts/session/${nextSession.workout_sessions.id}`} className="block">
              <div
                className="card card-hover flex flex-col h-full"
                style={{
                  padding: "16px",
                  borderColor: `${nextColor.primary}28`,
                  background: `linear-gradient(160deg, var(--bg-elevated) 0%, ${nextColor.bg} 100%)`,
                  minHeight: 160,
                }}
              >
                <p className="section-label mb-2" style={{ color: nextColor.primary }}>
                  Next session
                </p>
                <p style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
                  {nextSessionName}
                </p>
                <div className="flex items-center gap-1.5 mt-1 mb-3">
                  <Clock size={11} style={{ color: "var(--text-tertiary)" }} />
                  <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                    {SESSION_DURATION[nextSessionName] ?? "~45 min"}
                  </span>
                </div>

                {heroExercises.length > 0 && (
                  <div className="flex-1 space-y-1.5 mb-3">
                    {heroExercises.slice(0, 4).map((ex, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div
                          style={{
                            width: 4, height: 4, borderRadius: "50%", flexShrink: 0,
                            background: nextColor.primary, opacity: 1 - i * 0.18,
                          }}
                        />
                        <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>
                          {ex.name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold mt-auto self-start"
                  style={{ background: nextColor.primary, color: "#000" }}
                >
                  <Play size={11} fill="#000" />
                  Start
                  <ArrowRight size={11} />
                </div>
              </div>
            </Link>
          ) : (
            <Link href="/workouts" className="block">
              <div
                className="card card-hover flex flex-col items-center justify-center text-center h-full"
                style={{ padding: 16, minHeight: 160 }}
              >
                <Dumbbell size={28} style={{ color: "var(--text-tertiary)", marginBottom: 10 }} />
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Set up workouts</p>
                <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>Load your PPL program</p>
              </div>
            </Link>
          )}
        </div>

        {/* Row 3: Checklist (4) + Word Bank (4) + Reading (4) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0,1fr))",
            gap: GAP,
          }}
        >
          {/* ── CHECKLIST ── */}
          <Link href="/checklist" className="block">
            <div className="card card-hover p-4" style={{ minHeight: 110 }}>
              <div className="flex items-center justify-between mb-3">
                <p className="section-label">Checklist</p>
                <CheckSquare size={13} style={{ color: "var(--module-checklist)" }} />
              </div>
              {checkTotal > 0 ? (
                <>
                  <div className="flex items-baseline gap-1.5 tabular-nums mb-1">
                    <span style={{ fontSize: 26, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>
                      {checkDone}
                    </span>
                    <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>/ {checkTotal}</span>
                  </div>
                  <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 10 }}>
                    {checkDone === checkTotal ? "All done 🎉" : `${checkTotal - checkDone} remaining`}
                  </p>
                  {/* Mini item list */}
                  <div className="space-y-1">
                    {checkItems.slice(0, 3).map((item) => {
                      const done = completedItemIds.has(item.id);
                      return (
                        <div key={item.id} className="flex items-center gap-2">
                          <div style={{
                            width: 12, height: 12, borderRadius: 3, flexShrink: 0,
                            background: done ? "var(--success)" : "transparent",
                            border: `1.5px solid ${done ? "var(--success)" : "var(--border-default)"}`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            {done && <Check size={7} color="#fff" strokeWidth={3} />}
                          </div>
                          <span style={{
                            fontSize: 11, color: done ? "var(--text-tertiary)" : "var(--text-secondary)",
                            textDecoration: done ? "line-through" : "none",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {item.emoji ? `${item.emoji} ` : ""}{item.title}
                          </span>
                        </div>
                      );
                    })}
                    {checkItems.length > 3 && (
                      <p style={{ fontSize: 10, color: "var(--text-tertiary)", paddingLeft: 2 }}>
                        +{checkItems.length - 3} more
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-2">
                  <p style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Set up checklist →</p>
                </div>
              )}
            </div>
          </Link>

          {/* ── WORD BANK ── */}
          <Link href="/wordbank" className="block">
            <div className="card card-hover p-4" style={{ minHeight: 110 }}>
              <div className="flex items-center justify-between mb-3">
                <p className="section-label">Word Bank</p>
                <BookMarked size={13} style={{ color: "var(--module-wordbank)" }} />
              </div>
              <p style={{ fontSize: 26, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>
                {dueWords.length}
              </p>
              <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
                due · {totalWords.length} total
              </p>
              {dueWords.length > 0 && (
                <div
                  className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-md px-2 py-1 mt-3"
                  style={{ background: "rgba(244,114,182,0.12)", color: "var(--module-wordbank)" }}
                >
                  Review now <ArrowRight size={9} />
                </div>
              )}
            </div>
          </Link>

          {/* ── READING ── */}
          <Link href={currentBook ? `/library/read/${currentBook.id}` : "/library"} className="block">
            <div className="card card-hover p-4" style={{ minHeight: 110 }}>
              <div className="flex items-center justify-between mb-3">
                <p className="section-label">Reading</p>
                <BookOpen size={13} style={{ color: "var(--module-library)" }} />
              </div>
              {currentBook ? (
                <>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.3 }} className="truncate">
                    {currentBook.title}
                  </p>
                  <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }} className="truncate">
                    {currentBook.author}
                  </p>
                  <div className="progress-track mt-3">
                    <div
                      className="progress-fill"
                      style={{ width: `${readPct}%`, background: "var(--module-library)" }}
                    />
                  </div>
                  <div className="flex justify-between mt-1.5">
                    <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>p.{currentPage}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: "var(--module-library)" }}>{readPct}%</span>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-2">
                  <p style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Load reading list →</p>
                </div>
              )}
            </div>
          </Link>
        </div>

        {/* Row 4: News (8) + Mood (4) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)",
            gap: GAP,
          }}
        >
          {/* ── NEWS BRIEF ── */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="section-label">Today's Brief</p>
              <Link href="/news">
                <Newspaper size={13} style={{ color: "var(--module-news)" }} />
              </Link>
            </div>
            {stories.length > 0 ? (
              <div className="space-y-3">
                {stories.map((s, i) => {
                  const cat = s.category?.toLowerCase() ?? "other";
                  const c = CATEGORY_COLORS[cat] ?? "var(--text-tertiary)";
                  return (
                    <div key={i} className="flex gap-2.5">
                      <div
                        style={{
                          width: 2, flexShrink: 0, borderRadius: 2,
                          background: c, opacity: 0.7, alignSelf: "stretch",
                          minHeight: 14,
                        }}
                      />
                      <div className="min-w-0">
                        <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", lineHeight: 1.4 }}>
                          {s.headline}
                        </p>
                        <p style={{ fontSize: 10, color: c, marginTop: 2, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          {s.category}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <Link
                  href="/news"
                  className="flex items-center gap-1 text-[11px] font-semibold hover:opacity-80"
                  style={{ color: "var(--module-news)", marginTop: 4 }}
                >
                  Full brief <ArrowRight size={10} />
                </Link>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-4 gap-2">
                <Newspaper size={24} style={{ color: "var(--text-tertiary)" }} />
                <Link
                  href="/news"
                  className="text-xs font-semibold hover:opacity-80"
                  style={{ color: "var(--module-news)" }}
                >
                  Generate today's brief →
                </Link>
              </div>
            )}
          </div>

          {/* ── MOOD ── */}
          <Link href="/mood" className="block">
            <div className="card card-hover p-4 flex flex-col h-full" style={{ minHeight: 120 }}>
              <div className="flex items-center justify-between mb-3">
                <p className="section-label">Mood</p>
                <SmilePlus size={13} style={{ color: "var(--module-mood)" }} />
              </div>
              <div className="flex-1 flex flex-col items-center justify-center gap-2">
                <p style={{ fontSize: 28 }}>🙂</p>
                <p style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Log today's mood →</p>
              </div>
            </div>
          </Link>
        </div>

        {/* Row 5: 7-Day Heatmap */}
        <div className="card p-4">
          <p className="section-label mb-3">Last 7 days</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
            {weekDays.map(({ label, dayNum, name, isToday }) => {
              const sc = name ? SESSION_COLORS[name] : null;
              return (
                <div key={dayNum} className="flex flex-col items-center gap-1.5">
                  <span style={{ fontSize: 9, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                    {label}
                  </span>
                  <div
                    style={{
                      width: "100%", aspectRatio: "1 / 1",
                      borderRadius: 8,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: sc ? sc.bg : "var(--bg-elevated-2)",
                      border: isToday
                        ? "1px solid var(--border-default)"
                        : "1px solid var(--border-subtle)",
                    }}
                  >
                    {sc
                      ? <div style={{ width: 7, height: 7, borderRadius: "50%", background: sc.primary }} />
                      : <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 500 }}>{dayNum}</span>
                    }
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 500, color: sc ? sc.primary : "var(--text-tertiary)" }}>
                    {name ? name.slice(0, 3) : ""}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-3">
            {Object.entries(SESSION_COLORS).map(([name, c]) => (
              <div key={name} className="flex items-center gap-1.5">
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: c.primary }} />
                <span style={{ fontSize: 9, color: "var(--text-tertiary)", fontWeight: 500 }}>{name}</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Mobile responsive overrides */}
      <style>{`
        @media (max-width: 767px) {
          .dashboard-row2 {
            grid-template-columns: 1fr !important;
          }
        }
        @media (max-width: 639px) {
          div[style*="repeat(3, minmax"] {
            grid-template-columns: 1fr !important;
          }
          div[style*="minmax(0,2fr) minmax(0,1fr)"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
