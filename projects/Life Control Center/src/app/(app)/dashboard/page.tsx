/**
 * /dashboard — V2 Ambient Futurism
 * Reproduced directly from design-system/mockups/Life Control Center Mockup.html
 */

import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  workoutSessions, workoutPrograms, workoutLogs,
  exercises as exercisesTable,
  newsBriefs, books, readingProgress, wordBankEntries,
  checklistItems, checklistCompletions,
} from "@/db/schema";
import { eq, desc, and, lte } from "drizzle-orm";
import Link from "next/link";
import { Play, ArrowRight, Check } from "lucide-react";
import { format, subDays, startOfWeek } from "date-fns";

const ROTATION = ["Push", "Pull", "Legs", "Core", "Push", "Pull", "Push-Up Skill"];

function greeting(h: number) {
  if (h < 5)  return "Still up";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** Convert boolean[] activity to SVG sparkline paths */
function sparkline(days: boolean[], W = 220, H = 80) {
  const n = days.length;
  const pts = days.map((active, i) => ({
    x: (i / Math.max(n - 1, 1)) * W,
    y: active ? 10 + (1 - i / n) * 25 : 58 + (i % 4) * 2,
  }));
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = line + ` L${W},${H} L0,${H} Z`;
  const lastY = pts[pts.length - 1]?.y ?? H / 2;
  return { line, area, lastY };
}

/** Heatmap cell style from session name (matches mockup gradients) */
function heatStyle(name: string | null, isToday: boolean): React.CSSProperties {
  if (name === "Push")
    return { background: "linear-gradient(135deg, rgba(179,136,255,0.20), rgba(179,136,255,0.05))", borderColor: "rgba(179,136,255,0.30)", boxShadow: "inset 0 0 14px rgba(179,136,255,0.12)" };
  if (name === "Pull")
    return { background: "linear-gradient(135deg, rgba(179,136,255,0.32), rgba(126,231,255,0.10))", borderColor: "rgba(179,136,255,0.40)", boxShadow: "inset 0 0 16px rgba(179,136,255,0.18)" };
  if (name === "Legs")
    return { background: "linear-gradient(135deg, rgba(179,136,255,0.50), rgba(126,231,255,0.20))", borderColor: "rgba(179,136,255,0.55)", boxShadow: "inset 0 0 22px rgba(179,136,255,0.28)" };
  if (name)
    return { background: "linear-gradient(135deg, rgba(126,231,255,0.20), rgba(126,231,255,0.04))", borderColor: "rgba(126,231,255,0.30)", boxShadow: "inset 0 0 14px rgba(126,231,255,0.12)" };
  if (isToday)
    return { background: "rgba(255,255,255,0.015)", borderColor: "rgba(126,231,255,0.50)" };
  return { background: "rgba(255,255,255,0.015)", borderColor: "var(--line)" };
}

/** News category pill style */
const CAT_STYLES: Record<string, React.CSSProperties> = {
  politics:   { color: "#FFB266", borderColor: "rgba(255,178,102,0.30)", background: "rgba(255,178,102,0.06)" },
  football:   { color: "#FFB266", borderColor: "rgba(255,178,102,0.30)", background: "rgba(255,178,102,0.06)" },
  geopolitics:{ color: "#FFB266", borderColor: "rgba(255,178,102,0.30)", background: "rgba(255,178,102,0.06)" },
  tech:       { color: "#B388FF", borderColor: "rgba(179,136,255,0.30)", background: "rgba(179,136,255,0.06)" },
  ai:         { color: "#7EE7FF", borderColor: "rgba(126,231,255,0.30)", background: "rgba(126,231,255,0.06)" },
  "morocco/mena": { color: "#9CE0B4", borderColor: "rgba(156,224,180,0.30)", background: "rgba(156,224,180,0.06)" },
  mena:       { color: "#9CE0B4", borderColor: "rgba(156,224,180,0.30)", background: "rgba(156,224,180,0.06)" },
  business:   { color: "#E0A4D7", borderColor: "rgba(224,164,215,0.30)", background: "rgba(224,164,215,0.06)" },
  other:      { color: "var(--ink-3)", borderColor: "var(--line)", background: "rgba(255,255,255,0.02)" },
};

/** Shared card-head dot style */
const DOT: React.CSSProperties = {
  width: 5, height: 5, borderRadius: "50%",
  background: "var(--violet)", boxShadow: "0 0 8px var(--violet)",
  flexShrink: 0,
};

/** Shared card-head title row style */
const CARD_HEAD_TITLE: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8,
  fontSize: 10.5, fontWeight: 500, letterSpacing: "0.18em",
  textTransform: "uppercase", color: "var(--ink-3)",
};

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
    allSessions, recentLogs, [brief],
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

  // ── Checklist ──────────────────────────────────────────────────────────────
  const completedIds = new Set(todayCompletions.map((c) => c.itemId));
  const checkDone  = checkItems.filter((i) => completedIds.has(i.id)).length;
  const checkTotal = checkItems.length;
  const checkPct   = checkTotal > 0 ? Math.round((checkDone / checkTotal) * 100) : 0;

  // ── Next session ───────────────────────────────────────────────────────────
  const lastLog = recentLogs[0] ?? null;
  const lastSessionName = lastLog
    ? allSessions.find((s) => s.workout_sessions.id === lastLog.sessionId)?.workout_sessions.name
    : null;
  const lastIdx         = lastSessionName ? ROTATION.lastIndexOf(lastSessionName) : -1;
  const nextSessionName = ROTATION[(lastIdx + 1) % ROTATION.length];
  const nextSession     = allSessions.find((s) => s.workout_sessions.name === nextSessionName);

  const heroExercises = nextSession
    ? await db.select({ name: exercisesTable.name, sets: exercisesTable.defaultSets, reps: exercisesTable.defaultReps })
        .from(exercisesTable)
        .where(eq(exercisesTable.sessionId, nextSession.workout_sessions.id))
        .orderBy(exercisesTable.sortOrder)
        .limit(5)
    : [];

  // ── Streak ─────────────────────────────────────────────────────────────────
  let streak = 0;
  if (recentLogs.length > 0) {
    const logDays = [...new Set(recentLogs.map((l) => format(new Date(l.startedAt!), "yyyy-MM-dd")))];
    let check = format(now, "yyyy-MM-dd");
    if (!logDays.includes(check)) check = format(subDays(now, 1), "yyyy-MM-dd");
    for (const day of logDays) {
      if (day === check) { streak++; check = format(subDays(new Date(check), 1), "yyyy-MM-dd"); }
      else if (day < check) break;
    }
  }
  const weekCount = recentLogs.filter((l) => new Date(l.startedAt!) >= weekStart).length;

  // ── Books ──────────────────────────────────────────────────────────────────
  const finishedBooks = await db.select({ id: books.id }).from(books)
    .where(and(eq(books.userId, userId), eq(books.status, "finished")));
  const booksFinished = finishedBooks.length;

  // ── Reading progress ───────────────────────────────────────────────────────
  let readPct = 0, currentPage = 0;
  if (currentBook) {
    const [prog] = await db.select().from(readingProgress)
      .where(eq(readingProgress.bookId, currentBook.id)).limit(1);
    currentPage = prog?.currentPage ?? 0;
    readPct = currentBook.totalPages
      ? Math.round((currentPage / currentBook.totalPages) * 100) : 0;
  }
  const ringCircumference = 201;
  const ringOffset = ringCircumference - (readPct / 100) * ringCircumference;

  // ── 30-day bars ────────────────────────────────────────────────────────────
  const last30 = Array.from({ length: 30 }, (_, i) => {
    const d = format(subDays(now, 29 - i), "yyyy-MM-dd");
    return recentLogs.some((l) => format(new Date(l.startedAt!), "yyyy-MM-dd") === d);
  });
  const spark = sparkline(last30);

  // ── 7-day heatmap ──────────────────────────────────────────────────────────
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d   = subDays(now, 6 - i);
    const key = format(d, "yyyy-MM-dd");
    const log = recentLogs.find((l) => format(new Date(l.startedAt!), "yyyy-MM-dd") === key);
    const name = log
      ? allSessions.find((s) => s.workout_sessions.id === log.sessionId)?.workout_sessions.name ?? null
      : null;
    return { label: format(d, "EEE"), dayNum: format(d, "d"), name, isToday: key === today };
  });

  // ── News ───────────────────────────────────────────────────────────────────
  type Story = { headline: string; summary?: string; category: string };
  let stories: Story[] = [];
  if (brief) {
    try { stories = (JSON.parse(brief.content).stories ?? []).slice(0, 5); } catch { /* */ }
  }

  return (
    <div className="page-enter" style={{ padding: "28px 32px 64px", maxWidth: 1500, margin: "0 auto" }}>

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 30 }}>
        <div>
          <h2 style={{ fontSize: 30, fontWeight: 300, letterSpacing: "-0.025em", margin: 0, lineHeight: 1.05 }}>
            {greeting(hour)},{" "}
            <span className="cc-grad-text" style={{ fontWeight: 400 }}>{userName}</span>
          </h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 12, color: "var(--ink-3)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 10px", border: "1px solid var(--line-hi)", borderRadius: 99, fontSize: 11, color: "var(--ink-2)", background: "rgba(255,255,255,0.02)" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--cyan)", boxShadow: "0 0 0 5px rgba(126,231,255,0.10), 0 0 12px var(--cyan)", display: "inline-block" }} />
            Synced
          </span>
          <span>{format(now, "EEEE, MMMM d, yyyy")}</span>
        </div>
      </div>

      {/* ── 12-column grid ───────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gridAutoRows: "auto", gap: 14 }}>

        {/* ── HERO (6 cols × 2 rows) ────────────────────────────────────────── */}
        <div className="cc-card" style={{
          gridColumn: "span 6", gridRow: "span 2",
          padding: "30px 32px",
          display: "flex", flexDirection: "column", gap: 24,
          background: `
            radial-gradient(60% 80% at 0% 0%, rgba(179,136,255,0.14), transparent 60%),
            radial-gradient(50% 80% at 100% 100%, rgba(126,231,255,0.10), transparent 60%),
            var(--bg-card)`,
          overflow: "hidden",
        }}>
          {/* Lead: big number + sparkline */}
          <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 36, alignItems: "end" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, letterSpacing: "0.20em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 16 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--cyan)", boxShadow: "0 0 8px var(--cyan)", flexShrink: 0 }} />
                Overall streak · current
              </div>
              <div className="tabular-nums" style={{
                fontSize: 140, fontWeight: 200, letterSpacing: "-0.06em", lineHeight: 0.82,
                background: "var(--grad)",
                WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
                filter: "drop-shadow(0 0 24px rgba(179,136,255,0.20))",
              }}>
                {streak}
                <sup style={{ fontSize: 32, fontWeight: 300, letterSpacing: 0, marginLeft: 6, verticalAlign: "top", position: "relative", top: 24, color: "var(--ink-3)", WebkitTextFillColor: "var(--ink-3)", background: "none" }}>d</sup>
              </div>
              <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 10, maxWidth: "32ch", lineHeight: 1.55 }}>
                {streak >= 7
                  ? <>Personal milestone. <strong style={{ color: "var(--ink)", fontWeight: 500 }}>Keep going!</strong></>
                  : streak > 0
                    ? <>Nice work. <strong style={{ color: "var(--ink)", fontWeight: 500 }}>Build the streak.</strong></>
                    : "Start your streak today."}
              </div>
            </div>
            <div>
              <svg viewBox="0 0 220 80" preserveAspectRatio="none" style={{ height: 90, width: "100%", display: "block" }}>
                <defs>
                  <linearGradient id="db-spark-stroke" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#B388FF" />
                    <stop offset="100%" stopColor="#7EE7FF" />
                  </linearGradient>
                  <linearGradient id="db-spark-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(179,136,255,0.18)" />
                    <stop offset="100%" stopColor="rgba(179,136,255,0)" />
                  </linearGradient>
                </defs>
                <path fill="url(#db-spark-fill)" d={spark.area} />
                <path fill="none" stroke="url(#db-spark-stroke)" strokeWidth={1.5} d={spark.line} />
                <circle cx="220" cy={spark.lastY} r="3" fill="var(--cyan)" style={{ filter: "drop-shadow(0 0 4px var(--cyan))" }} />
              </svg>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--ink-4)", letterSpacing: "0.08em", marginTop: 6 }}>
                <span>30D AGO</span><span>TODAY</span>
              </div>
            </div>
          </div>

          {/* 4 stat mini-tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginTop: 6 }}>
            {([
              { k: "Workouts", sub: "/wk", v: weekCount, of: "5", delta: `${weekCount >= 5 ? "goal met" : `${5 - weekCount} more`}` },
              { k: "Books",    sub: "/yr", v: booksFinished, of: "12", delta: "on pace" },
              { k: "Words",    sub: "learned", v: totalWords.length, delta: `${dueWords.length} due` },
              { k: "Streak",   sub: "days",    v: streak, delta: streak > 0 ? "active" : "start today" },
            ] as const).map((s) => (
              <div key={s.k} style={{ padding: "16px 16px 14px", border: "1px solid var(--line)", borderRadius: 12, background: "rgba(255,255,255,0.018)", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 1, background: "linear-gradient(90deg, transparent, rgba(179,136,255,0.30), transparent)" }} />
                <div style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase" as const, color: "var(--ink-3)", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>{s.k}</span>
                  <span style={{ fontFamily: "var(--f-mono)" }}>{s.sub}</span>
                </div>
                <div className="tabular-nums" style={{ fontSize: 30, fontWeight: 300, letterSpacing: "-0.02em", lineHeight: 1 }}>
                  {s.v}
                  {"of" in s && s.of && <span style={{ color: "var(--ink-3)", fontSize: 16, marginLeft: 4 }}>/{s.of}</span>}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--cyan)", letterSpacing: "0.04em", marginTop: 4 }}>{s.delta}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── WORKOUT (6 cols) ──────────────────────────────────────────────── */}
        {allSessions.length > 0 && nextSession ? (
          <Link href={`/workouts/session/${nextSession.workout_sessions.id}`} style={{ gridColumn: "span 6", display: "block" }}>
            <div className="cc-card cc-card-hover" style={{ padding: 22, height: "100%", display: "flex", flexDirection: "column" }}>
              {/* Card head */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div style={CARD_HEAD_TITLE}><span style={DOT} />Next Workout</div>
                <span style={{ fontSize: 11, letterSpacing: "0.04em", color: "var(--ink-3)" }}>queued · today</span>
              </div>
              {/* Session name + meta */}
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontSize: 24, fontWeight: 400, letterSpacing: "-0.01em" }}>{nextSessionName}</div>
                <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                  {heroExercises.length} exercises
                </div>
              </div>
              {/* Exercise rows */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18, flex: 1 }}>
                {heroExercises.map((ex, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "26px 1fr auto", alignItems: "center", gap: 12, padding: "9px 12px", border: "1px solid var(--line)", borderRadius: 10, background: "rgba(255,255,255,0.015)", fontSize: 13 }}>
                    <span style={{ color: "var(--ink-4)", fontSize: 10.5, letterSpacing: "0.04em", fontFamily: "var(--f-mono)" }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span style={{ color: "var(--ink)" }}>{ex.name}</span>
                    <span style={{ color: "var(--ink-3)", fontSize: 11.5, letterSpacing: "0.02em", fontFamily: "var(--f-mono)" }}>
                      {ex.sets ?? 3} × {ex.reps ?? 10}
                    </span>
                  </div>
                ))}
              </div>
              {/* Start button */}
              <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "12px 18px", borderRadius: 10, background: "var(--grad)", color: "#0A0A14", fontSize: 13, fontWeight: 600, letterSpacing: "-0.005em", boxShadow: "0 0 24px rgba(179,136,255,0.30), inset 0 1px 0 rgba(255,255,255,0.40)", alignSelf: "flex-start" }}>
                <Play size={13} fill="#0A0A14" />
                Start session
              </div>
            </div>
          </Link>
        ) : (
          <Link href="/workouts" style={{ gridColumn: "span 6", display: "block" }}>
            <div className="cc-card cc-card-hover" style={{ padding: 22, minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 13, color: "var(--ink-3)" }}>Set up your workout program →</span>
            </div>
          </Link>
        )}

        {/* ── CHECKLIST (4 cols × 2 rows) ───────────────────────────────────── */}
        <Link href="/checklist" style={{ gridColumn: "span 4", gridRow: "span 2", display: "block" }}>
          <div className="cc-card cc-card-hover" style={{ padding: 22, height: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={CARD_HEAD_TITLE}><span style={DOT} />Today · Checklist</div>
              <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{checkDone} of {checkTotal}</span>
            </div>
            {/* Big % number */}
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
              <div className="tabular-nums" style={{ fontSize: 48, fontWeight: 200, letterSpacing: "-0.04em", lineHeight: 1, background: "var(--grad)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
                {checkPct}
                <span style={{ fontSize: 18, WebkitTextFillColor: "var(--ink-3)", color: "var(--ink-3)" }}>%</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.06em" }}>
                {checkTotal - checkDone} REMAIN
              </div>
            </div>
            {/* Progress bar */}
            <div style={{ height: 6, background: "rgba(255,255,255,0.04)", borderRadius: 99, marginBottom: 18, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${checkPct}%`, background: "var(--grad)", borderRadius: 99, boxShadow: "0 0 12px rgba(179,136,255,0.40)", transition: "width 0.25s ease" }} />
            </div>
            {/* Check rows */}
            <div>
              {checkItems.map((item, idx) => {
                const done = completedIds.has(item.id);
                return (
                  <div key={item.id} style={{ display: "grid", gridTemplateColumns: "22px 1fr auto", gap: 12, alignItems: "center", padding: "10px 0", borderBottom: idx < checkItems.length - 1 ? "1px solid var(--line)" : "none" }}>
                    <span style={{ width: 18, height: 18, border: `1.4px solid ${done ? "transparent" : "var(--line-hi)"}`, borderRadius: 6, display: "inline-flex", alignItems: "center", justifyContent: "center", background: done ? "var(--grad)" : "rgba(255,255,255,0.02)", boxShadow: done ? "0 0 10px rgba(179,136,255,0.50)" : "none", flexShrink: 0 }}>
                      {done && <Check size={11} color="#0A0A14" strokeWidth={3} />}
                    </span>
                    <span style={{ fontSize: 13.5, color: done ? "var(--ink-3)" : "var(--ink)", textDecoration: done ? "line-through" : "none", textDecorationColor: "var(--ink-4)", textDecorationThickness: 1 }}>
                      {item.emoji ? `${item.emoji} ` : ""}{item.title}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 5, letterSpacing: "0.02em", whiteSpace: "nowrap" }}>
                      🔥 {(item as { streak?: number }).streak ?? 0}d
                    </span>
                  </div>
                );
              })}
              {checkTotal === 0 && (
                <p style={{ fontSize: 13, color: "var(--ink-3)" }}>Set up your checklist →</p>
              )}
            </div>
          </div>
        </Link>

        {/* ── HEATMAP (3 cols) ──────────────────────────────────────────────── */}
        <div className="cc-card" style={{ gridColumn: "span 3", padding: 22 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <div style={CARD_HEAD_TITLE}><span style={DOT} />Last 7 Days</div>
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{weekDays.filter((d) => d.name).length} sessions</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginTop: 4 }}>
            {weekDays.map(({ label, dayNum, name, isToday }) => {
              const cs = heatStyle(name, isToday);
              const tagLabel = name
                ? name.slice(0, 4).toUpperCase()
                : isToday ? "TDY" : "REST";
              const tagColor = name ? "var(--ink-2)" : isToday ? "var(--cyan)" : "var(--ink-4)";
              return (
                <div key={dayNum} style={{
                  aspectRatio: "1/1", borderRadius: 8,
                  border: `1px ${isToday && !name ? "dashed" : "solid"} ${cs.borderColor ?? "var(--line)"}`,
                  display: "flex", alignItems: "flex-end", padding: 6,
                  position: "relative", overflow: "hidden",
                  ...cs,
                }}>
                  <span style={{ position: "absolute", top: 6, left: 7, fontSize: 9.5, letterSpacing: "0.04em", fontWeight: 500, color: tagColor }}>
                    {tagLabel}
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 14, marginTop: 14, fontSize: 10.5, color: "var(--ink-3)", letterSpacing: "0.04em" }}>
            {[
              { label: "Legs", bg: "linear-gradient(135deg, rgba(179,136,255,0.50), rgba(126,231,255,0.20))" },
              { label: "Pull", bg: "linear-gradient(135deg, rgba(179,136,255,0.32), rgba(126,231,255,0.10))" },
              { label: "Push", bg: "linear-gradient(135deg, rgba(179,136,255,0.20), rgba(179,136,255,0.05))" },
            ].map((l) => (
              <span key={l.label}>
                <i style={{ display: "inline-block", width: 8, height: 8, borderRadius: 3, marginRight: 6, verticalAlign: "middle", background: l.bg }} />
                {l.label}
              </span>
            ))}
          </div>
        </div>

        {/* ── MOOD (3 cols) ────────────────────────────────────────────────── */}
        <Link href="/mood" style={{ gridColumn: "span 3", display: "block" }}>
          <div className="cc-card cc-card-hover" style={{ padding: 22, height: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={CARD_HEAD_TITLE}><span style={DOT} />Mood · Today</div>
              <span style={{ fontSize: 11, color: "var(--ink-3)" }}>log</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, gap: 6 }}>
              {["😞", "😕", "😐", "🙂", "😄"].map((emoji, i) => (
                <div key={i} style={{ flex: 1, height: 48, border: "1px solid var(--line)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, background: "rgba(255,255,255,0.015)" }}>
                  {emoji}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--ink-4)", letterSpacing: "0.18em", textTransform: "uppercase", marginTop: 8 }}>
              <span>Heavy</span><span>Light</span>
            </div>
            <div style={{ display: "flex", gap: 5, marginTop: 14 }}>
              {[0.22, 0.50, 0.22, 0.80, 0.50, 0.80, 0.80].map((v, i) => (
                <div key={i} style={{ flex: 1, height: 7, borderRadius: 3, background: v > 0.6 ? "var(--grad)" : v > 0.3 ? "rgba(179,136,255,0.50)" : "rgba(179,136,255,0.22)", boxShadow: v > 0.6 ? "0 0 8px rgba(179,136,255,0.40)" : "none" }} />
              ))}
            </div>
          </div>
        </Link>

        {/* ── READING (3 cols) ─────────────────────────────────────────────── */}
        <Link href={currentBook ? `/library/read/${currentBook.id}` : "/library"} style={{ gridColumn: "span 3", display: "block" }}>
          <div className="cc-card cc-card-hover" style={{ padding: 22, height: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={CARD_HEAD_TITLE}><span style={DOT} />Reading · Current</div>
              <span style={{ fontSize: 11, color: "var(--ink-3)" }}>today</span>
            </div>
            {currentBook ? (
              <>
                <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginTop: 2 }}>
                  <div style={{ width: 48, height: 68, borderRadius: 4, background: "linear-gradient(160deg,#3A2E22 0%,#1A1714 100%)", border: "1px solid var(--line-hi)", flexShrink: 0, position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", left: 5, top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.10)" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 14.5, fontWeight: 500, lineHeight: 1.25 }}>{currentBook.title}</div>
                    <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 3 }}>{currentBook.author}</div>
                  </div>
                </div>
                <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 16 }}>
                  <svg width="74" height="74" viewBox="0 0 80 80" style={{ flexShrink: 0 }}>
                    <defs>
                      <linearGradient id="db-ring-grad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#B388FF" />
                        <stop offset="100%" stopColor="#7EE7FF" />
                      </linearGradient>
                    </defs>
                    <circle fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" cx="40" cy="40" r="32" />
                    <circle fill="none" stroke="url(#db-ring-grad)" strokeWidth="6" strokeLinecap="round"
                      cx="40" cy="40" r="32"
                      strokeDasharray={ringCircumference}
                      strokeDashoffset={ringOffset}
                      transform="rotate(-90 40 40)"
                      style={{ filter: "drop-shadow(0 0 6px rgba(179,136,255,0.4))" }}
                    />
                  </svg>
                  <div>
                    <div className="tabular-nums" style={{ fontSize: 24, fontWeight: 300, letterSpacing: "-0.02em", background: "var(--grad)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
                      {readPct}%
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                      p. {currentPage} / {currentBook.totalPages ?? "?"}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 12 }}>No book in progress →</div>
            )}
          </div>
        </Link>

        {/* ── WORDS (3 cols) ───────────────────────────────────────────────── */}
        <Link href="/wordbank" style={{ gridColumn: "span 3", display: "block" }}>
          <div className="cc-card cc-card-hover" style={{ padding: 22, height: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={CARD_HEAD_TITLE}><span style={DOT} />Word Bank · Due</div>
              <span style={{ fontSize: 11, color: "var(--ink-3)" }}>SRS</span>
            </div>
            <div className="tabular-nums" style={{ fontSize: 50, fontWeight: 200, letterSpacing: "-0.05em", lineHeight: 1, marginTop: 2, background: "var(--grad)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", filter: "drop-shadow(0 0 14px rgba(179,136,255,0.25))" }}>
              {dueWords.length}
              <span style={{ fontSize: 18, color: "var(--ink-3)", marginLeft: 6, letterSpacing: 0, WebkitTextFillColor: "var(--ink-3)" }}>due</span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 6, letterSpacing: "0.02em" }}>
              {totalWords.length} total in bank
            </div>
            <div style={{ marginTop: 16, display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 14px", border: "1px solid var(--line-hi)", borderRadius: 10, fontSize: 12, color: "var(--ink)", background: "rgba(255,255,255,0.02)" }}>
              <ArrowRight size={11} />
              Start review
            </div>
          </div>
        </Link>

        {/* ── NEWS (12 cols) ───────────────────────────────────────────────── */}
        <div className="cc-card" style={{ gridColumn: "span 12", padding: 22 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <div style={CARD_HEAD_TITLE}><span style={DOT} />News Brief · Top 5 Today</div>
            <Link href="/news" style={{ fontSize: 11, letterSpacing: "0.04em", color: "var(--ink-3)" }}>
              curated {format(now, "HH:mm")} · 5 sources
            </Link>
          </div>
          {stories.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginTop: 4 }}>
              {stories.map((s, i) => {
                const cat = s.category?.toLowerCase() ?? "other";
                const catStyle = CAT_STYLES[cat] ?? CAT_STYLES.other;
                return (
                  <div key={i} style={{ padding: "16px", border: "1px solid var(--line)", borderRadius: 12, background: "rgba(255,255,255,0.018)", position: "relative", overflow: "hidden" }}>
                    <span style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "var(--f-mono)", letterSpacing: "0.04em", marginBottom: 6, display: "block" }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span style={{ display: "inline-block", fontSize: 9.5, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 10, padding: "3px 9px", borderRadius: 99, border: "1px solid", ...catStyle }}>
                      {s.category}
                    </span>
                    <div style={{ fontSize: 13.5, lineHeight: 1.4, letterSpacing: "-0.005em", color: "var(--ink)", fontWeight: 450 }}>
                      {s.headline}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 0", gap: 12 }}>
              <Link href="/news" style={{ fontSize: 13, color: "var(--cyan)" }}>Generate today's brief →</Link>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
