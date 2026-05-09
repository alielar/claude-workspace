/**
 * /dashboard — Personal command center.
 *
 * Grid layout:
 *  Row 1 — header (greeting + date + quick pills)
 *  Row 2 — hero workout card (60%) + 2 mini stat cards (40%, stacked)
 *  Row 3 — 3-column: top PRs · today's brief · last run
 *  Row 4 — 2-column: week schedule strip · reading + word bank
 */

import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  workoutSessions,
  workoutPrograms,
  workoutLogs,
  exercises as exercisesTable,
  personalRecords,
  newsBriefs,
  books,
  readingProgress,
  wordBankEntries,
  runLogs,
} from "@/db/schema";
import { eq, desc, and, lte, gte } from "drizzle-orm";
import Link from "next/link";
import {
  Play,
  Newspaper,
  BookOpen,
  BookMarked,
  ArrowRight,
  Trophy,
  Zap,
  Activity,
  TrendingUp,
  Clock,
  Flame,
} from "lucide-react";
import { format, subDays, startOfWeek } from "date-fns";

// ─── Design tokens ──────────────────────────────────────────────────────────
const GAP = "16px";
const CARD_P = "20px 24px";
const RADIUS = "12px";

// ─── Session colors (as requested: Push=coral, Pull=teal, Legs=amber) ───────
const SESSION_COLORS: Record<string, { primary: string; dim: string; text: string }> = {
  Push:           { primary: "#fb7185", dim: "rgba(251,113,133,0.12)", text: "#fb7185" },
  Pull:           { primary: "#2dd4bf", dim: "rgba(45,212,191,0.12)",  text: "#2dd4bf" },
  Legs:           { primary: "#f59e0b", dim: "rgba(245,158,11,0.12)",  text: "#f59e0b" },
  Core:           { primary: "#e879f9", dim: "rgba(232,121,249,0.12)", text: "#e879f9" },
  "Push-Up Skill":{ primary: "#818cf8", dim: "rgba(129,140,248,0.12)", text: "#818cf8" },
};

const SESSION_DURATION: Record<string, string> = {
  Push: "~50 min", Pull: "~50 min", Legs: "~55 min",
  Core: "~20 min", "Push-Up Skill": "~15 min",
};

const ROTATION = ["Push", "Pull", "Legs", "Core", "Push", "Pull", "Push-Up Skill"];

const CATEGORY_COLORS: Record<string, string> = {
  Football: "#4ade80", Morocco: "#4ade80",
  Geopolitics: "#60a5fa", Tech: "#a78bfa",
  AI: "#a78bfa", Business: "#fbbf24",
};

type NewsStory = { headline: string; summary: string; whyItMatters: string; category: string };

function greeting(h: number) {
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function fmtPace(secsPerKm: number | null) {
  if (!secsPerKm) return "—";
  const m = Math.floor(secsPerKm / 60);
  const s = secsPerKm % 60;
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

function fmtDuration(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user!.id!;
  const userName = session!.user!.name?.split(" ")[0] ?? "Ali";

  const now = new Date();
  const today = format(now, "yyyy-MM-dd");
  const hour = now.getHours();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday

  // ── Sessions list ─────────────────────────────────────────────────────────
  const allSessions = await db
    .select()
    .from(workoutSessions)
    .innerJoin(workoutPrograms, eq(workoutSessions.programId, workoutPrograms.id))
    .where(eq(workoutPrograms.userId, userId))
    .orderBy(workoutSessions.sortOrder);

  // ── Last 30 workout logs ──────────────────────────────────────────────────
  const recentLogs = await db
    .select()
    .from(workoutLogs)
    .where(eq(workoutLogs.userId, userId))
    .orderBy(desc(workoutLogs.startedAt))
    .limit(30);

  const lastLog = recentLogs[0] ?? null;

  // ── Next session in rotation ──────────────────────────────────────────────
  const lastSessionName = lastLog
    ? allSessions.find((s) => s.workout_sessions.id === lastLog.sessionId)?.workout_sessions.name
    : null;
  const lastIdx = lastSessionName ? ROTATION.lastIndexOf(lastSessionName) : -1;
  const nextSessionName = ROTATION[(lastIdx + 1) % ROTATION.length];
  const nextSession = allSessions.find((s) => s.workout_sessions.name === nextSessionName);
  const nextColor = SESSION_COLORS[nextSessionName] ?? SESSION_COLORS.Push;

  // ── Exercise list for hero card ───────────────────────────────────────────
  const heroExercises = nextSession
    ? await db
        .select({ name: exercisesTable.name, muscleGroup: exercisesTable.muscleGroup })
        .from(exercisesTable)
        .where(eq(exercisesTable.sessionId, nextSession.workout_sessions.id))
        .orderBy(exercisesTable.sortOrder)
        .limit(5)
    : [];

  // ── Streak (consecutive days with a log) ─────────────────────────────────
  let streak = 0;
  if (recentLogs.length > 0) {
    const logDays = [...new Set(recentLogs.map((l) =>
      format(new Date(l.startedAt!), "yyyy-MM-dd")
    ))];
    let check = format(now, "yyyy-MM-dd");
    // if no log today, start from yesterday
    if (!logDays.includes(check)) check = format(subDays(now, 1), "yyyy-MM-dd");
    for (const day of logDays) {
      if (day === check) {
        streak++;
        const prev = format(subDays(new Date(check), 1), "yyyy-MM-dd");
        check = prev;
      } else if (day < check) break;
    }
  }

  // ── This week's log count ─────────────────────────────────────────────────
  const weekLogs = recentLogs.filter(
    (l) => new Date(l.startedAt!) >= weekStart
  );
  const weekCount = weekLogs.length;

  // ── Week schedule strip (last 7 days + today) ────────────────────────────
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = subDays(now, 6 - i);
    const key = format(d, "yyyy-MM-dd");
    const log = recentLogs.find((l) => format(new Date(l.startedAt!), "yyyy-MM-dd") === key);
    const sessionName = log
      ? allSessions.find((s) => s.workout_sessions.id === log.sessionId)?.workout_sessions.name
      : null;
    return { date: d, key, label: format(d, "EEE"), dayNum: format(d, "d"), sessionName, isToday: key === today };
  });

  // ── Top 3 PRs ─────────────────────────────────────────────────────────────
  const prs = await db
    .select({
      exerciseName: exercisesTable.name,
      bestWeightKg: personalRecords.bestWeightKg,
      estimated1rm: personalRecords.estimated1rm,
      achievedAt: personalRecords.achievedAt,
    })
    .from(personalRecords)
    .innerJoin(exercisesTable, eq(personalRecords.exerciseId, exercisesTable.id))
    .where(eq(personalRecords.userId, userId))
    .orderBy(desc(personalRecords.estimated1rm))
    .limit(3);

  // ── Today's news brief ────────────────────────────────────────────────────
  const [brief] = await db
    .select()
    .from(newsBriefs)
    .where(and(eq(newsBriefs.userId, userId), eq(newsBriefs.date, today)))
    .limit(1);

  let stories: NewsStory[] = [];
  if (brief) {
    try { stories = (JSON.parse(brief.content).stories ?? []).slice(0, 3); } catch { /* ignore */ }
  }

  // ── Last run ──────────────────────────────────────────────────────────────
  const [lastRun] = await db
    .select()
    .from(runLogs)
    .where(eq(runLogs.userId, userId))
    .orderBy(desc(runLogs.createdAt))
    .limit(1);

  const totalRuns = await db
    .select({ id: runLogs.id })
    .from(runLogs)
    .where(eq(runLogs.userId, userId));

  // ── Reading ───────────────────────────────────────────────────────────────
  const [currentBook] = await db
    .select()
    .from(books)
    .where(and(eq(books.userId, userId), eq(books.status, "reading")))
    .limit(1);

  let readPct = 0;
  let currentPage = 0;
  if (currentBook) {
    const [prog] = await db
      .select()
      .from(readingProgress)
      .where(eq(readingProgress.bookId, currentBook.id))
      .limit(1);
    currentPage = prog?.currentPage ?? 0;
    readPct = currentBook.totalPages
      ? Math.round((currentPage / currentBook.totalPages) * 100)
      : 0;
  }

  // ── Word bank due ─────────────────────────────────────────────────────────
  const dueWords = await db
    .select({ id: wordBankEntries.id })
    .from(wordBankEntries)
    .where(and(eq(wordBankEntries.userId, userId), lte(wordBankEntries.nextReviewDate, today)));

  const totalWords = await db
    .select({ id: wordBankEntries.id })
    .from(wordBankEntries)
    .where(eq(wordBankEntries.userId, userId));

  const seeded = allSessions.length > 0;

  // ─── Card style helper ───────────────────────────────────────────────────
  const card = (extra = "") => ({
    background: "rgba(255,255,255,0.048)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: RADIUS,
    padding: CARD_P,
  });

  return (
    <div
      className="page-enter h-full"
      style={{ padding: "24px", display: "flex", flexDirection: "column", gap: GAP, minHeight: "100dvh" }}
    >
      {/* ════════════════════════════════════════════════════════════════════
          ROW 1 — Header
      ════════════════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            {greeting(hour)},{" "}
            <span className="text-gradient">{userName}</span>
          </h1>
          <p className="text-xs mt-1 font-medium" style={{ color: "var(--text-muted)" }}>
            {format(now, "EEEE, MMMM d, yyyy")}
          </p>
        </div>
        {/* Quick pills */}
        <div className="flex flex-wrap gap-2">
          {[
            { label: "News Brief", href: "/news", color: "var(--news-color)", bg: "rgba(34,211,238,0.09)" },
            { label: dueWords.length > 0 ? `${dueWords.length} Due` : "Word Bank", href: "/wordbank", color: "var(--wordbank-color)", bg: "rgba(244,114,182,0.09)" },
            { label: "Goals", href: "/goals", color: "var(--goals-color)", bg: "rgba(251,146,60,0.09)" },
          ].map((p) => (
            <Link key={p.href} href={p.href}
              className="text-xs font-semibold px-3 py-1.5 rounded-full transition-all hover:opacity-80"
              style={{ background: p.bg, color: p.color, border: `1px solid ${p.color}22` }}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          ROW 2 — Hero (60%) + Stat mini-cards (40%)
      ════════════════════════════════════════════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: GAP }}>

        {/* ── HERO: Next Workout ── */}
        {seeded && nextSession ? (
          <Link href={`/workouts/session/${nextSession.workout_sessions.id}`} className="block">
            <div
              className="card-hover h-full flex flex-col"
              style={{
                ...card(),
                borderColor: `${nextColor.primary}30`,
                background: `linear-gradient(135deg, rgba(0,0,0,0.3) 0%, ${nextColor.dim} 100%)`,
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Ambient glow top-right */}
              <div style={{
                position: "absolute", top: -40, right: -40,
                width: 180, height: 180, borderRadius: "50%",
                background: `radial-gradient(circle, ${nextColor.primary}22 0%, transparent 70%)`,
                pointerEvents: "none",
              }} />

              {/* Label */}
              <p className="text-[10px] font-bold uppercase tracking-widest mb-3"
                style={{ color: nextColor.primary }}>
                Next Session
              </p>

              {/* Session name */}
              <p style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
                {nextSessionName}
              </p>

              {/* Duration */}
              <div className="flex items-center gap-1.5 mt-2 mb-5">
                <Clock size={12} style={{ color: "var(--text-muted)" }} />
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {SESSION_DURATION[nextSessionName] ?? "~45 min"}
                </span>
                {lastLog && (
                  <>
                    <span style={{ color: "var(--text-muted)", fontSize: 10 }}>·</span>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      Last: {format(new Date(lastLog.startedAt!), "EEE MMM d")}
                    </span>
                  </>
                )}
              </div>

              {/* Exercise list preview */}
              {heroExercises.length > 0 && (
                <div className="flex-1 space-y-1.5 mb-5">
                  {heroExercises.map((ex, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: nextColor.primary, opacity: 1 - i * 0.15 }}
                      />
                      <span className="text-sm font-medium truncate" style={{ color: "var(--text-secondary)" }}>
                        {ex.name}
                      </span>
                      {ex.muscleGroup && (
                        <span className="text-[10px] shrink-0" style={{ color: "var(--text-muted)" }}>
                          {ex.muscleGroup}
                        </span>
                      )}
                    </div>
                  ))}
                  {heroExercises.length === 5 && (
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>+ more…</p>
                  )}
                </div>
              )}

              {/* CTA */}
              <div
                className="flex items-center justify-center gap-2 py-3 px-5 rounded-xl font-bold text-sm mt-auto self-start"
                style={{ background: nextColor.primary, color: "#000" }}
              >
                <Play size={14} fill="#000" />
                Start Session
                <ArrowRight size={14} />
              </div>
            </div>
          </Link>
        ) : (
          <Link href="/workouts" className="block">
            <div className="card-hover h-full flex flex-col items-center justify-center text-center" style={card()}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl mb-4"
                style={{ background: "rgba(251,113,133,0.12)" }}>
                🏋️
              </div>
              <p className="font-bold text-lg" style={{ color: "var(--text-primary)" }}>Set up workouts</p>
              <p className="text-xs mt-1.5" style={{ color: "var(--text-muted)" }}>Load your PPL program to begin</p>
              <div className="mt-4 px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ background: "rgba(251,113,133,0.15)", color: "#fb7185" }}>
                Load Program →
              </div>
            </div>
          </Link>
        )}

        {/* ── Stat mini-cards (stacked) ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: GAP }}>
          {/* Streak */}
          <div style={{ ...card(), flex: 1 }}>
            <div className="flex items-start justify-between mb-2">
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                Streak
              </p>
              <Flame size={14} style={{ color: "#fb7185" }} />
            </div>
            <p style={{ fontSize: 36, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1 }}>
              {streak}
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              consecutive {streak === 1 ? "day" : "days"}
            </p>
          </div>
          {/* Weekly sessions */}
          <div style={{ ...card(), flex: 1 }}>
            <div className="flex items-start justify-between mb-2">
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                This Week
              </p>
              <Activity size={14} style={{ color: "var(--calendar-color)" }} />
            </div>
            <p style={{ fontSize: 36, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1 }}>
              {weekCount}
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              {weekCount === 1 ? "session" : "sessions"} · {recentLogs.length} total
            </p>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          ROW 3 — PRs · Brief · Run (3 columns)
      ════════════════════════════════════════════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: GAP }}>

        {/* ── Top PRs ── */}
        <div style={card()}>
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              Personal Records
            </p>
            <Trophy size={13} style={{ color: "#fbbf24" }} />
          </div>
          {prs.length > 0 ? (
            <div className="space-y-3">
              {prs.map((pr, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                      {pr.exerciseName}
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {pr.achievedAt ? format(new Date(pr.achievedAt), "MMM d") : "—"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold tabular-nums" style={{ color: "#fbbf24" }}>
                      {pr.bestWeightKg ? `${pr.bestWeightKg}kg` : "—"}
                    </p>
                    {pr.estimated1rm && (
                      <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        e1RM {Math.round(pr.estimated1rm)}kg
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-20 gap-2">
              <TrendingUp size={20} style={{ color: "var(--text-muted)" }} />
              <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
                PRs will appear after your first session
              </p>
            </div>
          )}
          <Link href="/workouts/history" className="flex items-center gap-1 text-[10px] font-semibold mt-4 hover:opacity-70"
            style={{ color: "var(--accent-bright)" }}>
            All PRs <ArrowRight size={10} />
          </Link>
        </div>

        {/* ── Today's Brief ── */}
        <div style={card()}>
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              Today&rsquo;s Brief
            </p>
            <Newspaper size={13} style={{ color: "var(--news-color)" }} />
          </div>
          {stories.length > 0 ? (
            <div className="space-y-3">
              {stories.map((s, i) => {
                const color = CATEGORY_COLORS[s.category] ?? "var(--text-muted)";
                return (
                  <div key={i} className="flex gap-2">
                    <div className="w-0.5 shrink-0 rounded-full self-stretch" style={{ background: color, opacity: 0.7, minHeight: 16 }} />
                    <div>
                      <p className="text-xs font-medium leading-snug" style={{ color: "var(--text-primary)" }}>
                        {s.headline}
                      </p>
                      <p className="text-[10px] mt-0.5 uppercase tracking-wide font-semibold" style={{ color }}>
                        {s.category}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-20 gap-2">
              <Zap size={20} style={{ color: "var(--text-muted)" }} />
              <Link href="/news" className="text-xs font-semibold hover:opacity-80"
                style={{ color: "var(--news-color)" }}>
                Generate brief →
              </Link>
            </div>
          )}
          <Link href="/news" className="flex items-center gap-1 text-[10px] font-semibold mt-4 hover:opacity-70"
            style={{ color: "var(--news-color)" }}>
            Full brief <ArrowRight size={10} />
          </Link>
        </div>

        {/* ── Last Run ── */}
        <div style={card()}>
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              Running
            </p>
            <Activity size={13} style={{ color: "var(--calendar-color)" }} />
          </div>
          {lastRun ? (
            <div className="space-y-3">
              <div>
                <p style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1 }}>
                  {lastRun.distanceKm.toFixed(1)}<span className="text-sm font-medium ml-1" style={{ color: "var(--text-muted)" }}>km</span>
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  {format(new Date(lastRun.date), "EEE MMM d")}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "8px 10px" }}>
                  <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Pace</p>
                  <p className="text-sm font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
                    {fmtPace(lastRun.paceSecondsPerKm)}
                  </p>
                </div>
                <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "8px 10px" }}>
                  <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Time</p>
                  <p className="text-sm font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
                    {fmtDuration(lastRun.durationSeconds)}
                  </p>
                </div>
              </div>
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                {totalRuns.length} run{totalRuns.length !== 1 ? "s" : ""} logged
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-24 gap-2">
              <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
                No runs logged yet
              </p>
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>0 km · 0 runs</p>
            </div>
          )}
          <Link href="/workouts/history" className="flex items-center gap-1 text-[10px] font-semibold mt-4 hover:opacity-70"
            style={{ color: "var(--calendar-color)" }}>
            Log a run <ArrowRight size={10} />
          </Link>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          ROW 4 — Week schedule + Reading/WordBank
      ════════════════════════════════════════════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: GAP }}>

        {/* ── Week schedule strip ── */}
        <div style={card()}>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-muted)" }}>
            Last 7 Days
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
            {weekDays.map(({ label, dayNum, sessionName, isToday }) => {
              const sc = sessionName ? SESSION_COLORS[sessionName] : null;
              return (
                <div key={dayNum} className="flex flex-col items-center gap-1.5">
                  <p className="text-[10px] font-medium" style={{ color: isToday ? "var(--text-primary)" : "var(--text-muted)" }}>
                    {label}
                  </p>
                  <div
                    style={{
                      width: "100%",
                      aspectRatio: "1",
                      borderRadius: 8,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: sc ? sc.dim : "rgba(255,255,255,0.04)",
                      border: isToday ? "1px solid rgba(255,255,255,0.15)" : "1px solid transparent",
                    }}
                  >
                    {sc ? (
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: sc.primary }} />
                    ) : (
                      <div style={{ width: 4, height: 4, borderRadius: "50%", background: "rgba(255,255,255,0.15)" }} />
                    )}
                  </div>
                  <p className="text-[10px] font-medium" style={{ color: sc ? sc.primary : "var(--text-muted)" }}>
                    {sessionName ? sessionName.slice(0, 3) : dayNum}
                  </p>
                </div>
              );
            })}
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-4">
            {Object.entries(SESSION_COLORS).map(([name, c]) => (
              <div key={name} className="flex items-center gap-1.5">
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: c.primary }} />
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Reading + Word Bank stacked ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: GAP }}>
          {/* Reading */}
          <div style={{ ...card(), flex: 1 }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                Reading
              </p>
              <BookOpen size={13} style={{ color: "var(--library-color)" }} />
            </div>
            {currentBook ? (
              <Link href={`/library/read/${currentBook.id}`} className="block">
                <p className="text-sm font-bold leading-snug truncate" style={{ color: "var(--text-primary)" }}>
                  {currentBook.title}
                </p>
                <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
                  {currentBook.author}
                </p>
                <div className="progress-track mt-3">
                  <div className="progress-fill" style={{ width: `${readPct}%`, background: "var(--library-color)" }} />
                </div>
                <div className="flex justify-between mt-1.5">
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>p.{currentPage}</span>
                  <span className="text-[10px] font-semibold" style={{ color: "var(--library-color)" }}>{readPct}%</span>
                </div>
              </Link>
            ) : (
              <Link href="/library" className="text-xs font-semibold hover:opacity-80"
                style={{ color: "var(--library-color)" }}>
                Load 2026 reading list →
              </Link>
            )}
          </div>

          {/* Word Bank */}
          <div style={{ ...card(), flex: 1 }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                Word Bank
              </p>
              <BookMarked size={13} style={{ color: "var(--wordbank-color)" }} />
            </div>
            <p style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1 }}>
              {dueWords.length}
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              due · {totalWords.length} total words
            </p>
            {dueWords.length > 0 && (
              <Link href="/wordbank"
                className="inline-flex items-center gap-1 text-[10px] font-bold mt-3 px-3 py-1.5 rounded-lg hover:opacity-80"
                style={{ background: "rgba(244,114,182,0.12)", color: "var(--wordbank-color)" }}>
                Review now <ArrowRight size={10} />
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
