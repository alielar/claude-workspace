"use client";

/**
 * /train — the Train tab.
 *   hero: the next workout (alternates W1 / W2), one big Start
 *   the other workout, one tap away
 *   weekly bests for Workout 1 (the game), number to beat
 *   recent sessions
 * Everything renders from the phone's copy first; works offline.
 */

import Link from "next/link";
import { useOverview, useWorkouts, readActiveSession } from "@/lib/train/useTrain";
import { fmtClock, SESSIONS_PER_WEEK, type TrainSession, type TrainWorkout, type WorkoutKey } from "@/lib/train/types";
import { useClientValue } from "@/lib/useClientValue";

function describe(w: TrainWorkout): string {
  if (w.format === "amrap") return `AMRAP ${w.amrapMinutes} min · ${w.exercises.length} moves per round`;
  const sets = w.exercises.reduce((s, e) => s + e.sets, 0);
  return `${w.exercises.length} exercises · ${sets} sets · rest ${w.restSeconds}s`;
}

function SessionLine({ s, workouts }: { s: TrainSession; workouts: TrainWorkout[] }) {
  const w = workouts.find((x) => x.key === s.workoutKey);
  const setsDone = "sets" in s.log && s.log.sets ? Object.values(s.log.sets).flat().filter(Boolean).length : null;
  const d = new Date(s.date + "T12:00:00");
  const when = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(d);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, minHeight: 52, alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 16, fontWeight: 500 }}>{w?.name ?? s.workoutKey.toUpperCase()}</span>
        <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)" }}>{when}{s.finishedAt === null ? " · not finished" : ""}</span>
      </span>
      <span style={{ fontSize: 15, color: "var(--ink-2)", textAlign: "right" }}>
        {s.workoutKey === "w1" ? `${s.rounds ?? 0} rounds` : setsDone !== null ? `${setsDone} sets` : "—"}
        {s.durationSeconds ? <span style={{ color: "var(--ink-4)" }}> · {fmtClock(s.durationSeconds)}</span> : null}
      </span>
    </div>
  );
}

export default function TrainPage() {
  const { workouts, loading: wLoading } = useWorkouts();
  const { data: ov, loading: oLoading } = useOverview();
  const active = useClientValue(readActiveSession, null);

  const nextKey: WorkoutKey = ov?.next ?? "w1";
  const next = workouts.find((w) => w.key === nextKey);
  const other = workouts.find((w) => w.key !== nextKey);
  const kg = ov?.kettlebellKg ?? 12;
  const loading = wLoading && oLoading && !ov;

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div className="cc-pagetitle" style={{ marginBottom: 0 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600 }}>Train</h1>
          <div className="sub">
            {ov ? `${ov.thisWeekSessions} of ${SESSIONS_PER_WEEK} this week` : `${SESSIONS_PER_WEEK} a week`} · any days, alternating
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {ov && ov.weekStreak > 0 && (
            <span className="cc-pill cc-pill-warn" style={{ fontSize: 15, padding: "6px 10px", whiteSpace: "nowrap" }} title="weeks in a row with 4 sessions">
              🔥 {ov.weekStreak} wk
            </span>
          )}
          <Link href="/settings" className="cc-pill" style={{ textDecoration: "none", fontSize: 15, padding: "6px 10px", whiteSpace: "nowrap" }}>
            🏋️ {kg} kg
          </Link>
        </div>
      </div>

      {/* Week progress: 4 dots */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {Array.from({ length: SESSIONS_PER_WEEK }).map((_, i) => (
          <span key={i} style={{ flex: 1, height: 6, borderRadius: 99, background: ov && i < ov.thisWeekSessions ? "var(--violet)" : "var(--fill-3)" }} />
        ))}
      </div>

      {/* Unfinished session */}
      {active && (
        <Link href={`/train/${active.workoutKey}`} className="cc-card" style={{ display: "block", textDecoration: "none", color: "inherit", borderColor: "var(--warn)" }}>
          <div className="cc-card-body" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 16 }}>You have a workout in progress</span>
            <span className="cc-btn cc-btn-primary" style={{ minHeight: 40 }}>Resume</span>
          </div>
        </Link>
      )}

      {/* Hero: next workout */}
      <section className="cc-card" style={{ overflow: "hidden" }}>
        <div className="cc-card-head">
          <span className="title">Up next</span>
          <span className="tail">{ov?.toBeat && nextKey === "w1" ? `to beat: ${ov.toBeat.rounds}` : nextKey === "w1" ? "set the bar" : "checklist"}</span>
        </div>
        <div className="cc-card-body" style={{ display: "grid", gap: 14 }}>
          {loading || !next ? (
            <div className="cc-skeleton" style={{ height: 64 }} />
          ) : (
            <>
              <div>
                <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em" }}>{next.name}</div>
                <div style={{ fontSize: 15, color: "var(--ink-3)", marginTop: 2 }}>{describe(next)}</div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {next.exercises.map((e) => (
                  <span key={e.id} className="cc-pill" style={{ fontSize: 14 }}>
                    {e.name} · {e.reps}{e.perSide ? "/side" : ""}{next.format === "sets" ? ` × ${e.sets}` : ""}
                  </span>
                ))}
              </div>
              <Link href={`/train/${next.key}`} className="cc-btn cc-btn-primary" style={{ minHeight: 60, fontSize: 19, borderRadius: 16, textDecoration: "none" }}>
                ▶ Start {next.name}
              </Link>
            </>
          )}
        </div>
      </section>

      {/* The other one */}
      {other && (
        <Link href={`/train/${other.key}`} className="cc-card" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
          <div className="cc-card-body" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center" }}>
            <span>
              <span style={{ display: "block", fontSize: 17, fontWeight: 500 }}>{other.name}</span>
              <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)" }}>{describe(other)}</span>
            </span>
            <span style={{ color: "var(--ink-3)", fontSize: 15 }}>Start instead ›</span>
          </div>
        </Link>
      )}

      {/* Weekly bests */}
      <section className="cc-card">
        <div className="cc-card-head">
          <span className="title">Workout 1 · weekly bests</span>
          <span className="tail">{ov?.thisWeekBest !== null && ov?.thisWeekBest !== undefined ? `this week: ${ov.thisWeekBest}` : ""}</span>
        </div>
        <div style={{ padding: "4px 14px" }}>
          {!ov && <div className="cc-skeleton" style={{ height: 44, margin: "10px 0" }} />}
          {ov && ov.weeklyBests.length === 0 && (
            <div style={{ padding: "14px 0", fontSize: 15, color: "var(--ink-3)" }}>No rounds logged yet. The first session sets the number to beat.</div>
          )}
          {ov?.weeklyBests.slice(0, 8).map((b, i, arr) => {
            const prev = arr[i + 1];
            const delta = prev ? b.best - prev.best : 0;
            const maxBest = Math.max(...arr.map((x) => x.best), 1);
            return (
              <div key={b.week} style={{ display: "grid", gridTemplateColumns: "90px 1fr auto", gap: 12, alignItems: "center", minHeight: 44, borderBottom: i < arr.length - 1 ? "1px solid var(--line)" : "none" }}>
                <span style={{ fontSize: 15, color: i === 0 ? "var(--ink)" : "var(--ink-3)" }}>{b.label}</span>
                <span className="cc-progress-track" style={{ height: 6 }}>
                  <span className="cc-progress-fill" style={{ display: "block", width: `${(b.best / maxBest) * 100}%` }} />
                </span>
                <span className="tabular-nums" style={{ fontSize: 15, fontWeight: 600 }}>
                  {b.best}
                  {prev && delta !== 0 && (
                    <span style={{ fontSize: 13, marginLeft: 6, color: delta > 0 ? "var(--pos)" : "var(--neg)" }}>{delta > 0 ? `+${delta}` : delta}</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Recent */}
      <section className="cc-card">
        <div className="cc-card-head"><span className="title">Recent</span></div>
        <div style={{ padding: "0 14px" }}>
          {ov && ov.sessions.length === 0 && <div style={{ padding: "14px 0", fontSize: 15, color: "var(--ink-3)" }}>Nothing yet.</div>}
          {ov?.sessions.slice(0, 6).map((s) => <SessionLine key={s.clientId} s={s} workouts={workouts} />)}
        </div>
      </section>

      <Link href="/archive" style={{ fontSize: 14, color: "var(--ink-4)", textDecoration: "none" }}>Old gym workouts are in the archive →</Link>
    </div>
  );
}
