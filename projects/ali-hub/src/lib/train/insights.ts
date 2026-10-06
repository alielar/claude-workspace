/**
 * Training insights (Ali 2026-10-04 · spec §7c item 15: "combine Apple Watch, Speediance, runs
 * and kettlebell data into interpreted insights, objectives and a weekly training report").
 *
 * FIXED RULES, no AI (the same week reads the same every day, and nothing here waits on credits):
 *   weekPlan      · the seven days of a week against the PROGRAM (program.ts · one session a day,
 *                   the days from the Routine rows) and what the Watch and the kettlebell player
 *                   recorded · done / today / missed / upcoming / rest, extras on unplanned days
 *   readiness     · last night and the night checks against your own ranges · plain words
 *   trainInsights · up to three lines: where the week stands, what the numbers say
 *   weekReport    · the last full week against the one before · one line per pillar and a verdict
 *
 * Inputs are the phone's cached copies (health summary, train overview, the Routine rows), so
 * everything renders offline and instantly.
 */

import type { HealthSummary, NightRow, WorkoutRow } from "@/lib/health/summary";
import { METRIC_INFO, avg, fmtDur, fmtMin, fmtPace, isoWeekOf, metricKey, metricValue, paceOf, sleepSignal, typicalRange, vitalState, workoutKind, type SignalState } from "@/lib/health/client";
import { DAY_CODES, dayCode, workStats, type DayCode, type TrainSession } from "@/lib/train/types";
import { PROGRAM, PROGRAM_START, sessionByKey, type SessionKey, type WeekDays } from "@/lib/train/program";

export type SlotState = "done" | "today" | "missed" | "upcoming" | "rest";
export type DaySlot = {
  day: DayCode; date: string;
  /** The planned session (null = rest day). */
  session: SessionKey | null;
  state: SlotState;
  /** "36 min · 118 bpm" · "5.2 km · 5:40" · "12 rounds" once done. */
  detail: string | null;
  /** The Watch workout behind a done day (opens /train/run/<hkId>). */
  hkId?: string;
  /** A session done on a rest day, or a second one · listed, never judged. */
  extra?: { label: string; detail: string; hkId?: string }[];
};

/** YYYY-MM-DD shifted by n days. */
export function shiftDay(date: string, n: number): string { const d = new Date(date + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
/** The Monday of `date`'s ISO week. */
export function mondayOf(date: string): string { return shiftDay(date, -DAY_CODES.indexOf(dayCode(date))); }

const strengthDetail = (w: WorkoutRow) => `${fmtDur(w.durationSec)}${w.hrAvg !== null ? ` · ${w.hrAvg} bpm` : ""}${w.activeKcal !== null ? ` · ${w.activeKcal} kcal` : ""}`;
const runDetail = (w: WorkoutRow) => `${w.distanceKm !== null ? `${w.distanceKm.toFixed(1)} km` : fmtDur(w.durationSec)}${paceOf(w) ? ` · ${fmtPace(paceOf(w))}` : ""}`;
const kbDetail = (s: TrainSession) => `${s.rounds ?? 0} rounds${workStats(s) ? ` · ${Math.round(workStats(s)!.avgRoundMs / 1000 / 60 * 10) / 10} min a round` : ""}`;

/**
 * One slot per weekday. A Watch strength workout on a Push or Pull day IS that session (Speediance
 * does not talk to the Watch; the weekday is the match); a Watch run on a run day is that run; the
 * kettlebell day is done when the player logged a session (a Watch strength workout that day is
 * the same session). Anything else that day is an extra.
 */
export function weekPlan(args: { today: string; days: WeekDays; workouts: WorkoutRow[]; kb: TrainSession[]; weekOf?: string }): DaySlot[] {
  const mon = mondayOf(args.weekOf ?? args.today);
  const kbDone = new Map(args.kb.filter((s) => s.finishedAt !== null).map((s) => [s.date, s] as const));
  return Array.from({ length: 7 }, (_, i) => {
    const date = shiftDay(mon, i), day = DAY_CODES[i];
    const key = args.days[day];
    const s = key ? sessionByKey(key) : null;
    const runs = args.workouts.filter((w) => w.date === date && workoutKind(w.type) === "run");
    const strength = args.workouts.filter((w) => w.date === date && workoutKind(w.type) === "strength");
    const kb = kbDone.get(date) ?? null;
    let detail: string | null = null, hkId: string | undefined, done = false;
    const used = new Set<string>();
    if (s?.kind === "run" && runs[0]) { done = true; detail = runDetail(runs[0]); hkId = runs[0].hkId; used.add(runs[0].hkId); }
    if (s?.kind === "strength" && strength[0]) { done = true; detail = strengthDetail(strength[0]); hkId = strength[0].hkId; used.add(strength[0].hkId); }
    if (s?.kind === "kb") {
      if (kb) { done = true; detail = kbDetail(kb); }
      if (strength[0]) { used.add(strength[0].hkId); if (!done) { done = true; detail = strengthDetail(strength[0]); hkId = strength[0].hkId; } }
    }
    const extra: NonNullable<DaySlot["extra"]> = [];
    for (const w of runs) if (!used.has(w.hkId)) extra.push({ label: "Run", detail: runDetail(w), hkId: w.hkId });
    for (const w of strength) if (!used.has(w.hkId)) extra.push({ label: kb && s?.kind !== "kb" ? "Functional 30" : "Strength", detail: strengthDetail(w), hkId: w.hkId });
    if (kb && s?.kind !== "kb" && !strength.length) extra.push({ label: "Functional 30", detail: kbDetail(kb) });
    const state: SlotState = !s ? "rest" : done ? "done" : date === args.today ? "today" : date < args.today ? "missed" : "upcoming";
    return { day, date, session: key, state, detail, hkId, ...(extra.length ? { extra } : {}) };
  });
}

/** True while the program has not started (the week before 2026-10-05). */
export const beforeProgram = (today: string) => today < PROGRAM_START;

export type Readiness = { state: SignalState; title: string; text: string };

/**
 * Rested / a bit tired / rest today, from last night (Health's sleep signal) and the night checks
 * (resting HR, HRV, breathing, wrist temperature) against your own ranges · in plain words, no score.
 */
export function readiness(h: HealthSummary | null | undefined, today: string): Readiness {
  if (!h) return { state: "wait", title: "No night data yet", text: "The Watch has not posted a night." };
  const night = h.nights[0] ?? null;
  const sleep = sleepSignal(night, today);
  const checks: { label: string; state: "typical" | "high" | "low" }[] = [];
  for (const [name, s] of Object.entries(h.metrics)) {
    const k = metricKey(name); const info = k ? METRIC_INFO[k] : null;
    if (!k || !info?.vital) continue;
    const pts = s.points.map((p) => metricValue(p, info, s.units)).filter((v): v is number => v !== null);
    if (pts.length < 2) continue;
    const range = typicalRange(pts.slice(0, -1), info.floor);
    if (!range) continue;
    checks.push({ label: (info.short ?? info.label).toLowerCase(), state: vitalState(pts[pts.length - 1], range) });
  }
  const off = checks.filter((c) => c.state !== "typical");
  const hours = night?.totalMin !== null && night?.totalMin !== undefined && sleep.state !== "wait" ? fmtMin(night.totalMin) : null;
  if (sleep.state === "wait" && !checks.length) return { state: "wait", title: "Learning your normal", text: "Your ranges appear after a week of nights." };
  if (off.length >= 2 || (sleep.state === "off" && off.length >= 1)) return { state: "off", title: "Rest or walk today", text: `${hours ? `${hours} of sleep, ` : ""}${off.map((c) => c.label).join(" and ")} off your usual. Move the session a day; the plan has room.` };
  if (sleep.state === "off") return { state: "ok", title: "Short night, keep it easy", text: `${hours} of sleep. Run at talking pace or do the lighter half of the program, not a max day.` };
  if (off.length === 1) return { state: "ok", title: "Mostly rested", text: `${hours ? `${hours} of sleep, ` : ""}${off[0].label} ${off[0].state} for you. Train, but stop a set short of failure.` };
  return { state: "good", title: "Rested", text: `${hours ? `${hours} of sleep, ` : ""}${checks.length ? "every night check in your range" : "a good night"}. Train as planned.` };
}

export type TrainInsight = { key: string; tone: "pos" | "warn" | "neg" | "info"; title: string; text: string };

const dayName = (d: DayCode) => ({ mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" })[d];

/** Up to three lines · where the week stands, then what the numbers say. */
export function trainInsights(args: { today: string; slots: DaySlot[]; runs: WorkoutRow[]; strength: WorkoutRow[]; kb: TrainSession[]; kbBest: number | null }): TrainInsight[] {
  const out: TrainInsight[] = [];
  const { today, slots } = args;
  if (beforeProgram(today)) {
    out.push({ key: "start", tone: "info", title: "The program starts Monday", text: `${PROGRAM.map((s) => `${s.name} ${dayName(s.day).slice(0, 3)}`).join(" · ")}. This week is history, nothing is judged.` });
  } else {
    const planned = slots.filter((s) => s.session);
    const done = planned.filter((s) => s.state === "done").length;
    const missed = planned.filter((s) => s.state === "missed");
    const left = planned.filter((s) => s.state === "today" || s.state === "upcoming");
    const dow = DAY_CODES.indexOf(dayCode(today));
    if (missed.length && left.length) {
      const m = missed[0];
      const free = slots.find((s) => !s.session && DAY_CODES.indexOf(s.day) > dow);
      out.push({ key: "missed", tone: "warn", title: `${sessionByKey(m.session!).name} skipped ${dayName(m.day)}`, text: free ? `${dayName(free.day)} is free · do it then and the week still holds five.` : "No free day left · let it go, the plan restarts Monday." });
    } else if (done >= planned.length && planned.length) {
      out.push({ key: "week", tone: "pos", title: "Five of five · the week is done", text: "Anything more is a bonus. Protect sleep over the weekend." });
    } else if (dow >= 5 && done < planned.length - 1) {
      out.push({ key: "week", tone: "neg", title: `${done} of ${planned.length} this week`, text: `${planned.length - done} short with the weekend left. Keep what you can and start Monday clean.` });
    } else if (planned.length) {
      out.push({ key: "week", tone: "info", title: `${done} of ${planned.length} this week`, text: left.length ? `Left: ${left.map((s) => `${sessionByKey(s.session!).name} ${dayName(s.day).slice(0, 3)}`).join(" · ")}.` : "" });
    }
  }

  const thisW = isoWeekOf(today);
  const recentRuns = args.runs.filter((r) => r.date <= today);
  const runsThis = recentRuns.filter((r) => isoWeekOf(r.date) === thisW && paceOf(r));
  const runsBefore = recentRuns.filter((r) => isoWeekOf(r.date) !== thisW && r.date >= shiftDay(today, -35) && paceOf(r));
  if (runsThis.length && runsBefore.length >= 2) {
    const p = avg(runsThis.map((r) => paceOf(r)!))!, q = avg(runsBefore.map((r) => paceOf(r)!))!;
    const d = Math.round(q - p);
    if (Math.abs(d) >= 8) out.push({ key: "pace", tone: d > 0 ? "pos" : "warn", title: `Pace ${fmtPace(Math.round(p))} · ${Math.abs(d)} s a km ${d > 0 ? "faster" : "slower"} than your month`, text: d > 0 ? "Fitness is moving. Keep the long run easy so it keeps moving." : "Slower weeks follow hard strength days or short nights · an easy run is still a run." });
  }
  const strThis = args.strength.filter((w) => isoWeekOf(w.date) === thisW);
  const strBefore = args.strength.filter((w) => isoWeekOf(w.date) !== thisW && w.date >= shiftDay(today, -35));
  if (strThis.length && strBefore.length >= 2) {
    const hr = avg(strThis.map((w) => w.hrAvg).filter((v): v is number => v !== null)), hrB = avg(strBefore.map((w) => w.hrAvg).filter((v): v is number => v !== null));
    if (hr !== null && hrB !== null && Math.abs(hr - hrB) >= 6) out.push({ key: "strhr", tone: "info", title: `Strength at ${Math.round(hr)} bpm, ${Math.abs(Math.round(hr - hrB))} ${hr > hrB ? "over" : "under"} your month`, text: hr > hrB ? "Shorter rests or a harder day. With a short night too, that is strain, not progress." : "Same work, lower heart rate · the body is adapting to the program." });
  }
  const kbLast = args.kb.filter((s) => s.finishedAt !== null && s.rounds !== null).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (kbLast && args.kbBest !== null && kbLast.rounds !== null && kbLast.date >= shiftDay(today, -8)) {
    const gap = args.kbBest - kbLast.rounds;
    if (gap <= 0) out.push({ key: "kb", tone: "pos", title: `Functional: ${kbLast.rounds} rounds · your best`, text: "The next bar is one more round, not a heavier bell." });
    else if (gap >= 2) out.push({ key: "kb", tone: "info", title: `Functional: ${kbLast.rounds} rounds · ${gap} under your best`, text: "Rest less between rounds before pushing the pace inside them." });
  }
  const sessionDays = new Set([...args.runs, ...args.strength].filter((w) => w.date <= today).map((w) => w.date).concat(args.kb.filter((s) => s.finishedAt !== null).map((s) => s.date)));
  if (sessionDays.has(today) && sessionDays.has(shiftDay(today, -1)) && sessionDays.has(shiftDay(today, -2))) out.push({ key: "row", tone: "warn", title: "Three days in a row", text: "Tomorrow is a rest day whatever the plan says · the adaptation happens on the day off." });
  return out.slice(0, 3);
}

export type ReportLine = { label: string; now: string; prev: string | null; tone: "pos" | "neg" | "flat" };
export type WeekReport = { week: string; from: string; to: string; lines: ReportLine[]; verdict: string; sessions: { done: number; planned: number } };

/** The last FULL week (Monday to Sunday) against the one before · one line per pillar and a verdict. */
export function weekReport(args: { today: string; days: WeekDays; workouts: WorkoutRow[]; kb: TrainSession[]; nights: NightRow[]; metrics: HealthSummary["metrics"] | undefined }): WeekReport | null {
  const mon = mondayOf(args.today);
  const lastMon = shiftDay(mon, -7), lastSun = shiftDay(mon, -1), prevMon = shiftDay(mon, -14), prevSun = shiftDay(mon, -8);
  const inWeek = (d: string, a: string, b: string) => d >= a && d <= b;
  const wo = (a: string, b: string) => args.workouts.filter((w) => inWeek(w.date, a, b));
  const kb = (a: string, b: string) => args.kb.filter((s) => s.finishedAt !== null && inWeek(s.date, a, b));
  const lastW = wo(lastMon, lastSun), prevW = wo(prevMon, prevSun);
  const lastKb = kb(lastMon, lastSun), prevKb = kb(prevMon, prevSun);
  if (!lastW.length && !lastKb.length && !prevW.length && !prevKb.length) return null;

  // Sessions: against the program once it has started; before that, a plain count of what was done.
  const count = (a: string, b: string) => {
    const sessions = new Set([...wo(a, b).map((w) => w.date + workoutKind(w.type)), ...kb(a, b).map((s) => s.date + "kb")]).size;
    if (a < PROGRAM_START) return { done: sessions, planned: 0 };
    const slots = weekPlan({ today: args.today, days: args.days, workouts: args.workouts, kb: args.kb, weekOf: a });
    return { done: slots.filter((s) => s.state === "done").length + slots.reduce((n, s) => n + (s.extra?.length ?? 0), 0), planned: slots.filter((s) => s.session).length };
  };
  const cl = count(lastMon, lastSun), cp = count(prevMon, prevSun);
  const lines: ReportLine[] = [];
  lines.push({ label: "Sessions", now: cl.planned ? `${cl.done} of ${cl.planned}` : String(cl.done), prev: cp.planned ? `${cp.done} of ${cp.planned}` : String(cp.done), tone: cl.planned && cl.done >= cl.planned ? "pos" : cl.done < cp.done ? "neg" : cl.done > cp.done ? "pos" : "flat" });

  const runs = (xs: WorkoutRow[]) => xs.filter((w) => workoutKind(w.type) === "run");
  const km = (xs: WorkoutRow[]) => Math.round(runs(xs).reduce((s, r) => s + (r.distanceKm ?? 0), 0) * 10) / 10;
  const kmL = km(lastW), kmP = km(prevW);
  if (runs(lastW).length || runs(prevW).length) lines.push({ label: "Running", now: `${kmL} km · ${runs(lastW).length} run${runs(lastW).length === 1 ? "" : "s"}`, prev: `${kmP} km`, tone: kmL - kmP > 1 ? "pos" : kmP - kmL > 1 ? "neg" : "flat" });
  const pace = (xs: WorkoutRow[]) => { const ps = runs(xs).map(paceOf).filter((p): p is number => p !== null); return ps.length ? Math.round(avg(ps)!) : null; };
  const pL = pace(lastW), pP = pace(prevW);
  if (pL !== null) lines.push({ label: "Run pace", now: fmtPace(pL), prev: pP !== null ? fmtPace(pP) : null, tone: pP === null ? "flat" : pP - pL >= 8 ? "pos" : pL - pP >= 8 ? "neg" : "flat" });

  const str = (xs: WorkoutRow[]) => xs.filter((w) => workoutKind(w.type) === "strength");
  const strMin = (xs: WorkoutRow[]) => Math.round(str(xs).reduce((s, w) => s + (w.durationSec ?? 0), 0) / 60);
  if (str(lastW).length || str(prevW).length) lines.push({ label: "Strength", now: `${strMin(lastW)} min · ${str(lastW).length} session${str(lastW).length === 1 ? "" : "s"}`, prev: `${strMin(prevW)} min`, tone: str(lastW).length > str(prevW).length ? "pos" : str(lastW).length < str(prevW).length ? "neg" : "flat" });

  const rounds = (xs: TrainSession[]) => Math.max(0, ...xs.map((s) => s.rounds ?? 0));
  if (lastKb.length || prevKb.length) lines.push({ label: "Functional", now: lastKb.length ? `${rounds(lastKb)} rounds` : "skipped", prev: prevKb.length ? `${rounds(prevKb)} rounds` : "skipped", tone: !lastKb.length ? "neg" : !prevKb.length ? "pos" : rounds(lastKb) > rounds(prevKb) ? "pos" : rounds(lastKb) < rounds(prevKb) ? "neg" : "flat" });

  const ex = args.metrics ? Object.entries(args.metrics).find(([n]) => metricKey(n) === "apple_exercise_time") : undefined;
  if (ex) {
    const sum = (a: string, b: string) => ex[1].points.filter((p) => inWeek(p.date, a, b)).reduce((s, p) => s + (metricValue(p, METRIC_INFO.apple_exercise_time, ex[1].units) ?? 0), 0);
    const eL = Math.round(sum(lastMon, lastSun)), eP = Math.round(sum(prevMon, prevSun));
    if (eL || eP) lines.push({ label: "Exercise minutes", now: `${eL} min`, prev: `${eP} min`, tone: eL >= 150 ? "pos" : eL < eP - 20 ? "neg" : "flat" });
  }
  const sleep = (a: string, b: string) => avg(args.nights.filter((n) => inWeek(n.date, a, b)).map((n) => n.totalMin).filter((v): v is number => v !== null));
  const sL = sleep(lastMon, lastSun), sP = sleep(prevMon, prevSun);
  if (sL !== null) lines.push({ label: "Sleep a night", now: fmtMin(Math.round(sL)), prev: sP !== null ? fmtMin(Math.round(sP)) : null, tone: sP === null ? "flat" : sL - sP > 10 ? "pos" : sL - sP < -10 ? "neg" : "flat" });

  const good = lines.filter((l) => l.tone === "pos").length, bad = lines.filter((l) => l.tone === "neg").length;
  const verdict = !cl.planned ? `${cl.done} session${cl.done === 1 ? "" : "s"} before the program. From Monday the week is judged against the five.`
    : cl.done >= cl.planned && (sL === null || sL >= 420) ? "Every session done and enough sleep · the week did its job."
    : cl.done >= cl.planned ? "Every session done on short sleep. The training is there; the recovery is not · bed earlier this week."
    : bad >= 2 ? "A lighter week than the one before. Pick the two sessions you will not skip and start with those."
    : good >= 2 ? "Fewer sessions, better numbers · quality over count. Add the missing session back this week."
    : `${cl.done} of ${cl.planned} sessions. One more this week is the whole goal.`;
  return { week: isoWeekOf(lastMon), from: lastMon, to: lastSun, lines, verdict, sessions: cl };
}
