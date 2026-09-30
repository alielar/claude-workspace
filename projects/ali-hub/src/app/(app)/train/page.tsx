"use client";

/**
 * /train · the Train tab · two halves, Body and Mind (Ali 2026-09-28), a switch under the title,
 * remembered on the phone (`cc-train-half`); `?mind=1` (Today's "Mental training" row) opens Mind.
 * BODY = three subsections (Ali 2026-09-29), a chip row, remembered in `cc-train-body`:
 *   Runs       · every Watch run (km · time · pace), this week's totals, 8 weeks of km as bars,
 *                walks and rides under "Other activity"; a row opens /train/run/<id>
 *   Strength   · Speediance sessions and any Watch strength workout (a Saturday one with a
 *                Kettlebell 30 session that day is labelled so)
 *   Kettlebell · everything about Kettlebell 30: week dots, rest day, the hero with Start,
 *                weekly bests (rounds), recent sessions
 * The sub line under the title sums the week across the three.
 * MIND: Mental Training · src/components/mind/MindPane.tsx.
 * Everything renders from the phone's copy first; works offline (Mind needs a connection to grade).
 */

import Link from "next/link";
import { useOverview, useWorkouts, readActiveSession } from "@/lib/train/useTrain";
import { fmtClock, repsLabel, workStats, weeklyPaces, paceToBeat, SESSIONS_PER_WEEK, DAY_CODES, DAY_LABELS, fmtScheduleDate, PRIMARY_KEY, type DayCode, type TrainSession, type TrainWorkout, type WorkoutKey } from "@/lib/train/types";
import { checklistToday } from "@/lib/checklist/day";
import { useClientValue, useNow } from "@/lib/useClientValue";
import { useEffect, useState } from "react";
import { useHealthSummary } from "@/lib/health/useHealth";
import { MindPane } from "@/components/mind/MindPane";
import { fmtDay, fmtDur, fmtKm, fmtPace, isoWeekOf, kindLabel, paceOf, pipeNote, weekTotals, workoutKind, type WorkoutRow } from "@/lib/health/client";
import { Bars } from "@/components/health/charts";

function describe(w: TrainWorkout): string {
  if (w.format === "amrap") return `AMRAP ${w.amrapMinutes} min · ${w.exercises.length} moves per round`;
  const sets = w.exercises.reduce((s, e) => s + e.sets, 0);
  return `${w.exercises.length} exercises · ${sets} sets · rest ${w.restSeconds}s`;
}

function SessionLine({ s, workouts }: { s: TrainSession; workouts: TrainWorkout[] }) {
  const w = workouts.find((x) => x.key === s.workoutKey);
  const setsDone = "sets" in s.log && s.log.sets ? Object.values(s.log.sets).flat().filter(Boolean).length : null;
  const stats = workStats(s);
  const d = new Date(s.date + "T12:00:00");
  const when = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(d);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, minHeight: 52, alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 16, fontWeight: 500 }}>{w?.name ?? s.workoutKey.toUpperCase()}</span>
        <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)" }}>{when}{s.finishedAt === null ? " · not finished" : ""}</span>
      </span>
      <span style={{ fontSize: 15, color: "var(--ink-2)", textAlign: "right" }}>
        {s.workoutKey !== "w2" ? `${s.rounds ?? 0} rounds` : setsDone !== null ? `${setsDone} sets` : "…"}
        {stats ? <span style={{ color: "var(--ink-4)" }}> · {fmtClock(stats.avgRoundMs / 1000)} / round</span>
          : s.durationSeconds ? <span style={{ color: "var(--ink-4)" }}> · {fmtClock(s.durationSeconds)}</span> : null}
      </span>
    </div>
  );
}

/** One Watch workout line · a run shows km · time · pace, a strength session time · kcal · bpm. */
function WatchLine({ w, today, note }: { w: WorkoutRow; today: string; note?: string }) {
  const kind = workoutKind(w.type);
  const right = kind === "run"
    ? `${fmtKm(w.distanceKm)} · ${fmtDur(w.durationSec)} · ${fmtPace(paceOf(w))}`
    : `${fmtDur(w.durationSec)}${w.activeKcal !== null ? ` · ${w.activeKcal} kcal` : ""}${w.hrAvg !== null ? ` · ${w.hrAvg} bpm` : ""}`;
  const source = note ?? (w.source && /speediance/i.test(w.source) ? "Speediance" : null);
  return (
    <Link href={`/train/run/${encodeURIComponent(w.hkId)}`} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, minHeight: 52, alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--line)", textDecoration: "none", color: "inherit" }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 16, fontWeight: 500 }}>{kindLabel(w.type)}</span>
        <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)" }}>{fmtDay(w.date, today)}{source ? ` · ${source}` : ""}</span>
      </span>
      <span className="tabular-nums" style={{ fontSize: 15, color: "var(--ink-2)", textAlign: "right", whiteSpace: "nowrap" }}>{right} <span style={{ color: "var(--ink-4)" }}>›</span></span>
    </Link>
  );
}

function WatchCard({ title, tail, rows, today, empty, warn, limit = 8, noteFor, children }: { title: string; tail?: string; rows: WorkoutRow[]; today: string; empty: string; warn?: boolean; limit?: number; noteFor?: (w: WorkoutRow) => string | undefined; children?: React.ReactNode }) {
  return (
    <section className="cc-card">
      <div className="cc-card-head"><span className="title">{title}</span>{tail && <span className="tail">{tail}</span>}</div>
      {children && <div className="cc-card-body" style={{ paddingBottom: 6 }}>{children}</div>}
      <div style={{ padding: "0 14px" }}>
        {rows.length === 0 && <div style={{ padding: "14px 0", fontSize: 15, color: warn ? "var(--warn)" : "var(--ink-3)", lineHeight: 1.45 }}>{empty}</div>}
        {rows.slice(0, limit).map((w) => <WatchLine key={w.hkId} w={w} today={today} note={noteFor?.(w)} />)}
      </div>
    </section>
  );
}

/** km per ISO week over the last 8 weeks, oldest first · tap a bar to read it. */
function weekKm(runs: WorkoutRow[], today: string): { labels: string[]; km: number[]; count: number[] } {
  const weeks: string[] = [];
  const d = new Date(today + "T12:00:00");
  for (let i = 7; i >= 0; i--) { const x = new Date(d); x.setDate(d.getDate() - i * 7); weeks.push(isoWeekOf(x.toISOString().slice(0, 10))); }
  const km = weeks.map((w) => Math.round(runs.filter((r) => isoWeekOf(r.date) === w).reduce((s, r) => s + (r.distanceKm ?? 0), 0) * 10) / 10);
  const count = weeks.map((w) => runs.filter((r) => isoWeekOf(r.date) === w).length);
  return { labels: weeks.map((w, i) => (i === 7 ? "now" : `W${w.slice(-2).replace(/^0/, "")}`)), km, count };
}

type Half = "body" | "mind";
type Part = "runs" | "strength" | "kettlebell";
const PARTS: { key: Part; label: string }[] = [{ key: "runs", label: "Runs" }, { key: "strength", label: "Strength" }, { key: "kettlebell", label: "Kettlebell" }];

export default function TrainPage() {
  const [half, setHalfState] = useState<Half>("body");
  const [part, setPartState] = useState<Part>("kettlebell");
  useEffect(() => {
    let h: Half | null = null, p: Part | null = null;
    try {
      if (new URLSearchParams(window.location.search).get("mind") === "1") h = "mind";
      else if (localStorage.getItem("cc-train-half") === "mind") h = "mind";
      const saved = localStorage.getItem("cc-train-body");
      if (saved === "runs" || saved === "strength" || saved === "kettlebell") p = saved;
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the URL and localStorage after mount
    if (h) setHalfState(h);
    if (p) setPartState(p);
  }, []);
  const setHalf = (h: Half) => { setHalfState(h); try { localStorage.setItem("cc-train-half", h); } catch { /* ignore */ } };
  const setPart = (p: Part) => { setPartState(p); try { localStorage.setItem("cc-train-body", p); } catch { /* ignore */ } };
  const { data: health } = useHealthSummary();
  const watch = health?.workouts ?? [];
  const runs = watch.filter((w) => workoutKind(w.type) === "run");
  const strength = watch.filter((w) => workoutKind(w.type) === "strength");
  const otherWatch = watch.filter((w) => workoutKind(w.type) === "other");
  // Why the Watch lists are empty, from what HAE really posted (null once workouts flow).
  const nowMs = useNow();
  const watchNote = health && watch.length === 0 && nowMs ? pipeNote(health.pipe, "workouts", nowMs) : null;
  const { workouts, loading: wLoading } = useWorkouts();
  const { data: ov, loading: oLoading } = useOverview();
  const active = useClientValue(readActiveSession, null);

  const nextKey: WorkoutKey = ov?.next ?? PRIMARY_KEY;
  const next = workouts.find((w) => w.key === nextKey);
  const others = workouts.filter((w) => w.key !== nextKey);
  const loading = wLoading && oLoading && !ov;
  const target = ov?.target ?? SESSIONS_PER_WEEK;
  const today = checklistToday();
  const sched = ov?.schedule ?? null;
  const planned = DAY_CODES.filter((d) => workouts.some((w) => w.assignedDays?.includes(d))).map((d) => DAY_LABELS[d as DayCode]).join(" · ");
  const restToday = sched !== null && sched.todayKey === null && !ov?.sessions.some((s) => s.date === today && s.finishedAt !== null);
  // Work-only pace (rest excluded) · the comparison that stays honest now that rounds have rest between them.
  const paces = ov ? weeklyPaces(ov.sessions, today) : [];
  const pace = paceToBeat(paces, today);
  const wk = weekTotals(runs, today);
  const thisWeek = isoWeekOf(today);
  const strengthWk = strength.filter((w) => isoWeekOf(w.date) === thisWeek).length;
  const kbDays = new Set((ov?.sessions ?? []).filter((s) => s.finishedAt !== null).map((s) => s.date));
  const runWeeks = weekKm(runs, today);
  const bodySub = ov
    ? `This week · ${wk.runs} run${wk.runs === 1 ? "" : "s"}${wk.runs ? ` ${wk.km} km` : ""} · ${strengthWk} strength · ${ov.thisWeekSessions} of ${target} kettlebell`
    : "This week · —";

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div className="cc-pagetitle" style={{ marginBottom: 0 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600 }}>Train</h1>
          <div className="sub">{half === "mind" ? "Mental training · a callback, then a new topic · 4 a week" : bodySub}</div>
        </div>
      </div>

      <div role="tablist" aria-label="Train" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, padding: 3, borderRadius: 12, background: "var(--fill-1)" }}>
        {(["body", "mind"] as Half[]).map((h) => (
          <button key={h} role="tab" aria-selected={half === h} onClick={() => setHalf(h)}
            style={{ minHeight: 40, borderRadius: 9, border: "none", cursor: "pointer", fontSize: 15, fontWeight: 600, background: half === h ? "var(--bg-card)" : "transparent", color: half === h ? "var(--ink)" : "var(--ink-3)", boxShadow: half === h ? "0 1px 2px rgba(0,0,0,.18)" : "none" }}>
            {h === "body" ? "Body" : "Mind"}
          </button>
        ))}
      </div>

      {half === "mind" && <MindPane />}

      {half === "body" && <>
      {/* The three parts of Body */}
      <div role="tablist" aria-label="Body" style={{ display: "flex", gap: 8 }}>
        {PARTS.map((p) => (
          <button key={p.key} role="tab" aria-selected={part === p.key} onClick={() => setPart(p.key)} className="cc-pill"
            style={{ minHeight: 36, padding: "0 14px", fontSize: 15, fontWeight: 500, cursor: "pointer", border: "1px solid var(--line)", background: part === p.key ? "var(--accent-soft)" : "transparent", color: part === p.key ? "var(--ink)" : "var(--ink-3)" }}>
            {p.label}
          </button>
        ))}
      </div>

      {part === "runs" && <>
        <WatchCard title="Runs" tail={wk.runs ? `this week ${wk.km} km · ${wk.runs} run${wk.runs === 1 ? "" : "s"} · ${fmtDur(wk.sec)}` : "nothing this week yet"} rows={runs} today={today} empty={watchNote ?? "No runs from the Watch yet. Start an Outdoor Run on the Watch and it lands here after the run."} warn={!!watchNote}>
          {runs.length > 0 && <Bars values={runWeeks.km} labels={runWeeks.labels} height={64} fmt={(v, i) => `${v} km · ${runWeeks.count[i]} run${runWeeks.count[i] === 1 ? "" : "s"}`} />}
        </WatchCard>
        {otherWatch.length > 0 && <WatchCard title="Other activity" rows={otherWatch} today={today} empty="" />}
      </>}

      {part === "strength" && (
        <WatchCard title="Strength" tail={strengthWk ? `this week ${strengthWk} session${strengthWk === 1 ? "" : "s"}` : "Speediance and the Watch"} rows={strength} today={today}
          noteFor={(w) => (kbDays.has(w.date) ? "Kettlebell 30" : undefined)}
          empty={watchNote ?? "No strength sessions from the Watch yet. Log a Speediance session as Traditional Strength Training on the Watch."} warn={!!watchNote} />
      )}

      {part === "kettlebell" && <>
      {/* Week progress: 4 dots · rest day · streak */}
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {Array.from({ length: target }).map((_, i) => (
            <span key={i} style={{ flex: 1, height: 6, borderRadius: 99, background: ov && i < ov.thisWeekSessions ? "var(--violet)" : "var(--fill-3)" }} />
          ))}
          {ov && ov.weekStreak > 0 && (
            <span className="cc-pill cc-pill-warn" style={{ fontSize: 13, padding: "3px 8px", whiteSpace: "nowrap" }} title="weeks in a row with every session done">{ov.weekStreak} wk</span>
          )}
        </div>
        <div style={{ fontSize: 14, color: "var(--ink-3)", padding: "0 2px" }}>
          {ov ? `${ov.thisWeekSessions} of ${target} this week · ${sched ? planned : "any days"}` : `${target} a week`}
          {restToday && sched?.next ? ` · rest day, next ${fmtScheduleDate(sched.next.date, today)}` : ""}
        </div>
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
          <span className="title">{sched?.next ? `Up next · ${fmtScheduleDate(sched.next.date, today)}` : "Up next"}</span>
          <span className="tail">{ov?.toBeat ? `to beat: ${ov.toBeat.rounds} rounds${pace ? ` · ${fmtClock(pace.avgRoundMs / 1000)} / round` : ""}` : "set the bar"}</span>
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
                    {e.name} · {repsLabel(e)}{next.format === "sets" ? ` × ${e.sets}` : ""}
                  </span>
                ))}
              </div>
              <Link href={`/train/${next.key}`} className="cc-btn cc-btn-primary" style={{ minHeight: 60, fontSize: 19, borderRadius: 14, textDecoration: "none" }}>
                ▶ Start {next.name}
              </Link>
            </>
          )}
        </div>
      </section>

      {/* The other options */}
      {others.map((other) => (
        <Link key={other.key} href={`/train/${other.key}`} className="cc-card" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
          <div className="cc-card-body" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center" }}>
            <span>
              <span style={{ display: "block", fontSize: 17, fontWeight: 500 }}>{other.name}</span>
              <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)" }}>{describe(other)}</span>
            </span>
            <span style={{ color: "var(--ink-3)", fontSize: 15 }}>Start instead ›</span>
          </div>
        </Link>
      ))}

      {/* Weekly bests */}
      <section className="cc-card">
        <div className="cc-card-head">
          <span className="title">Weekly bests</span>
          <span className="tail">{ov?.thisWeekBest !== null && ov?.thisWeekBest !== undefined ? `this week: ${ov.thisWeekBest}` : ""}</span>
        </div>
        <div style={{ padding: "4px 14px" }}>
          {!ov && <div className="cc-skeleton" style={{ height: 44, margin: "10px 0" }} />}
          {ov && ov.weeklyBests.length === 0 && (
            <div style={{ padding: "14px 0", fontSize: 15, color: "var(--ink-3)" }}>No rounds yet.</div>
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
      </>}
      </>}

    </div>
  );
}
