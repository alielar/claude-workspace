/**
 * /dashboard — Morning hub. V2 Ambient Futurism.
 *
 * Time-aware layout (Europe/Madrid):
 *   Morning   05-12: Streak hero (large) | News top 3 · Checklist below
 *   Afternoon 12-18: Checklist primary | Streak + News collapsed
 *   Evening   18-00: Checklist primary | Streak smaller | Reading
 *   Night     00-05: Minimal — streak + reading + tomorrow preview
 *
 * 5 data-wired cards: Streak hero, News brief top 3, Checklist (interactive),
 * Compact 7-day heatmap, Reading current book.
 *
 * Force dynamic: page queries live DB (including checklist schema that may
 * change after migrations), so we can't prerender at build time.
 */

export const dynamic = "force-dynamic";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  workoutSessions, workoutPrograms, workoutLogs,
  newsBriefs, books, readingProgress,
  checklistItems, checklistCompletions,
} from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import Link from "next/link";
import { format, subDays, startOfWeek } from "date-fns";
import { ChecklistCard } from "@/components/dashboard/ChecklistCard";

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = "morning" | "afternoon" | "evening" | "night";

type Story = {
  headline: string;
  summary?: string;
  category: string;
  source?: string;
  bullets?: string[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Current hour in Europe/Madrid (handles DST automatically) */
function madridHour(): number {
  const s = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid",
    hour: "numeric",
    hour12: false,
  }).format(new Date());
  return parseInt(s, 10);
}

function getPeriod(hour: number): Period {
  if (hour >= 5  && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  if (hour >= 18)               return "evening";
  return "night";
}

function greeting(period: Period): string {
  if (period === "morning")   return "Good morning";
  if (period === "afternoon") return "Good afternoon";
  if (period === "evening")   return "Good evening";
  return "Late night";
}

/** Build boolean activity array for last N days (for sparkline) */
function activityDays(logs: { startedAt: Date | null }[], days: number, now: Date): boolean[] {
  return Array.from({ length: days }, (_, i) => {
    const d = format(subDays(now, days - 1 - i), "yyyy-MM-dd");
    return logs.some((l) => l.startedAt && format(new Date(l.startedAt), "yyyy-MM-dd") === d);
  });
}

/** SVG sparkline paths from boolean activity array */
function sparkline(activity: boolean[], W = 220, H = 64): { line: string; area: string; lastY: number } {
  const n = activity.length;
  const pts = activity.map((on, i) => ({
    x: (i / Math.max(n - 1, 1)) * W,
    y: on ? 8 + (1 - i / n) * 16 : 44 + (i % 3) * 3,
  }));
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  return { line: d, area: d + ` L${W},${H} L0,${H} Z`, lastY: pts.at(-1)?.y ?? H / 2 };
}

/** Workout streak from sorted desc logs */
function calcStreak(logs: { startedAt: Date | null }[], today: string): number {
  const days = [...new Set(logs
    .filter((l) => l.startedAt)
    .map((l) => format(new Date(l.startedAt!), "yyyy-MM-dd"))
  )].sort().reverse();
  if (days.length === 0) return 0;
  let check = today;
  // If today not logged, allow starting from yesterday
  if (!days.includes(check)) check = format(subDays(new Date(today + "T12:00:00"), 1), "yyyy-MM-dd");
  let count = 0;
  for (const d of days) {
    if (d === check) {
      count++;
      check = format(subDays(new Date(check + "T12:00:00"), 1), "yyyy-MM-dd");
    } else if (d < check) break;
  }
  return count;
}

/** Heatmap cell bg/border for a session type */
function heatStyle(name: string | null, isToday: boolean): React.CSSProperties {
  if (name === "Legs")
    return { background: "linear-gradient(135deg,rgba(124,77,255,0.45),rgba(100,255,218,0.18))", borderColor: "rgba(124,77,255,0.50)" };
  if (name === "Pull")
    return { background: "linear-gradient(135deg,rgba(100,255,218,0.35),rgba(124,77,255,0.12))", borderColor: "rgba(100,255,218,0.40)" };
  if (name === "Push")
    return { background: "linear-gradient(135deg,rgba(124,77,255,0.22),rgba(124,77,255,0.06))", borderColor: "rgba(124,77,255,0.30)" };
  if (name)
    return { background: "linear-gradient(135deg,rgba(100,255,218,0.18),rgba(100,255,218,0.04))", borderColor: "rgba(100,255,218,0.28)" };
  if (isToday)
    return { background: "rgba(255,255,255,0.012)", borderColor: "rgba(100,255,218,0.50)", borderStyle: "dashed" };
  return { background: "rgba(255,255,255,0.012)", borderColor: "var(--line)" };
}

/** Category dot color */
const CAT_COLOR: Record<string, string> = {
  politics:    "var(--c-politics)",
  tech:        "var(--c-tech)",
  ai:          "var(--c-ai)",
  mena:        "var(--c-mena)",
  "morocco/mena": "var(--c-mena)",
  football:    "var(--c-biz)",
  business:    "var(--c-biz)",
};

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

  const now       = new Date();
  const today     = format(now, "yyyy-MM-dd");
  const madridH   = madridHour();
  const period    = getPeriod(madridH);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });

  // ── Parallel data fetches ──────────────────────────────────────────────────
  const [
    allSessions,
    recentLogs,
    [brief],
    [currentBook],
    checkItems,
    todayCompletions,
  ] = await Promise.all([
    db.select().from(workoutSessions)
      .innerJoin(workoutPrograms, eq(workoutSessions.programId, workoutPrograms.id))
      .where(eq(workoutPrograms.userId, userId))
      .orderBy(workoutSessions.sortOrder),

    db.select({ startedAt: workoutLogs.startedAt, sessionId: workoutLogs.sessionId })
      .from(workoutLogs)
      .where(eq(workoutLogs.userId, userId))
      .orderBy(desc(workoutLogs.startedAt))
      .limit(60),

    db.select().from(newsBriefs)
      .where(and(eq(newsBriefs.userId, userId), eq(newsBriefs.date, today)))
      .limit(1),

    db.select().from(books)
      .where(and(eq(books.userId, userId), eq(books.status, "reading")))
      .limit(1),

    db.select().from(checklistItems)
      .where(and(eq(checklistItems.userId, userId), eq(checklistItems.active, true)))
      .orderBy(checklistItems.sortOrder),

    db.select({ itemId: checklistCompletions.itemId }).from(checklistCompletions)
      .where(and(eq(checklistCompletions.userId, userId), eq(checklistCompletions.date, today))),
  ]);

  // ── Reading progress ───────────────────────────────────────────────────────
  let readPct = 0, currentPage = 0;
  if (currentBook) {
    const [prog] = await db.select().from(readingProgress)
      .where(eq(readingProgress.bookId, currentBook.id)).limit(1);
    currentPage = prog?.currentPage ?? 0;
    readPct = currentBook.totalPages
      ? Math.round((currentPage / currentBook.totalPages) * 100) : 0;
  }
  const ringC = 201; // 2π × 32
  const ringOffset = ringC - (readPct / 100) * ringC;

  // ── Streak ─────────────────────────────────────────────────────────────────
  const streak   = calcStreak(recentLogs, today);
  const weekCount = recentLogs.filter((l) => l.startedAt && new Date(l.startedAt) >= weekStart).length;

  // ── Sparkline ──────────────────────────────────────────────────────────────
  const activity = activityDays(recentLogs, 30, now);
  const spark    = sparkline(activity);

  // ── 7-day heatmap ──────────────────────────────────────────────────────────
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d   = subDays(now, 6 - i);
    const key = format(d, "yyyy-MM-dd");
    const log = recentLogs.find((l) => l.startedAt && format(new Date(l.startedAt), "yyyy-MM-dd") === key);
    const name = log
      ? allSessions.find((s) => s.workout_sessions.id === log.sessionId)?.workout_sessions.name ?? null
      : null;
    return { label: format(d, "EEE").toUpperCase(), dayNum: parseInt(format(d, "d")), name, isToday: key === today };
  });

  // ── News ───────────────────────────────────────────────────────────────────
  let stories: Story[] = [];
  if (brief) {
    try { stories = (JSON.parse(brief.content as string).stories ?? []).slice(0, 3); } catch { /* */ }
  }

  // ── Checklist ──────────────────────────────────────────────────────────────
  const completedIds  = new Set(todayCompletions.map((c) => c.itemId));
  const checkDone     = completedIds.size;
  const checkTotal    = checkItems.length;
  const checkPct      = checkTotal > 0 ? Math.round((checkDone / checkTotal) * 100) : 0;

  // Items for the client component (serializable)
  const checkItemsSerial = checkItems.map((i) => ({
    id: i.id,
    title: i.title,
    emoji: i.emoji,
    source: "manual" as const,
  }));

  // ── Cards ─────────────────────────────────────────────────────────────────

  // ─ Streak Hero ─
  const StreakHero = ({ small }: { small?: boolean }) => (
    <div className="cc-card" style={{
      padding: small ? "20px 22px" : "28px 32px",
      height: "100%", display: "flex", flexDirection: "column", gap: small ? 16 : 20,
      background: `radial-gradient(60% 80% at 0% 0%, rgba(124,77,255,0.13), transparent 60%),
                   radial-gradient(50% 80% at 100% 100%, rgba(100,255,218,0.08), transparent 60%),
                   var(--bg-card)`,
      overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10.5, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)" }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--cyan)", boxShadow: "0 0 8px var(--cyan)", flexShrink: 0 }} />
        Streak · current
      </div>

      {small ? (
        /* Compact version (afternoon/evening) */
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div className="tabular-nums" style={{ fontSize: 72, fontWeight: 200, letterSpacing: "-0.06em", lineHeight: 0.9, background: "var(--grad)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", filter: "drop-shadow(0 0 18px rgba(124,77,255,0.18))" }}>
            {streak}<sup style={{ fontSize: 22, WebkitTextFillColor: "var(--ink-3)", color: "var(--ink-3)", verticalAlign: "top", position: "relative", top: 16, marginLeft: 4, background: "none" }}>d</sup>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.5 }}>
              {streak >= 7 ? "Keep the streak!" : streak > 0 ? "Build the habit." : "Start today."}
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4, fontFamily: "var(--f-mono)" }}>
              {weekCount} sessions this week
            </div>
          </div>
        </div>
      ) : (
        /* Full version (morning) */
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, alignItems: "end" }}>
            <div>
              <div className="tabular-nums" style={{ fontSize: 120, fontWeight: 200, letterSpacing: "-0.06em", lineHeight: 0.85, background: "var(--grad)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", filter: "drop-shadow(0 0 22px rgba(124,77,255,0.20))" }}>
                {streak}
                <sup style={{ fontSize: 28, WebkitTextFillColor: "var(--ink-3)", color: "var(--ink-3)", verticalAlign: "top", position: "relative", top: 22, marginLeft: 6, background: "none" }}>d</sup>
              </div>
              <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 12, lineHeight: 1.55 }}>
                {streak >= 7 ? <><strong style={{ color: "var(--ink)" }}>On a roll!</strong> Keep going.</> : streak > 0 ? <>Keep building the habit.</> : <>Start your streak today.</>}
              </div>
            </div>
            <div>
              <svg viewBox="0 0 220 64" preserveAspectRatio="none" style={{ height: 72, width: "100%", display: "block" }}>
                <defs>
                  <linearGradient id="sk-stroke" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#7C4DFF" />
                    <stop offset="100%" stopColor="#64FFDA" />
                  </linearGradient>
                  <linearGradient id="sk-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(124,77,255,0.16)" />
                    <stop offset="100%" stopColor="rgba(124,77,255,0)" />
                  </linearGradient>
                </defs>
                <path fill="url(#sk-fill)" d={spark.area} />
                <path fill="none" stroke="url(#sk-stroke)" strokeWidth={1.5} d={spark.line} />
                <circle cx="220" cy={spark.lastY} r="3" fill="var(--cyan)" style={{ filter: "drop-shadow(0 0 4px var(--cyan))" }} />
              </svg>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, color: "var(--ink-4)", letterSpacing: "0.08em", marginTop: 5, fontFamily: "var(--f-mono)" }}>
                <span>30D AGO</span><span>TODAY</span>
              </div>
            </div>
          </div>

          {/* 2 quick stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              { label: "This week", value: weekCount, unit: "sessions" },
              { label: "30-day",    value: activity.filter(Boolean).length, unit: "workouts" },
            ].map((s) => (
              <div key={s.label} style={{ padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 10, background: "rgba(255,255,255,0.015)", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 1, background: "linear-gradient(90deg,transparent,rgba(124,77,255,0.25),transparent)" }} />
                <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 6 }}>{s.label}</div>
                <div className="tabular-nums" style={{ fontSize: 26, fontWeight: 300, letterSpacing: "-0.02em", lineHeight: 1 }}>
                  {s.value} <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{s.unit}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );

  // ─ News Card ─
  const NewsCard = ({ collapsed }: { collapsed?: boolean }) => (
    <div className="cc-card" style={{ padding: 22, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: collapsed ? 0 : 14 }}>
        <div style={HTITLE}><span style={DOT} />Daily Brief</div>
        <Link href="/news" style={{ fontSize: 11, color: "var(--ink-3)", textDecoration: "none", letterSpacing: "0.04em" }}>
          {stories.length > 0 ? format(now, "HH:mm") : "generate"}
        </Link>
      </div>

      {collapsed ? (
        /* Afternoon: collapsed to single link */
        <Link href="/news" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", textDecoration: "none", padding: "14px 0" }}>
          <div style={{ fontSize: 13.5, color: "var(--ink-2)" }}>
            {stories.length > 0 ? "Today's brief is ready" : "No brief generated yet"}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--cyan)" }}>
            Read now
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        </Link>
      ) : stories.length > 0 ? (
        /* Morning: top 3 headlines */
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {stories.map((s, i) => {
            const cat   = (s.category ?? "").toLowerCase();
            const color = CAT_COLOR[cat] ?? "var(--ink-3)";
            return (
              <Link key={i} href="/news" style={{ textDecoration: "none", display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 0", borderBottom: i < stories.length - 1 ? "1px solid var(--line)" : "none" }}>
                {/* Rank */}
                <span style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--ink-4)", letterSpacing: "0.04em", paddingTop: 2, flexShrink: 0, minWidth: 18 }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                {/* Category dot */}
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, boxShadow: `0 0 5px ${color}`, flexShrink: 0, marginTop: 5 }} />
                {/* Headline */}
                <span style={{ fontSize: 13.5, lineHeight: 1.4, letterSpacing: "-0.005em", color: "var(--ink)", fontWeight: 450, flex: 1 }}>
                  {s.headline}
                </span>
                {/* Source */}
                {s.source && (
                  <span style={{ fontSize: 10.5, color: "var(--ink-4)", letterSpacing: "0.04em", flexShrink: 0, paddingTop: 2, fontFamily: "var(--f-mono)" }}>
                    {s.source}
                  </span>
                )}
              </Link>
            );
          })}
          <Link href="/news" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--ink-3)", textDecoration: "none", paddingTop: 12 }}>
            Read full brief →
          </Link>
        </div>
      ) : (
        /* Empty state */
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12, padding: "12px 0" }}>
          <p style={{ fontSize: 13, color: "var(--ink-3)", margin: 0 }}>No brief generated for today yet.</p>
          <Link href="/news" className="cc-btn cc-btn-primary" style={{ fontSize: 12, padding: "10px 18px", display: "inline-flex" }}>
            Generate today's brief →
          </Link>
        </div>
      )}
    </div>
  );

  // ─ Compact Heatmap ─
  const HeatmapCard = () => (
    <div className="cc-card" style={{ padding: "16px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={HTITLE}><span style={DOT} />Last 7 Days</div>
        <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{weekDays.filter((d) => d.name).length} sessions</span>
      </div>
      {/* 7 cells in a row, ~40px height */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
        {weekDays.map(({ label, dayNum, name, isToday }) => {
          const cs = heatStyle(name, isToday);
          return (
            <div key={dayNum} style={{
              height: 44, borderRadius: 8,
              border: `1px ${cs.borderStyle ?? "solid"} ${cs.borderColor ?? "var(--line)"}`,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
              ...cs,
            }}>
              <span style={{ fontSize: 9, letterSpacing: "0.06em", fontFamily: "var(--f-mono)", color: name ? "var(--ink-2)" : isToday ? "var(--cyan)" : "var(--ink-4)", fontWeight: 600 }}>
                {label.slice(0, 3)}
              </span>
              <span style={{ fontSize: 8.5, color: name ? "var(--ink-3)" : "var(--ink-5)", fontFamily: "var(--f-mono)" }}>
                {name ? name.slice(0, 4).toUpperCase() : "-"}
              </span>
            </div>
          );
        })}
      </div>
      {/* Compact legend */}
      <div style={{ display: "flex", gap: 12, marginTop: 10, fontSize: 10, color: "var(--ink-4)", fontFamily: "var(--f-mono)" }}>
        {[
          { label: "Legs", bg: "linear-gradient(135deg,rgba(124,77,255,0.45),rgba(100,255,218,0.18))" },
          { label: "Pull", bg: "linear-gradient(135deg,rgba(100,255,218,0.35),rgba(124,77,255,0.12))" },
          { label: "Push", bg: "linear-gradient(135deg,rgba(124,77,255,0.22),rgba(124,77,255,0.06))" },
        ].map((l) => (
          <span key={l.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <i style={{ display: "inline-block", width: 8, height: 8, borderRadius: 3, background: l.bg }} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );

  // ─ Reading Card ─
  const ReadingCard = () => (
    <Link href={currentBook ? `/library/read/${currentBook.id}` : "/library"} style={{ display: "block", height: "100%", textDecoration: "none" }}>
      <div className="cc-card cc-card-hover" style={{ padding: 22, height: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={HTITLE}><span style={DOT} />Reading · Current</div>
          {currentBook && <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{readPct}%</span>}
        </div>
        {currentBook ? (
          <>
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              {/* Book spine */}
              <div style={{ width: 42, height: 60, borderRadius: 3, background: "linear-gradient(160deg,#3A2E22,#1A1714)", border: "1px solid var(--line-hi)", flexShrink: 0, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", left: 5, top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.10)" }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                  {currentBook.title}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 3 }}>{currentBook.author}</div>
              </div>
            </div>
            {/* Progress ring + stats */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16 }}>
              <svg width="56" height="56" viewBox="0 0 80 80" style={{ flexShrink: 0 }}>
                <defs>
                  <linearGradient id="db-ring" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#7C4DFF" />
                    <stop offset="100%" stopColor="#64FFDA" />
                  </linearGradient>
                </defs>
                <circle fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" cx="40" cy="40" r="32" />
                <circle fill="none" stroke="url(#db-ring)" strokeWidth="6" strokeLinecap="round"
                  cx="40" cy="40" r="32"
                  strokeDasharray={ringC}
                  strokeDashoffset={ringOffset}
                  transform="rotate(-90 40 40)"
                  style={{ filter: "drop-shadow(0 0 5px rgba(124,77,255,0.40))" }}
                />
              </svg>
              <div>
                <div className="tabular-nums" style={{ fontSize: 22, fontWeight: 300, letterSpacing: "-0.02em", background: "var(--grad)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
                  {readPct}%
                </div>
                <div style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: "0.04em", textTransform: "uppercase", fontFamily: "var(--f-mono)", marginTop: 2 }}>
                  p.{currentPage} / {currentBook.totalPages ?? "?"}
                </div>
              </div>
            </div>
          </>
        ) : (
          <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "12px 0 0" }}>
            No book in progress → Choose one
          </p>
        )}
      </div>
    </Link>
  );

  // ─ Night minimal card ─
  const NightCard = () => (
    <div className="cc-card" style={{ padding: "20px 24px", gridColumn: "span 12" }}>
      <div style={{ fontSize: 13, color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--violet)", boxShadow: "0 0 6px var(--violet)", flexShrink: 0 }} />
        It's late. Tomorrow:
        <span style={{ color: "var(--ink-2)" }}>
          {streak > 0 ? `${streak}d streak to maintain` : "Start your streak"}
          {currentBook ? ` · continue ${currentBook.title}` : ""}
          {checkTotal > 0 ? ` · ${checkTotal} checklist items` : ""}
        </span>
      </div>
    </div>
  );

  // ─ Layout assembly ─────────────────────────────────────────────────────────

  return (
    <div className="page-enter">
      {/* Greeting */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 30, fontWeight: 300, letterSpacing: "-0.025em", margin: 0, lineHeight: 1.05 }}>
          {greeting(period)},{" "}
          <span style={{ background: "var(--grad)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", fontWeight: 400 }}>
            Ali
          </span>
          <span style={{ color: "var(--ink-3)" }}>.</span>
        </h2>
        <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 6 }}>
          {format(now, "EEEE, MMMM d, yyyy")}
        </div>
      </div>

      {/* ── Grid ─────────────────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gridAutoRows: "auto", gap: 14 }}>

        {/* ── MORNING: Streak large | News + Checklist | Heatmap + Reading ─── */}
        {period === "morning" && (
          <>
            {/* Streak hero — large, left */}
            <div style={{ gridColumn: "span 5", gridRow: "span 2" }}>
              <StreakHero />
            </div>
            {/* News top 3 — top right */}
            <div style={{ gridColumn: "span 7" }}>
              <NewsCard />
            </div>
            {/* Checklist — bottom right */}
            <div style={{ gridColumn: "span 7" }}>
              <ChecklistCard items={checkItemsSerial} completedIds={completedIds} total={checkTotal} />
            </div>
            {/* Heatmap compact — bottom left */}
            <div style={{ gridColumn: "span 5" }}>
              <HeatmapCard />
            </div>
            {/* Reading — bottom right */}
            <div style={{ gridColumn: "span 7" }}>
              <ReadingCard />
            </div>
          </>
        )}

        {/* ── AFTERNOON: Checklist primary | Streak + News collapsed ──────── */}
        {period === "afternoon" && (
          <>
            {/* Streak — smaller, left */}
            <div style={{ gridColumn: "span 4" }}>
              <StreakHero small />
            </div>
            {/* News collapsed */}
            <div style={{ gridColumn: "span 8" }}>
              <NewsCard collapsed />
            </div>
            {/* Checklist — primary, full width */}
            <div style={{ gridColumn: "span 8", gridRow: "span 2" }}>
              <ChecklistCard items={checkItemsSerial} completedIds={completedIds} total={checkTotal} />
            </div>
            {/* Reading */}
            <div style={{ gridColumn: "span 4" }}>
              <ReadingCard />
            </div>
            {/* Heatmap */}
            <div style={{ gridColumn: "span 4" }}>
              <HeatmapCard />
            </div>
          </>
        )}

        {/* ── EVENING: Checklist top-left | Streak + Reading right ────────── */}
        {period === "evening" && (
          <>
            {/* Checklist — primary */}
            <div style={{ gridColumn: "span 7", gridRow: "span 2" }}>
              <ChecklistCard items={checkItemsSerial} completedIds={completedIds} total={checkTotal} />
            </div>
            {/* Streak small */}
            <div style={{ gridColumn: "span 5" }}>
              <StreakHero small />
            </div>
            {/* Reading */}
            <div style={{ gridColumn: "span 5" }}>
              <ReadingCard />
            </div>
            {/* Heatmap — full bottom row */}
            <div style={{ gridColumn: "span 12" }}>
              <HeatmapCard />
            </div>
          </>
        )}

        {/* ── NIGHT: Minimal view ──────────────────────────────────────────── */}
        {period === "night" && (
          <>
            <NightCard />
            <div style={{ gridColumn: "span 5" }}>
              <StreakHero small />
            </div>
            <div style={{ gridColumn: "span 7" }}>
              <ReadingCard />
            </div>
          </>
        )}

      </div>
    </div>
  );
}
