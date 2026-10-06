"use client";

/**
 * /train · the Train tab · REDESIGN 2026-10-07 (the prototype Ali approved): SUMMARY FIRST.
 * The "This week" hero = the seven-day strip, today's session with its button, readiness in plain
 * words and the coach's Head skill of the week, in ONE card. Then four chips, remembered in
 * `cc-train-body`: Runs · Strength · Functional · Mind (`?mind=1` from Today's row opens Mind; the
 * Body · Mind switch is gone). Laptop (`.cc-wide` + `.cc-cols`): the hero and the chosen part on the
 * left, Objectives · Coach · Notes · Last week on the right; the phone stacks the same order.
 * THE PARTS (Ali 2026-09-29):
 *   Runs       · every Watch run (km · time · pace), this week's totals, 8 weeks of km as bars,
 *                walks and rides under "Other activity"; a row opens /train/run/<id>
 *   Strength   · the two Speediance programs (Push · Pull, src/lib/train/programs.ts) as cards with
 *                their moves and sets, matched to Watch strength workouts by weekday, then every
 *                Watch strength workout (a functional day's is labelled Functional 30)
 *   Functional · everything about Functional 30 ("Kettlebell 30" until 2026-10-07): week dots, rest
 *                day, the hero with Start, weekly bests (rounds), recent sessions
 *   Mind       · Mental Training · src/components/mind/MindPane.tsx
 * Above the three parts since 2026-10-04 (rebuilt the same evening around THE PROGRAM, program.ts ·
 * one session a day, Mon Push · Tue Sprint · Wed Pull · Fri Long run · Sat Kettlebell, from Monday
 * 2026-10-05): the WEEK STRIP (seven days, one session each), TODAY's session card (state, button,
 * readiness in plain words), NOTES (up to three lines from the numbers · insights.ts, fixed rules)
 * and, at the bottom, LAST WEEK (the report, folded). Under Runs: the last post from the phone, so
 * a run that has not landed yet is explained where it is missing.
 * `?body=runs|strength|kettlebell` opens a part (Today's Run / Program buttons).
 * The sub line under the title sums the week across the three.
 * MIND: Mental Training · src/components/mind/MindPane.tsx.
 * Everything renders from the phone's copy first; works offline (Mind needs a connection to grade).
 */

import Link from "next/link";
import { useOverview, useWorkouts, readActiveSession } from "@/lib/train/useTrain";
import { fmtClock, repsLabel, workStats, weeklyPaces, paceToBeat, SESSIONS_PER_WEEK, DAY_CODES, DAY_LABELS, dayCode, fmtScheduleDate, PRIMARY_KEY, type DayCode, type TrainSession, type TrainWorkout, type WorkoutKey } from "@/lib/train/types";
import { checklistToday } from "@/lib/checklist/day";
import { useClientValue, useNow } from "@/lib/useClientValue";
import { useEffect, useState } from "react";
import { useHealthSummary } from "@/lib/health/useHealth";
import { MindPane } from "@/components/mind/MindPane";
import { fmtDay, fmtDur, fmtKm, fmtPace, isoWeekOf, kindLabel, paceOf, pipeNote, weekTotals, workoutKind, type WorkoutRow } from "@/lib/health/client";
import { Bars } from "@/components/health/charts";
import { CountUp, Reveal, useDrawn } from "@/components/health/checkup";
import { useCached, fetchJson } from "@/lib/local/store";
import type { ChecklistData } from "@/lib/checklist/types";
import { PROGRAMS } from "@/lib/train/programs";
import { beforeProgram, readiness, trainInsights, weekPlan, weekReport } from "@/lib/train/insights";
import { weekDaysFrom } from "@/lib/train/program";
import { WeekStrip, TodayBlock, NotesCard, ReportCard } from "@/components/train/WeekCards";
import { ObjectivesCard, CoachCard, HeadLine } from "@/components/train/CoachCards";
import { signalColor } from "@/lib/health/client";
import { ProgramCard } from "@/components/train/Programs";

/** YYYY-MM-DD shifted by n days. */
function shiftDay(date: string, n: number): string { const d = new Date(date + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

/** One plain line on the running week against the week before · fixed rules. */
function runsRead(wk: { km: number; runs: number }, lastKm: number, best8: number): string {
  if (!wk.runs && !lastKm) return "No runs in the last two weeks.";
  if (!wk.runs) return `Nothing yet this week · last week ${lastKm} km.`;
  if (wk.km >= best8 && wk.km > 0) return "Your biggest week in two months.";
  const d = Math.round((wk.km - lastKm) * 10) / 10;
  if (Math.abs(d) < 0.5) return "Same distance as last week.";
  return d > 0 ? `${d} km more than last week.` : `${Math.abs(d)} km less than last week.`;
}

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

type Part = "runs" | "strength" | "kettlebell" | "mind";
const PARTS: { key: Part; label: string }[] = [{ key: "runs", label: "Runs" }, { key: "strength", label: "Strength" }, { key: "kettlebell", label: "Functional" }, { key: "mind", label: "Mind" }];
const isPart = (v: string | null): v is Part => v === "runs" || v === "strength" || v === "kettlebell" || v === "mind";

export default function TrainPage() {
  const [part, setPartState] = useState<Part>("kettlebell");
  useEffect(() => {
    let p: Part | null = null;
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get("mind") === "1") p = "mind";
      else {
        const want = q.get("body");
        const saved = (want === "functional" ? "kettlebell" : want) ?? localStorage.getItem("cc-train-body");
        if (isPart(saved)) p = saved;
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the URL and localStorage after mount
    if (p) setPartState(p);
  }, []);
  const setPart = (p: Part) => { setPartState(p); try { localStorage.setItem("cc-train-body", p); } catch { /* ignore */ } };
  const half = part === "mind" ? "mind" : "body";
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
  const lastWeek = isoWeekOf(shiftDay(today, -7));
  const lastKm = Math.round(runs.filter((r) => isoWeekOf(r.date) === lastWeek).reduce((s, r) => s + (r.distanceKm ?? 0), 0) * 10) / 10;
  const best8 = Math.max(0, ...runWeeks.km);
  const lastStrengthWk = strength.filter((w) => isoWeekOf(w.date) === lastWeek).length;
  const drawn = useDrawn();

  // The week = the PROGRAM (program.ts) on the Routine rows' weekdays (the editor's own cached copy).
  const { data: routine } = useCached<ChecklistData>("checklist-all", () => fetchJson<ChecklistData>("/api/checklist?all=1"));
  const days = weekDaysFrom(routine?.items ?? null);
  const kbSessions = ov?.sessions ?? [];
  const slots = weekPlan({ today, days, workouts: watch, kb: kbSessions });
  const before = beforeProgram(today);
  const todaySlot = slots.find((d) => d.date === today) ?? slots[0];
  const nextSlot = slots.find((d) => d.date > today && d.session) ?? null;
  const ready = readiness(health, today);
  const kbBest = ov?.weeklyBests.length ? Math.max(...ov.weeklyBests.map((b) => b.best)) : null;
  const insights = trainInsights({ today, slots, runs, strength, kb: kbSessions, kbBest });
  const report = weekReport({ today, days, workouts: watch, kb: kbSessions, nights: health?.nights ?? [], metrics: health?.metrics });
  const plannedN = slots.filter((d) => d.session).length;
  const doneN = slots.filter((d) => d.state === "done").length;
  // A Watch strength workout belongs to the program planned that weekday; a kettlebell day's is the bell.
  const programOf = (w: WorkoutRow): "push" | "pull" | "kb" | null => {
    const k = days[dayCode(w.date)];
    if (kbDays.has(w.date) || k === "kb") return "kb";
    if (k === "push" || k === "pull") return k;
    return null;
  };
  const todayCode = dayCode(today);
  const bodySub = before ? "The program starts Monday · one session a day, five a week"
    : ov || health ? `This week · ${doneN} of ${plannedN} sessions${wk.runs ? ` · ${wk.km} km run` : ""}` : "This week · —";
  // Why a run is not here yet · the last post from the phone (Health Auto Export syncs hourly, instantly on a widget tap).
  const lastPost = health?.pipe.lastAt ?? null;
  const syncLine = lastPost !== null && nowMs
    ? `Last post from the phone ${new Date(lastPost).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" })}${nowMs - lastPost > 20 * 3600_000 ? ` on ${fmtDay(new Date(lastPost).toISOString().slice(0, 10), today).toLowerCase()}` : ""} · a new run lands when Health Auto Export syncs · tap its widget to sync now.`
    : null;

  const progressData = { today, workouts: watch, kb: kbSessions, metrics: health?.metrics ?? null };
  const missed = slots.filter((x) => x.state === "missed").length;
  const chips = (
    <div role="tablist" aria-label="Train" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {PARTS.map((p) => (
        <button key={p.key} role="tab" aria-selected={part === p.key} onClick={() => setPart(p.key)} className="cc-pill cc-press"
          style={{ minHeight: 38, padding: "0 14px", fontSize: 15, fontWeight: 500, cursor: "pointer", border: "1px solid var(--line)", transition: "background var(--t-2) var(--easeOut), color var(--t-2) var(--easeOut)", background: part === p.key ? "var(--accent-soft)" : "var(--bg-card)", color: part === p.key ? "var(--ink)" : "var(--ink-3)" }}>
          {p.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="cc-wide" style={{ display: "grid", gap: 18 }}>
      <div className="cc-pagetitle" style={{ marginBottom: 0 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600 }}>Train</h1>
          <div className="sub">{half === "mind" ? "Mental training · a callback, then a new topic · 4 a week" : bodySub}</div>
        </div>
      </div>

      <div className="cc-cols">
      <div className="cc-stack">
      {/* THE HERO · this week in one card: the strip, today, readiness, the head */}
      <section className="cc-card cc-rise" style={{ borderColor: !before && todaySlot.session && todaySlot.state !== "done" ? "var(--violet)" : undefined }}>
        <div className="cc-card-head"><span className="title">This week</span><span className="tail tabular-nums">{before ? "starts Monday" : ov || health ? `${doneN} of ${plannedN} sessions` : "—"}</span></div>
        <div className="cc-card-body" style={{ display: "grid", gap: 14 }}>
          <WeekStrip slots={slots} today={today} />
          <TodayBlock slot={todaySlot} next={nextSlot} before={before} />
          {ready.state !== "wait" && (
            <div style={{ display: "grid", gridTemplateColumns: "10px 1fr", gap: 10, alignItems: "start" }}>
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: 99, background: signalColor(ready.state), marginTop: 7 }} />
              <span style={{ fontSize: 14.5, color: "var(--ink-2)", lineHeight: 1.5 }}><strong style={{ color: "var(--ink)", fontWeight: 600 }}>{ready.title}.</strong> {ready.text}</span>
            </div>
          )}
          <HeadLine data={progressData} nights={health?.nights ?? []} missedSessions={missed} />
        </div>
      </section>

      {chips}

      {part === "mind" && <Reveal key="mind" i={0}><MindPane /></Reveal>}

      {part === "runs" && <Reveal key="runs" i={0}><div style={{ display: "grid", gap: 18 }}>
        {runs.length > 0 && (
          <section className="cc-card">
            <div className="cc-card-head"><span className="title">This week</span><span className="tail">{runsRead(wk, lastKm, best8)}</span></div>
            <div className="cc-card-body" style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, alignItems: "end" }}>
                <div style={{ display: "grid", gap: 2 }}>
                  <span className="tabular-nums" style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1 }}><CountUp value={wk.km} fmt={(v) => v.toFixed(1)} /></span>
                  <span style={{ fontSize: 13, color: "var(--ink-3)" }}>km</span>
                </div>
                <div style={{ display: "grid", gap: 2 }}>
                  <span className="tabular-nums" style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.2 }}><CountUp value={wk.runs} fmt={(v) => String(Math.round(v))} /></span>
                  <span style={{ fontSize: 13, color: "var(--ink-3)" }}>{wk.runs === 1 ? "run" : "runs"} · {fmtDur(wk.sec)}</span>
                </div>
                <div style={{ display: "grid", gap: 2 }}>
                  <span className="tabular-nums" style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.2 }}>{wk.km > 0.2 && wk.sec ? fmtPace(Math.round(wk.sec / wk.km)) : "—"}</span>
                  <span style={{ fontSize: 13, color: "var(--ink-3)" }}>avg pace</span>
                </div>
              </div>
              <Bars values={runWeeks.km} labels={runWeeks.labels} height={64} fmt={(v, i) => `${v} km · ${runWeeks.count[i]} run${runWeeks.count[i] === 1 ? "" : "s"}`} />
            </div>
          </section>
        )}
        <WatchCard title="Runs" tail={runs.length ? `${runs.length} on the Watch` : undefined} rows={runs} today={today} empty={watchNote ?? "No runs from the Watch yet. Start an Outdoor Run on the Watch and it lands here after the run."} warn={!!watchNote} />
        {syncLine && <div style={{ fontSize: 13.5, color: "var(--ink-3)", padding: "0 4px", lineHeight: 1.45 }}>{syncLine}</div>}
        {otherWatch.length > 0 && <WatchCard title="Other activity" rows={otherWatch} today={today} empty="" />}
      </div></Reveal>}

      {part === "strength" && <Reveal key="strength" i={0}><div style={{ display: "grid", gap: 18 }}>
        {/* The two Speediance programs · today's open, the other folded */}
        {PROGRAMS.map((p) => {
          const pDays = DAY_CODES.filter((d) => days[d] === p.key);
          return <ProgramCard key={p.key} p={p} days={pDays} today={today} isToday={days[todayCode] === p.key} sessions={strength.filter((w) => programOf(w) === p.key)} />;
        })}
        <WatchCard title="On the Watch" tail={strength.length ? `${strengthWk} this week${lastStrengthWk ? ` · last week ${lastStrengthWk}` : ""}` : undefined} rows={strength} today={today}
          noteFor={(w) => { const k = programOf(w); return k === "kb" ? "Functional 30" : k === "push" ? "Push · Speediance" : k === "pull" ? "Pull · Speediance" : undefined; }}
          empty={watchNote ?? "No strength sessions from the Watch yet. Start Traditional Strength Training on the Watch when the machine starts; it lands here after."} warn={!!watchNote} />
      </div></Reveal>}

      {part === "kettlebell" && <Reveal key="kettlebell" i={0}><div style={{ display: "grid", gap: 18 }}>
      {/* Week progress: 4 dots · rest day · streak */}
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {Array.from({ length: target }).map((_, i) => (
            <span key={i} style={{ flex: 1, height: 6, borderRadius: 99, background: drawn && ov && i < ov.thisWeekSessions ? "var(--violet)" : "var(--fill-3)", transition: `background 360ms var(--easeOut) ${200 + i * 120}ms` }} />
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
          <span className="tail">{ov?.toBeat ? `beat ${ov.toBeat.rounds} rounds${pace ? ` · ${fmtClock(pace.avgRoundMs / 1000)}` : ""}` : "set the bar"}</span>
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
                  <span className="cc-progress-fill" style={{ display: "block", width: drawn ? `${(b.best / maxBest) * 100}%` : 0, transition: `width 700ms var(--easeOut) ${150 + i * 70}ms` }} />
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
      </div></Reveal>}
      </div>

      {/* The right column on the laptop · under everything on the phone */}
      <div className="cc-stack">
        <Reveal key="objectives" i={1}><ObjectivesCard data={progressData} /></Reveal>
        <Reveal key="coach" i={2}><CoachCard /></Reveal>
        <Reveal key="notes" i={3}><NotesCard insights={insights} /></Reveal>
        <ReportCard report={report} />
      </div>
      </div>
    </div>
  );
}
