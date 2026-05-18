/**
 * /workouts — V2 Ambient Futurism
 * Reproduced directly from design-system/mockups/workouts.html
 */

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { workoutSessions, workoutPrograms, workoutLogs, exercises as exercisesTable } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { format, startOfWeek, addDays } from "date-fns";
import SeedWorkoutsButton from "@/components/workouts/SeedWorkoutsButton";

const ROTATION = ["Push", "Pull", "Legs", "Core", "Push", "Pull", "Push-Up Skill"];

const SESSION_META: Record<string, { duration: string; muscles: string; exCount: number }> = {
  Push:            { duration: "50m", muscles: "Chest · Shoulders · Triceps", exCount: 6 },
  Pull:            { duration: "55m", muscles: "Back · Biceps · Rear delts",  exCount: 6 },
  Legs:            { duration: "65m", muscles: "Quads · Hams · Glutes · Calves", exCount: 6 },
  Core:            { duration: "25m", muscles: "Abs · Obliques · Lower back",  exCount: 4 },
  "Push-Up Skill": { duration: "35m", muscles: "Calisthenics · explosive · skill", exCount: 5 },
  Running:         { duration: "30m", muscles: "Zone 2 + intervals · 3×/wk",   exCount: 0 },
};

/** Weekly rotation — 7 days starting from Monday of current week */
function buildWeek(now: Date) {
  const mon = startOfWeek(now, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => {
    const d      = addDays(mon, i);
    const key    = format(d, "yyyy-MM-dd");
    const today  = format(now, "yyyy-MM-dd");
    const dow    = format(d, "EEE").toUpperCase();
    const dnum   = format(d, "d");
    // Assign sessions to days: Mon=Push, Tue=Pull, Wed=Push, Thu=Push-Up, Fri=Legs, Sat=Pull, Sun=Rest
    const schedule = ["Push", "Pull", "Push", "Push-Up Skill", "Legs", "Pull", "Rest"];
    const ses = schedule[i];
    return { key, dow, dnum, ses, isToday: key === today, isRest: ses === "Rest" };
  });
}

export default async function WorkoutsPage() {
  const session = await auth();
  const userId  = session!.user!.id!;
  const now     = new Date();
  const today   = format(now, "yyyy-MM-dd");

  const allSessions = await db
    .select()
    .from(workoutSessions)
    .innerJoin(workoutPrograms, eq(workoutSessions.programId, workoutPrograms.id))
    .where(eq(workoutPrograms.userId, userId))
    .orderBy(workoutSessions.sortOrder);

  const [lastLog] = await db
    .select()
    .from(workoutLogs)
    .where(eq(workoutLogs.userId, userId))
    .orderBy(desc(workoutLogs.startedAt))
    .limit(1);

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
        .limit(6)
    : [];

  const weekDays = buildWeek(now);
  const weekNum  = format(now, "w");

  // Shared card-head dot
  const DOT: React.CSSProperties = {
    width: 5, height: 5, borderRadius: "50%",
    background: "var(--violet)", boxShadow: "0 0 8px var(--violet)", flexShrink: 0,
  };
  const CARD_HEAD_TITLE: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 8,
    fontSize: 10.5, fontWeight: 500, letterSpacing: "0.18em",
    textTransform: "uppercase", color: "var(--ink-3)",
  };

  return (
    <div className="page-enter" style={{ padding: "28px 32px 64px", maxWidth: 1500, margin: "0 auto" }}>

      {/* ── Page title ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 26 }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 300, letterSpacing: "-0.025em", margin: 0, lineHeight: 1.05 }}>
            Workouts<span className="cc-grad-text">.</span>
          </h1>
          <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 6, letterSpacing: "0.01em" }}>
            Push · Pull · Legs split · Wk {weekNum} of {format(now, "yyyy")} · {allSessions.length} sessions loaded
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/workouts/history" className="cc-btn cc-btn-ghost">History</Link>
        </div>
      </div>

      {allSessions.length === 0 && (
        <div className="cc-card" style={{ padding: 48, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏋️</div>
          <p style={{ fontSize: 17, fontWeight: 600, color: "var(--ink)", marginBottom: 8 }}>Set up your PPL program</p>
          <p style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 20 }}>
            Load the Push / Pull / Legs rotation with progressive overload tracking.
          </p>
          <SeedWorkoutsButton />
        </div>
      )}

      {allSessions.length > 0 && (
        <>
          {/* ── PR Ticker ───────────────────────────────────────────────────── */}
          <div style={{ marginBottom: 18 }}>
            <div className="cc-sechead">
              Recent PRs
              <span style={{ marginLeft: "auto", fontSize: 11, letterSpacing: "0.04em", color: "var(--ink-4)", textTransform: "none", fontWeight: 400 }}>
                personal records this cycle
              </span>
            </div>
            <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6, scrollbarWidth: "thin" }}>
              {[
                { lift: "Bench Press",  sub: "Flat barbell · 1RM est.", v: "80", unit: " kg × 5", ago: "3 days ago · +2.5kg" },
                { lift: "Pull-Up",      sub: "Bodyweight strict",        v: "8",  unit: " reps",    ago: "5 days ago · +1 rep" },
                { lift: "Back Squat",   sub: "High bar · belt",          v: "100",unit: " kg × 5", ago: "8 days ago · +5kg"  },
                { lift: "5K Run",       sub: "Non-stop · target",        v: "3.8",unit: " km",      ago: "2 days ago · +400m" },
              ].map((pr) => (
                <div key={pr.lift} style={{ flexShrink: 0, padding: "14px 18px", border: "1px solid var(--line)", borderRadius: 12, background: "rgba(255,255,255,0.018)", minWidth: 240, position: "relative" }}>
                  <div style={{ fontSize: 9.5, letterSpacing: "0.20em", textTransform: "uppercase", color: "var(--warn)", fontWeight: 600 }}>
                    ↑ {pr.lift}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 6 }}>{pr.sub}</div>
                  <div className="tabular-nums" style={{ fontSize: 24, fontWeight: 300, letterSpacing: "-0.02em", marginTop: 2, fontFamily: "var(--f-mono)", color: "var(--ink)" }}>
                    {pr.v}<span style={{ color: "var(--ink-3)", fontSize: 14 }}>{pr.unit}</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--ink-4)", letterSpacing: "0.04em", marginTop: 4, fontFamily: "var(--f-mono)" }}>{pr.ago}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Main 2-column layout (8fr + 4fr) ────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "8fr 4fr", gap: 14 }}>

            {/* LEFT column */}
            <div>

              {/* ── Up Next hero card ──────────────────────────────────────── */}
              {nextSession && (
                <div className="cc-card" style={{
                  marginBottom: 14, padding: 0, overflow: "hidden",
                  background: `
                    radial-gradient(60% 80% at 0% 0%, rgba(179,136,255,0.16), transparent 60%),
                    radial-gradient(50% 80% at 100% 100%, rgba(126,231,255,0.10), transparent 60%),
                    var(--bg-card)`,
                }}>
                  <div style={{ padding: "30px 32px" }}>
                    {/* Lab + Start button row */}
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10.5, letterSpacing: "0.20em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 12 }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--cyan)", boxShadow: "0 0 8px var(--cyan)", flexShrink: 0 }} />
                          Up Next · today
                        </div>
                        {/* Session name — 64px gradient */}
                        <div style={{
                          fontSize: 64, fontWeight: 200, letterSpacing: "-0.04em", lineHeight: 0.9,
                          background: "var(--grad)",
                          WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
                          filter: "drop-shadow(0 0 24px rgba(179,136,255,0.20))",
                        }}>
                          {nextSessionName.toUpperCase()}
                        </div>
                        <div style={{ display: "flex", gap: 18, marginTop: 14, color: "var(--ink-2)", fontSize: 12.5, alignItems: "center", flexWrap: "wrap" }}>
                          <span>{SESSION_META[nextSessionName]?.duration ?? "~50m"} · {heroExercises.length || SESSION_META[nextSessionName]?.exCount} exercises</span>
                          <span style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--ink-4)" }} />
                          <span>{SESSION_META[nextSessionName]?.muscles}</span>
                        </div>
                      </div>
                      <Link href={`/workouts/session/${nextSession.workout_sessions.id}`}
                        style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "14px 22px", borderRadius: 10, background: "var(--grad)", color: "#0A0A14", fontSize: 14, fontWeight: 600, letterSpacing: "-0.005em", boxShadow: "0 0 24px rgba(179,136,255,0.30), inset 0 1px 0 rgba(255,255,255,0.40)", flexShrink: 0 }}>
                        ▶ Start session
                      </Link>
                    </div>

                    {/* Exercise list — 2-col grid */}
                    {heroExercises.length > 0 && (
                      <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                        {heroExercises.map((ex, i) => (
                          <div key={i} style={{ display: "grid", gridTemplateColumns: "24px 1fr auto", alignItems: "center", gap: 12, padding: "10px 14px", border: "1px solid var(--line)", borderRadius: 10, background: "rgba(255,255,255,0.018)", fontSize: 13 }}>
                            <span style={{ fontFamily: "var(--f-mono)", color: "var(--ink-4)", fontSize: 10.5, letterSpacing: "0.06em" }}>
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <span style={{ color: "var(--ink)" }}>{ex.name}</span>
                            <span style={{ fontFamily: "var(--f-mono)", color: "var(--ink-3)", fontSize: 11.5, letterSpacing: "0.02em" }}>
                              {ex.sets ?? 3}×{ex.reps ?? 10}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Footer stats */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--line)" }}>
                      <div style={{ display: "flex", gap: 24, fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.02em" }}>
                        <span><strong style={{ color: "var(--ink)", fontWeight: 500, fontFamily: "var(--f-mono)", marginRight: 4 }}>PPL</strong>split · cycle</span>
                        <span><strong style={{ color: "var(--ink)", fontWeight: 500, fontFamily: "var(--f-mono)", marginRight: 4 }}>+4%</strong>volume vs avg</span>
                        <span><strong style={{ color: "var(--ink)", fontWeight: 500, fontFamily: "var(--f-mono)", marginRight: 4 }}>RPE 7</strong>target</span>
                      </div>
                      <span style={{ fontSize: 11, color: "var(--ink-4)", letterSpacing: "0.04em" }}>Edit template →</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── All Sessions — 3-column grid ─────────────────────────── */}
              <div className="cc-card" style={{ padding: 22 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div style={CARD_HEAD_TITLE}><span style={DOT} />All Sessions</div>
                  <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{allSessions.length} templates · tap to start</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                  {allSessions.map(({ workout_sessions: ws }) => {
                    const meta = SESSION_META[ws.name];
                    const isNext = ws.name === nextSessionName;
                    return (
                      <Link key={ws.id} href={`/workouts/session/${ws.id}`} style={{ display: "block" }}>
                        <div style={{ padding: 16, border: `1px solid ${isNext ? "rgba(179,136,255,0.30)" : "var(--line)"}`, borderRadius: 12, background: isNext ? "radial-gradient(70% 80% at 0% 0%, rgba(179,136,255,0.12), transparent 60%), rgba(255,255,255,0.025)" : "rgba(255,255,255,0.018)", cursor: "pointer", position: "relative", transition: "all 0.12s" }}>
                          {isNext && (
                            <span style={{ position: "absolute", top: 8, right: 8, fontSize: 8.5, fontFamily: "var(--f-mono)", color: "var(--cyan)", letterSpacing: "0.12em" }}>NEXT</span>
                          )}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                            <div style={{ fontSize: 16, fontWeight: 500, letterSpacing: "-0.005em" }}>{ws.name}</div>
                            <div style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: "0.04em", fontFamily: "var(--f-mono)" }}>
                              {meta?.exCount ?? "–"} · {meta?.duration ?? "–"}
                            </div>
                          </div>
                          <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 4, letterSpacing: "0.01em" }}>
                            {meta?.muscles ?? ""}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                  {/* Running shortcut */}
                  <Link href="/workouts/history" style={{ display: "block" }}>
                    <div style={{ padding: 16, border: "1px solid rgba(126,231,255,0.20)", borderRadius: 12, background: "radial-gradient(60% 80% at 100% 0%, rgba(126,231,255,0.10), transparent 60%), rgba(255,255,255,0.018)", cursor: "pointer" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <div style={{ fontSize: 16, fontWeight: 500, letterSpacing: "-0.005em" }}>Running</div>
                        <div style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: "0.04em", fontFamily: "var(--f-mono)" }}>∞ · 30m</div>
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 4 }}>Zone 2 + intervals · 3×/wk</div>
                    </div>
                  </Link>
                </div>
              </div>
            </div>

            {/* RIGHT column */}
            <div>

              {/* ── Weekly rotation ──────────────────────────────────────── */}
              <div className="cc-card" style={{ padding: 22, marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div style={CARD_HEAD_TITLE}><span style={DOT} />Wk {weekNum} · {format(startOfWeek(now, { weekStartsOn: 1 }), "MMM d")}–{format(addDays(startOfWeek(now, { weekStartsOn: 1 }), 6), "d")}</div>
                  <span style={{ fontSize: 11, color: "var(--ink-3)" }}>5 of 7 planned</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
                  {weekDays.map(({ dow, dnum, ses, isToday, isRest }) => (
                    <div key={dow} style={{
                      padding: "14px 8px",
                      border: `1px solid ${isToday ? "rgba(179,136,255,0.40)" : "var(--line)"}`,
                      borderRadius: 12,
                      background: isToday
                        ? "radial-gradient(70% 80% at 0% 0%, rgba(179,136,255,0.18), transparent 60%), rgba(255,255,255,0.025)"
                        : "rgba(255,255,255,0.018)",
                      textAlign: "left", position: "relative", overflow: "hidden",
                      boxShadow: isToday ? "0 0 24px rgba(179,136,255,0.18), inset 0 0 12px rgba(179,136,255,0.06)" : "none",
                    }}>
                      {isToday && (
                        <span style={{ position: "absolute", top: 6, right: 6, fontSize: 7.5, fontFamily: "var(--f-mono)", color: "var(--cyan)", letterSpacing: "0.10em" }}>TODAY</span>
                      )}
                      <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>{dow}</div>
                      <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.02em", marginTop: 2, color: "var(--ink)" }}>{dnum}</div>
                      <div style={{ marginTop: 10, height: 14, color: isToday ? "var(--violet)" : isRest ? "var(--ink-4)" : "var(--ink-3)", fontSize: 12, filter: isToday ? "drop-shadow(0 0 6px rgba(179,136,255,0.5))" : "none" }}>
                        {isRest ? "–" : "🏋"}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.02em", marginTop: 6, color: isToday ? "var(--ink)" : isRest ? "var(--ink-3)" : "var(--ink-2)" }}>
                        {ses}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--ink-3)", letterSpacing: "0.04em", paddingTop: 10, borderTop: "1px solid var(--line)", marginTop: 4 }}>
                  <span><span style={{ color: "var(--pos)" }}>✓</span> Running interleaved · Tue · Thu · Sat</span>
                  <span style={{ color: "var(--ink-4)" }}>→ Edit week</span>
                </div>
              </div>

              {/* ── Running progress ─────────────────────────────────────── */}
              <div className="cc-card" style={{ padding: 22 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div style={{ ...CARD_HEAD_TITLE, color: "var(--cyan)" }}><span style={{ ...DOT, background: "var(--cyan)", boxShadow: "0 0 8px var(--cyan)" }} />Running · 5K Goal</div>
                  <span style={{ fontSize: 11, color: "var(--ink-3)" }}>non-stop target</span>
                </div>
                {/* Progress block */}
                <div style={{ padding: 18, border: "1px solid rgba(126,231,255,0.20)", borderRadius: 12, background: "radial-gradient(60% 80% at 100% 0%, rgba(126,231,255,0.10), transparent 60%), rgba(255,255,255,0.018)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--cyan)", fontWeight: 600 }}>Furthest non-stop</span>
                    <span style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: "0.04em" }}>↑ +400m last wk</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 8 }}>
                    <div className="tabular-nums" style={{ fontSize: 30, fontWeight: 200, letterSpacing: "-0.03em", fontFamily: "var(--f-mono)" }}>
                      3.8<span style={{ color: "var(--ink-3)", fontSize: 16 }}> / 5.0 km</span>
                    </div>
                    <span style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: "0.04em" }}>76% of goal</span>
                  </div>
                  <div style={{ marginTop: 12, height: 6, background: "rgba(255,255,255,0.04)", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: "76%", background: "var(--grad)", borderRadius: 99, boxShadow: "0 0 12px rgba(126,231,255,0.40)" }} />
                  </div>
                </div>
                {/* Stats row */}
                <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", borderTop: "1px solid var(--line)", paddingTop: 14 }}>
                  {[
                    { label: "This wk", value: "12.4 km" },
                    { label: "Avg pace", value: "5:48 /km" },
                    { label: "Sessions", value: "3 / wk" },
                  ].map((s, i) => (
                    <div key={s.label} style={{ padding: i === 0 ? "0 12px 0 0" : i === 2 ? "0 0 0 12px" : "0 12px", borderRight: i < 2 ? "1px solid var(--line)" : "none" }}>
                      <div style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)" }}>{s.label}</div>
                      <div className="tabular-nums" style={{ fontSize: 18, marginTop: 4 }}>{s.value}</div>
                    </div>
                  ))}
                </div>
                <Link href="/workouts/history" style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "center", padding: "10px", borderRadius: 10, background: "rgba(126,231,255,0.10)", border: "1px solid rgba(126,231,255,0.30)", color: "var(--cyan)", fontSize: 13, fontWeight: 500 }}>
                  + Log run
                </Link>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
