/**
 * /dashboard — V2 Command center.
 *
 * Layout (desktop 12-col grid):
 *   Row 1 — greeting + quick links
 *   Row 2 — Stats / Activity (8) │ Next Workout (4)
 *   Row 3 — Checklist (4) + Words (4) + Reading (4)
 *   Row 4 — News Brief (8) │ Mood (4)
 *   Row 5 — 7-day heatmap
 *
 * Mobile: single-column stack.
 */

import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  workoutSessions, workoutPrograms, workoutLogs,
  exercises as exercisesTable, personalRecords,
  newsBriefs, books, readingProgress, wordBankEntries,
  checklistItems, checklistCompletions,
} from "@/db/schema";
import { eq, desc, and, lte } from "drizzle-orm";
import Link from "next/link";
import {
  Play, ArrowRight, Flame, Activity, BookOpen, BookMarked,
  Newspaper, SmilePlus, CheckSquare, Clock, Dumbbell, Check,
} from "lucide-react";
import { format, subDays, startOfWeek } from "date-fns";

// ─── V2 session colour palette ────────────────────────────────────────────────
const SESSION_COLORS: Record<string, { primary: string; bg: string }> = {
  Push:            { primary: "#FF8A8A", bg: "rgba(255,138,138,0.10)" },
  Pull:            { primary: "#7EE7FF", bg: "rgba(126,231,255,0.08)" },
  Legs:            { primary: "#6FD49A", bg: "rgba(111,212,154,0.10)" },
  Core:            { primary: "#FFC15C", bg: "rgba(255,193,92,0.10)"  },
  "Push-Up Skill": { primary: "#B388FF", bg: "rgba(179,136,255,0.10)" },
};

const ROTATION = ["Push", "Pull", "Legs", "Core", "Push", "Pull", "Push-Up Skill"];
const SESSION_DURATION: Record<string, string> = {
  Push: "~50 min", Pull: "~50 min", Legs: "~55 min",
  Core: "~20 min", "Push-Up Skill": "~15 min",
};

type NewsStory = { headline: string; summary: string; category: string };

const CATEGORY_COLORS: Record<string, string> = {
  football:   "#FF8A8A",
  geopolitics:"#FF8A8A",
  politics:   "#FF8A8A",
  business:   "#6FD49A",
  tech:       "#7EE7FF",
  ai:         "#B388FF",
  "morocco/mena": "#FFC15C",
  other:      "#6E6E86",
};

function greeting(h: number) {
  if (h < 5)  return "Still up";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// ─── Sparkline bars (30-day activity) ─────────────────────────────────────────
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
            background: active ? "var(--violet)" : "var(--ink-5)",
            opacity: active ? (0.5 + 0.5 * (i / days.length)) : 1,
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  );
}

// ─── Stat tile ────────────────────────────────────────────────────────────────
function StatTile({
  label, value, unit, accent, icon: Icon,
}: {
  label: string; value: number | string; unit?: string;
  accent?: boolean; icon: React.ElementType;
}) {
  return (
    <div
      className="flex flex-col gap-1.5 p-3 rounded-xl flex-1 min-w-0"
      style={{
        background: accent ? "rgba(179,136,255,0.10)" : "rgba(255,255,255,0.03)",
        border: `1px solid ${accent ? "rgba(179,136,255,0.22)" : "var(--border)"}`,
      }}
    >
      <Icon size={13} style={{ color: accent ? "var(--violet)" : "var(--ink-3)" }} />
      <div className="flex items-baseline gap-1 tabular-nums">
        <span style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)", lineHeight: 1 }}>
          {value}
        </span>
        {unit && (
          <span style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 500 }}>{unit}</span>
        )}
      </div>
      <span className="cc-section-label">{label}</span>
    </div>
  );
}

export default async function DashboardPage() {
  const session  = await auth();
  const userId   = session!.user!.id!;
  const userName = session!.user!.name?.split(" ")[0] ?? "Ali";

  const now       = new Date();
  const today     = format(now, "yyyy-MM-dd");
  const hour      = now.getHours();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });

  // ── Parallel data fetches ──────────────────────────────────────────────────
  const [
    allSessions, recentLogs, _prs, [brief],
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

    db.select().from(personalRecords)
      .where(eq(personalRecords.userId, userId))
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

    db.select().from(checklistItems)
      .where(and(eq(checklistItems.userId, userId), eq(checklistItems.active, true)))
      .orderBy(checklistItems.sortOrder)
      .catch(() => []),

    db.select({ itemId: checklistCompletions.itemId }).from(checklistCompletions)
      .where(and(eq(checklistCompletions.userId, userId), eq(checklistCompletions.date, today)))
      .catch(() => []),
  ]);

  // Checklist
  const completedItemIds = new Set(todayCompletions.map((c) => c.itemId));
  const checkDone  = checkItems.filter((i) => completedItemIds.has(i.id)).length;
  const checkTotal = checkItems.length;

  // Next session
  const lastLog = recentLogs[0] ?? null;
  const lastSessionName = lastLog
    ? allSessions.find((s) => s.workout_sessions.id === lastLog.sessionId)?.workout_sessions.name
    : null;
  const lastIdx = lastSessionName ? ROTATION.lastIndexOf(lastSessionName) : -1;
  const nextSessionName = ROTATION[(lastIdx + 1) % ROTATION.length];
  const nextSession     = allSessions.find((s) => s.workout_sessions.name === nextSessionName);
  const nextColor       = SESSION_COLORS[nextSessionName] ?? SESSION_COLORS.Push;

  const heroExercises = nextSession
    ? await db.select({ name: exercisesTable.name })
        .from(exercisesTable)
        .where(eq(exercisesTable.sessionId, nextSession.workout_sessions.id))
        .orderBy(exercisesTable.sortOrder)
        .limit(5)
    : [];

  // Streak calc
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

  // Books
  const finishedBooks = await db.select({ id: books.id }).from(books)
    .where(and(eq(books.userId, userId), eq(books.status, "finished")));
  const booksFinished = finishedBooks.length;

  // Reading progress
  let readPct = 0, currentPage = 0;
  if (currentBook) {
    const [prog] = await db.select().from(readingProgress)
      .where(eq(readingProgress.bookId, currentBook.id)).limit(1);
    currentPage = prog?.currentPage ?? 0;
    readPct = currentBook.totalPages
      ? Math.round((currentPage / currentBook.totalPages) * 100) : 0;
  }

  // 30-day bar chart
  const last30 = Array.from({ length: 30 }, (_, i) => {
    const d = format(subDays(now, 29 - i), "yyyy-MM-dd");
    return recentLogs.some((l) => format(new Date(l.startedAt!), "yyyy-MM-dd") === d);
  });

  // 7-day heatmap
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d   = subDays(now, 6 - i);
    const key = format(d, "yyyy-MM-dd");
    const log = recentLogs.find((l) => format(new Date(l.startedAt!), "yyyy-MM-dd") === key);
    const name = log
      ? allSessions.find((s) => s.workout_sessions.id === log.sessionId)?.workout_sessions.name ?? null
      : null;
    return { label: format(d, "EEE"), dayNum: format(d, "d"), name, isToday: key === today };
  });

  // News stories
  let stories: NewsStory[] = [];
  if (brief) {
    try { stories = (JSON.parse(brief.content).stories ?? []).slice(0, 3); } catch { /* */ }
  }

  return (
    <div className="page-enter" style={{ padding: "20px 20px 32px" }}>

      {/* ── Row 1: Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.02em" }}>
            {greeting(hour)},{" "}
            <span className="cc-grad-text">{userName}</span>
          </h1>
          <p style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 3, fontWeight: 500 }}>
            {format(now, "EEEE, MMMM d")}
          </p>
        </div>

        {/* Quick links */}
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { label: "News",              href: "/news",     color: "#7EE7FF" },
            { label: `${dueWords.length} due`, href: "/wordbank", color: "#B388FF" },
            { label: "Journal",           href: "/journal",  color: "#FB923C" },
          ].map((p) => (
            <Link
              key={p.href}
              href={p.href}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
              style={{
                background: `${p.color}18`,
                color: p.color,
                border: `1px solid ${p.color}35`,
              }}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      {/* ── Main grid ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Row 2: Stats (2fr) + Next Workout (1fr) */}
        <div className="dash-row2" style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", gap: 12 }}>

          {/* STATS CARD */}
          <div className="cc-card p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="cc-section-label">Activity</p>
              {streak > 0 && (
                <div className="flex items-center gap-1.5">
                  <Flame size={12} style={{ color: "#FF8A8A" }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#FF8A8A" }}>
                    {streak}d streak
                  </span>
                </div>
              )}
            </div>

            <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
              <StatTile label="Streak" value={streak} unit="days" accent={streak >= 3} icon={Flame} />
              <StatTile label="This week" value={weekCount} unit="sessions" icon={Activity} />
              <StatTile label="Books" value={booksFinished} unit="/ 12" icon={BookOpen} />
              <StatTile label="Words" value={totalWords.length} icon={BookMarked} />
            </div>

            <div>
              <p className="cc-section-label mb-1.5">30-day activity</p>
              <WorkoutBars days={last30} />
            </div>
          </div>

          {/* NEXT WORKOUT CARD */}
          {allSessions.length > 0 && nextSession ? (
            <Link href={`/workouts/session/${nextSession.workout_sessions.id}`} className="block">
              <div
                className="cc-card cc-card-hover flex flex-col h-full p-4"
                style={{
                  borderColor: `${nextColor.primary}30`,
                  background: `linear-gradient(160deg, var(--bg-card) 0%, ${nextColor.bg} 100%)`,
                  minHeight: 160,
                }}
              >
                <p className="cc-section-label mb-2" style={{ color: nextColor.primary }}>Next session</p>
                <p style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
                  {nextSessionName}
                </p>
                <div className="flex items-center gap-1 mt-1 mb-3">
                  <Clock size={10} style={{ color: "var(--ink-3)" }} />
                  <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
                    {SESSION_DURATION[nextSessionName] ?? "~45 min"}
                  </span>
                </div>

                {heroExercises.slice(0, 4).map((ex, i) => (
                  <div key={i} className="flex items-center gap-2 mb-1.5">
                    <div style={{ width: 4, height: 4, borderRadius: "50%", flexShrink: 0, background: nextColor.primary, opacity: 1 - i * 0.2 }} />
                    <span style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 500 }}>{ex.name}</span>
                  </div>
                ))}

                <div
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold mt-auto self-start"
                  style={{ background: nextColor.primary, color: "#06060B" }}
                >
                  <Play size={10} fill="#06060B" />
                  Start
                  <ArrowRight size={10} />
                </div>
              </div>
            </Link>
          ) : (
            <Link href="/workouts" className="block">
              <div className="cc-card cc-card-hover flex flex-col items-center justify-center text-center h-full p-4" style={{ minHeight: 160 }}>
                <Dumbbell size={28} style={{ color: "var(--ink-3)", marginBottom: 10 }} />
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Set up workouts</p>
                <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>Load your PPL program</p>
              </div>
            </Link>
          )}
        </div>

        {/* Row 3: Checklist + Words + Reading */}
        <div className="dash-row3" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 12 }}>

          {/* CHECKLIST */}
          <Link href="/checklist" className="block">
            <div className="cc-card cc-card-hover p-4" style={{ minHeight: 110 }}>
              <div className="flex items-center justify-between mb-3">
                <p className="cc-section-label">Checklist</p>
                <CheckSquare size={13} style={{ color: "var(--pos)" }} />
              </div>
              {checkTotal > 0 ? (
                <>
                  <div className="flex items-baseline gap-1.5 tabular-nums mb-1">
                    <span style={{ fontSize: 26, fontWeight: 700, color: "var(--ink)", lineHeight: 1 }}>{checkDone}</span>
                    <span style={{ fontSize: 13, color: "var(--ink-3)" }}>/ {checkTotal}</span>
                  </div>
                  <p style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 8 }}>
                    {checkDone === checkTotal ? "All done 🎉" : `${checkTotal - checkDone} remaining`}
                  </p>
                  <div className="space-y-1">
                    {checkItems.slice(0, 3).map((item) => {
                      const done = completedItemIds.has(item.id);
                      return (
                        <div key={item.id} className="flex items-center gap-2">
                          <div style={{ width: 12, height: 12, borderRadius: 3, flexShrink: 0, background: done ? "var(--pos)" : "transparent", border: `1.5px solid ${done ? "var(--pos)" : "var(--border-hi)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {done && <Check size={7} color="#06060B" strokeWidth={3} />}
                          </div>
                          <span style={{ fontSize: 11, color: done ? "var(--ink-4)" : "var(--ink-2)", textDecoration: done ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {item.emoji ? `${item.emoji} ` : ""}{item.title}
                          </span>
                        </div>
                      );
                    })}
                    {checkItems.length > 3 && (
                      <p style={{ fontSize: 10, color: "var(--ink-4)", paddingLeft: 2 }}>+{checkItems.length - 3} more</p>
                    )}
                  </div>
                </>
              ) : (
                <p style={{ fontSize: 11, color: "var(--ink-3)" }}>Set up checklist →</p>
              )}
            </div>
          </Link>

          {/* WORDS */}
          <Link href="/wordbank" className="block">
            <div className="cc-card cc-card-hover p-4" style={{ minHeight: 110 }}>
              <div className="flex items-center justify-between mb-3">
                <p className="cc-section-label">Words</p>
                <BookMarked size={13} style={{ color: "var(--violet)" }} />
              </div>
              <p style={{ fontSize: 26, fontWeight: 700, color: "var(--ink)", lineHeight: 1 }}>{dueWords.length}</p>
              <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>due · {totalWords.length} total</p>
              {dueWords.length > 0 && (
                <div className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-md px-2 py-1 mt-3" style={{ background: "rgba(179,136,255,0.12)", color: "var(--violet)" }}>
                  Review now <ArrowRight size={9} />
                </div>
              )}
            </div>
          </Link>

          {/* READING */}
          <Link href={currentBook ? `/library/read/${currentBook.id}` : "/library"} className="block">
            <div className="cc-card cc-card-hover p-4" style={{ minHeight: 110 }}>
              <div className="flex items-center justify-between mb-3">
                <p className="cc-section-label">Reading</p>
                <BookOpen size={13} style={{ color: "var(--cyan)" }} />
              </div>
              {currentBook ? (
                <>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", lineHeight: 1.3 }} className="truncate">{currentBook.title}</p>
                  <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }} className="truncate">{currentBook.author}</p>
                  <div className="cc-progress-track mt-3">
                    <div className="cc-progress-fill" style={{ width: `${readPct}%` }} />
                  </div>
                  <div className="flex justify-between mt-1.5">
                    <span style={{ fontSize: 10, color: "var(--ink-3)" }}>p.{currentPage}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: "var(--cyan)" }}>{readPct}%</span>
                  </div>
                </>
              ) : (
                <p style={{ fontSize: 11, color: "var(--ink-3)" }}>Load reading list →</p>
              )}
            </div>
          </Link>
        </div>

        {/* Row 4: News (2fr) + Mood (1fr) */}
        <div className="dash-row4" style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", gap: 12 }}>

          {/* NEWS */}
          <div className="cc-card p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="cc-section-label">Today's Brief</p>
              <Link href="/news">
                <Newspaper size={13} style={{ color: "var(--cyan)" }} />
              </Link>
            </div>
            {stories.length > 0 ? (
              <div className="space-y-3">
                {stories.map((s, i) => {
                  const cat = s.category?.toLowerCase() ?? "other";
                  const c = CATEGORY_COLORS[cat] ?? "var(--ink-3)";
                  return (
                    <div key={i} className="flex gap-2.5">
                      <div style={{ width: 2, flexShrink: 0, borderRadius: 2, background: c, opacity: 0.7, alignSelf: "stretch", minHeight: 14 }} />
                      <div className="min-w-0">
                        <p style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)", lineHeight: 1.4 }}>{s.headline}</p>
                        <p style={{ fontSize: 10, color: c, marginTop: 2, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.category}</p>
                      </div>
                    </div>
                  );
                })}
                <Link href="/news" className="flex items-center gap-1 text-[11px] font-semibold hover:opacity-80" style={{ color: "var(--cyan)", marginTop: 4 }}>
                  Full brief <ArrowRight size={10} />
                </Link>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-4 gap-2">
                <Newspaper size={24} style={{ color: "var(--ink-3)" }} />
                <Link href="/news" className="text-xs font-semibold hover:opacity-80" style={{ color: "var(--cyan)" }}>
                  Generate today's brief →
                </Link>
              </div>
            )}
          </div>

          {/* MOOD */}
          <Link href="/mood" className="block">
            <div className="cc-card cc-card-hover p-4 flex flex-col h-full" style={{ minHeight: 120 }}>
              <div className="flex items-center justify-between mb-3">
                <p className="cc-section-label">Mood</p>
                <SmilePlus size={13} style={{ color: "var(--warn)" }} />
              </div>
              <div className="flex-1 flex flex-col items-center justify-center gap-2">
                <p style={{ fontSize: 28 }}>🙂</p>
                <p style={{ fontSize: 11, color: "var(--ink-3)" }}>Log today →</p>
              </div>
            </div>
          </Link>
        </div>

        {/* Row 5: 7-day heatmap */}
        <div className="cc-card p-4">
          <p className="cc-section-label mb-3">Last 7 days</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
            {weekDays.map(({ label, dayNum, name, isToday }) => {
              const sc = name ? SESSION_COLORS[name] : null;
              return (
                <div key={dayNum} className="flex flex-col items-center gap-1.5">
                  <span style={{ fontSize: 9, fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</span>
                  <div style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: sc ? sc.bg : "rgba(255,255,255,0.02)", border: `1px solid ${isToday ? "var(--border-hi)" : "var(--border)"}` }}>
                    {sc
                      ? <div style={{ width: 7, height: 7, borderRadius: "50%", background: sc.primary }} />
                      : <span style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 500 }}>{dayNum}</span>
                    }
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 500, color: sc ? sc.primary : "var(--ink-4)" }}>
                    {name ? name.slice(0, 3) : ""}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-3 mt-3">
            {Object.entries(SESSION_COLORS).map(([name, c]) => (
              <div key={name} className="flex items-center gap-1.5">
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: c.primary }} />
                <span style={{ fontSize: 9, color: "var(--ink-3)", fontWeight: 500 }}>{name}</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Mobile responsive overrides */}
      <style>{`
        @media (max-width: 767px) {
          .dash-row2, .dash-row4 { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 639px) {
          .dash-row3 { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
