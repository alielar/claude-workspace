/**
 * Training insights (Ali 2026-10-04 · spec §7c item 15: "combine Apple Watch, Speediance, runs
 * and kettlebell data into interpreted insights, objectives and a weekly training report").
 *
 * FIXED RULES, no AI (the same week reads the same every day, and nothing here waits on credits):
 *   weekPlan    · the week's five sessions (Push · Run · Pull · Run · Kettlebell) against what the
 *                 Watch and the kettlebell player recorded · done / today / missed / upcoming, plus
 *                 any extra session on an unplanned day
 *   readiness   · last night and the night checks, from the Health summary · go / easy / rest
 *   trainInsights · up to four lines: what to do today, where the week stands, what the numbers say
 *   weekReport  · the last full week against the one before · one line per pillar and a verdict
 *
 * Inputs are the phone's cached copies (health summary, train overview, the Routine rows' weekdays),
 * so everything renders offline and instantly.
 */

import type { HealthSummary, NightRow, WorkoutRow } from "@/lib/health/summary";
import { METRIC_INFO, avg, fmtDur, fmtMin, fmtPace, isoWeekOf, metricKey, metricValue, paceOf, sleepSignal, typicalRange, vitalState, workoutKind, type SignalState } from "@/lib/health/client";
import { DAY_CODES, DAY_LABELS, dayCode, workStats, type DayCode, type TrainSession } from "@/lib/train/types";

export type SlotKind = "push" | "pull" | "run" | "kb" | "strength";
export type SlotState = "done" | "today" | "missed" | "upcoming" | "extra";
export type PlanSlot = {
  kind: SlotKind; label: string; day: DayCode; date: string; state: SlotState;
  /** "36 min · 118 bpm" · "5.2 km · 5:40" · "12 rounds" once done. */
  detail: string | null;
  /** The Watch workout behind a done slot (opens /train/run/<hkId>). */
  hkId?: string;
};

export type PlanDays = { push: DayCode[]; pull: DayCode[]; run: DayCode[]; kb: DayCode[] };
/** The seeded week · what the Routine rows say until they load. */
export const DEFAULT_PLAN_DAYS: PlanDays = { push: ["sun"], pull: ["tue"], run: ["mon", "thu"], kb: ["sat"] };

const SLOT_LABEL: Record<SlotKind, string> = { push: "Push", pull: "Pull", run: "Run", kb: "Kettlebell", strength: "Strength" };

/** YYYY-MM-DD shifted by n days. */
export function shiftDay(date: string, n: number): string { const d = new Date(date + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
/** The Monday of `date`'s ISO week. */
export function mondayOf(date: string): string { const idx = DAY_CODES.indexOf(dayCode(date)); return shiftDay(date, -idx); }

const strengthDetail = (w: WorkoutRow) => `${fmtDur(w.durationSec)}${w.hrAvg !== null ? ` · ${w.hrAvg} bpm` : ""}${w.activeKcal !== null ? ` · ${w.activeKcal} kcal` : ""}`;
const runDetail = (w: WorkoutRow) => `${w.distanceKm !== null ? `${w.distanceKm.toFixed(1)} km` : fmtDur(w.durationSec)}${paceOf(w) ? ` · ${fmtPace(paceOf(w))}` : ""}`;

/**
 * The week's sessions in weekday order. A Watch strength workout on a Push day IS the Push
 * session (Speediance does not talk to the Watch; the weekday is the match); a kettlebell day's
 * session comes from the player (a Watch strength workout that day is the same session, not an
 * extra). Anything on an unplanned day is listed as an extra.
 */
export function weekPlan(args: { today: string; days: PlanDays; workouts: WorkoutRow[]; kb: TrainSession[]; weekOf?: string }): PlanSlot[] {
  const ref = args.weekOf ?? args.today;
  const mon = mondayOf(ref);
  const dates = Array.from({ length: 7 }, (_, i) => shiftDay(mon, i));
  const byDate = (xs: WorkoutRow[], d: string) => xs.filter((w) => w.date === d);
  const runs = args.workouts.filter((w) => workoutKind(w.type) === "run");
  const strength = args.workouts.filter((w) => workoutKind(w.type) === "strength");
  const kbDone = new Map(args.kb.filter((s) => s.finishedAt !== null).map((s) => [s.date, s] as const));
  const used = new Set<string>();
  const slots: PlanSlot[] = [];
  const stateFor = (date: string, done: boolean): SlotState => (done ? "done" : date === args.today ? "today" : date < args.today ? "missed" : "upcoming");

  for (const date of dates) {
    const day = dayCode(date);
    const kinds: SlotKind[] = [];
    if (args.days.push.includes(day)) kinds.push("push");
    if (args.days.pull.includes(day)) kinds.push("pull");
    if (args.days.kb.includes(day)) kinds.push("kb");
    for (let i = 0; i < args.days.run.filter((d) => d === day).length; i++) kinds.push("run");
    for (const kind of kinds) {
      if (kind === "run") {
        const w = byDate(runs, date).find((x) => !used.has(x.hkId)) ?? null;
        if (w) used.add(w.hkId);
        slots.push({ kind, label: "Run", day, date, state: stateFor(date, !!w), detail: w ? runDetail(w) : null, hkId: w?.hkId });
      } else if (kind === "kb") {
        const s = kbDone.get(date) ?? null;
        const w = byDate(strength, date).find((x) => !used.has(x.hkId)) ?? null; // the Watch copy of the same session
        if (w) used.add(w.hkId);
        const detail = s ? `${s.rounds ?? 0} rounds${workStats(s) ? ` · ${Math.round(workStats(s)!.avgRoundMs / 1000 / 60 * 10) / 10} min a round` : ""}` : w ? strengthDetail(w) : null;
        slots.push({ kind, label: "Kettlebell", day, date, state: stateFor(date, !!s || !!w), detail, hkId: w?.hkId });
      } else {
        const w = byDate(strength, date).find((x) => !used.has(x.hkId)) ?? null;
        if (w) used.add(w.hkId);
        slots.push({ kind, label: SLOT_LABEL[kind], day, date, state: stateFor(date, !!w), detail: w ? strengthDetail(w) : null, hkId: w?.hkId });
      }
    }
  }
  // Extras · sessions on days with no slot (or a second one on a planned day).
  for (const date of dates) {
    for (const w of byDate(runs, date)) if (!used.has(w.hkId)) { used.add(w.hkId); slots.push({ kind: "run", label: "Run", day: dayCode(date), date, state: "extra", detail: runDetail(w), hkId: w.hkId }); }
    for (const w of byDate(strength, date)) if (!used.has(w.hkId)) { used.add(w.hkId); slots.push({ kind: "strength", label: "Strength", day: dayCode(date), date, state: "extra", detail: strengthDetail(w), hkId: w.hkId }); }
    const s = kbDone.get(date);
    if (s && !slots.some((x) => x.date === date && x.kind === "kb")) slots.push({ kind: "kb", label: "Kettlebell", day: dayCode(date), date, state: "extra", detail: `${s.rounds ?? 0} rounds` });
  }
  return slots.sort((a, b) => a.date.localeCompare(b.date));
}

export type Readiness = { state: SignalState; title: string; text: string };

/**
 * Go / easy / rest from last night (Health's own sleep signal) and the night checks against
 * your own ranges (resting HR, HRV, breathing, wrist temperature), the way the Health tab does.
 */
export function readiness(h: HealthSummary | null | undefined, today: string): Readiness {
  if (!h) return { state: "wait", title: "No Watch data yet", text: "Readiness appears once the Watch posts a night." };
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
    checks.push({ label: info.short ?? info.label, state: vitalState(pts[pts.length - 1], range) });
  }
  const off = checks.filter((c) => c.state !== "typical");
  if (sleep.state === "wait" && !checks.length) return { state: "wait", title: "Learning your normal", text: "Your ranges appear after a week of nights." };
  if (off.length >= 2 || (sleep.state === "off" && off.length >= 1)) return { state: "off", title: "Rest or walk today", text: `${off.map((c) => c.label.toLowerCase()).join(" and ")} off your usual${sleep.state === "off" ? " after a short night" : ""}. Move the session a day; the plan has room.` };
  if (sleep.state === "off") return { state: "ok", title: "Short night · keep it easy", text: `${sleep.text}. A run at talking pace or the lighter half of the program, not a max day.` };
  if (off.length === 1) return { state: "ok", title: `${off[0].label} ${off[0].state} for you`, text: "One check off is usually noise. Train, but stop a set short of failure." };
  return { state: "good", title: "Green light", text: sleep.state === "good" ? `${sleep.text}, every check in your range.` : "Every night check in your range." };
}

export type TrainInsight = { key: string; tone: "pos" | "warn" | "neg" | "info"; title: string; text: string };

/** Up to four lines · what to do today first, then where the week stands, then what the numbers say. */
export function trainInsights(args: {
  today: string; slots: PlanSlot[]; ready: Readiness; runs: WorkoutRow[]; strength: WorkoutRow[]; kb: TrainSession[]; kbBest: number | null;
}): TrainInsight[] {
  const out: TrainInsight[] = [];
  const { today, slots } = args;
  const planned = slots.filter((s) => s.state !== "extra");
  const done = planned.filter((s) => s.state === "done").length + slots.filter((s) => s.state === "extra").length;
  const todaySlot = slots.find((s) => s.state === "today") ?? null;
  const left = planned.filter((s) => s.state === "upcoming" || s.state === "today");
  const missed = planned.filter((s) => s.state === "missed");
  const dow = DAY_CODES.indexOf(dayCode(today)); // 0 = Monday
  const daysLeft = 6 - dow;
  const dayName = (d: DayCode) => ({ mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" })[d];

  // 1 · today
  if (todaySlot) {
    if (args.ready.state === "off") out.push({ key: "today", tone: "neg", title: `${todaySlot.label} planned · ${args.ready.title.toLowerCase()}`, text: args.ready.text });
    else if (args.ready.state === "ok") out.push({ key: "today", tone: "warn", title: `${todaySlot.label} today · ${args.ready.title.toLowerCase()}`, text: args.ready.text });
    else out.push({ key: "today", tone: "pos", title: `${todaySlot.label} today${args.ready.state === "good" ? " · green light" : ""}`, text: args.ready.state === "good" ? args.ready.text : todaySlot.kind === "run" ? "Start an Outdoor Run on the Watch · it lands here after." : todaySlot.kind === "kb" ? "Open Kettlebell and press Start when the bell is ready." : "Start Traditional Strength Training on the Watch when the machine starts." });
  } else if (planned.some((s) => s.date === today && s.state === "done")) {
    const s = planned.find((x) => x.date === today && x.state === "done")!;
    out.push({ key: "today", tone: "pos", title: `${s.label} done${s.detail ? ` · ${s.detail}` : ""}`, text: left.length ? `Next: ${left[0].label} ${dayName(left[0].day)}.` : "That was the last session of the week." });
  } else if (left.length) {
    out.push({ key: "today", tone: "info", title: "Rest day", text: `Next: ${left[0].label} ${dayName(left[0].day)}.${args.ready.state === "off" ? " Good timing · the night checks say recover." : ""}` });
  }

  // 2 · the week
  if (planned.length) {
    if (missed.length && daysLeft >= 1) {
      const m = missed[0];
      const free = DAY_CODES.slice(dow + (todaySlot ? 1 : 0)).find((d) => !planned.some((s) => s.day === d && s.state !== "missed"));
      out.push({ key: "missed", tone: "warn", title: `${m.label} skipped ${dayName(m.day)}`, text: free ? `${free === dayCode(today) ? "Today" : dayName(free)} is free · do it then and the week still holds ${planned.length}.` : `No free day left · let it go, the plan restarts Monday.` });
    } else if (done >= planned.length) {
      out.push({ key: "week", tone: "pos", title: `${done} of ${planned.length} · the week is done`, text: "Anything more is a bonus. Protect sleep over the weekend." });
    } else if (daysLeft <= 1 && done < planned.length - 1) {
      out.push({ key: "week", tone: "neg", title: `${done} of ${planned.length} this week`, text: `${planned.length - done} sessions short with ${daysLeft === 0 ? "today left" : "two days left"}. Keep what you can and start Monday clean.` });
    } else {
      out.push({ key: "week", tone: "info", title: `${done} of ${planned.length} this week`, text: left.length ? `Left: ${left.map((s) => `${s.label} ${DAY_LABELS[s.day]}`).join(" · ")}.` : "" });
    }
  }

  // 3 · the numbers
  const thisW = isoWeekOf(today);
  const recentRuns = args.runs.filter((r) => r.date <= today);
  const runsThis = recentRuns.filter((r) => isoWeekOf(r.date) === thisW && paceOf(r));
  const runsBefore = recentRuns.filter((r) => isoWeekOf(r.date) !== thisW && r.date >= shiftDay(today, -35) && paceOf(r));
  if (runsThis.length && runsBefore.length >= 2) {
    const p = avg(runsThis.map((r) => paceOf(r)!))!, q = avg(runsBefore.map((r) => paceOf(r)!))!;
    const d = Math.round(q - p);
    if (Math.abs(d) >= 8) out.push({ key: "pace", tone: d > 0 ? "pos" : "warn", title: `Pace ${fmtPace(Math.round(p))} · ${Math.abs(d)} s a km ${d > 0 ? "faster" : "slower"} than your month`, text: d > 0 ? "Fitness is moving. Keep one of the two runs easy so it keeps moving." : "Slower weeks happen after hard strength days or short nights · an easy run is still a run." });
  }
  const strThis = args.strength.filter((w) => isoWeekOf(w.date) === thisW);
  const strBefore = args.strength.filter((w) => isoWeekOf(w.date) !== thisW && w.date >= shiftDay(today, -35));
  if (strThis.length && strBefore.length >= 2) {
    const hr = avg(strThis.map((w) => w.hrAvg).filter((v): v is number => v !== null)), hrB = avg(strBefore.map((w) => w.hrAvg).filter((v): v is number => v !== null));
    if (hr !== null && hrB !== null && Math.abs(hr - hrB) >= 6) out.push({ key: "strhr", tone: "info", title: `Strength at ${Math.round(hr)} bpm, ${Math.abs(Math.round(hr - hrB))} ${hr > hrB ? "over" : "under"} your month`, text: hr > hrB ? "Shorter rests or a harder day. If sleep was short too, that is strain, not progress." : "Same work, lower heart rate · the body is adapting to the program." });
  }
  const kbLast = args.kb.filter((s) => s.finishedAt !== null && s.rounds !== null).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (kbLast && args.kbBest !== null && kbLast.rounds !== null && kbLast.date >= shiftDay(today, -8)) {
    const gap = args.kbBest - kbLast.rounds;
    if (gap <= 0) out.push({ key: "kb", tone: "pos", title: `Kettlebell: ${kbLast.rounds} rounds · your best`, text: "The next bar is one more round, not a heavier bell." });
    else if (gap >= 2) out.push({ key: "kb", tone: "info", title: `Kettlebell: ${kbLast.rounds} rounds · ${gap} under your best`, text: "Rest less between rounds before pushing the pace inside them." });
  }
  // Three sessions in a row → rest
  const sessionDays = new Set([...args.runs, ...args.strength].filter((w) => w.date <= today).map((w) => w.date).concat(args.kb.filter((s) => s.finishedAt !== null).map((s) => s.date)));
  if (sessionDays.has(today) && sessionDays.has(shiftDay(today, -1)) && sessionDays.has(shiftDay(today, -2))) out.push({ key: "row", tone: "warn", title: "Three days in a row", text: "Tomorrow is a rest day whatever the plan says · the adaptation happens on the day off." });

  return out.slice(0, 4);
}

export type ReportLine = { label: string; now: string; prev: string | null; tone: "pos" | "neg" | "flat" };
export type WeekReport = { week: string; from: string; to: string; lines: ReportLine[]; verdict: string; sessions: { done: number; planned: number } };

/** The last FULL week (Monday to Sunday) against the one before · one line per pillar and a verdict. */
export function weekReport(args: { today: string; days: PlanDays; workouts: WorkoutRow[]; kb: TrainSession[]; nights: NightRow[]; metrics: HealthSummary["metrics"] | undefined }): WeekReport | null {
  const mon = mondayOf(args.today);
  const lastMon = shiftDay(mon, -7), lastSun = shiftDay(mon, -1), prevMon = shiftDay(mon, -14), prevSun = shiftDay(mon, -8);
  const inWeek = (d: string, a: string, b: string) => d >= a && d <= b;
  const wo = (a: string, b: string) => args.workouts.filter((w) => inWeek(w.date, a, b));
  const kb = (a: string, b: string) => args.kb.filter((s) => s.finishedAt !== null && inWeek(s.date, a, b));
  const lastW = wo(lastMon, lastSun), prevW = wo(prevMon, prevSun);
  const lastKb = kb(lastMon, lastSun), prevKb = kb(prevMon, prevSun);
  if (!lastW.length && !lastKb.length && !prevW.length && !prevKb.length) return null;

  const slotsLast = weekPlan({ today: args.today, days: args.days, workouts: args.workouts, kb: args.kb, weekOf: lastMon });
  const slotsPrev = weekPlan({ today: args.today, days: args.days, workouts: args.workouts, kb: args.kb, weekOf: prevMon });
  const count = (s: PlanSlot[]) => ({ done: s.filter((x) => x.state === "done" || x.state === "extra").length, planned: s.filter((x) => x.state !== "extra").length });
  const cl = count(slotsLast), cp = count(slotsPrev);
  const lines: ReportLine[] = [];
  lines.push({ label: "Sessions", now: `${cl.done} of ${cl.planned}`, prev: `${cp.done} of ${cp.planned}`, tone: cl.done >= cl.planned ? "pos" : cl.done < cp.done ? "neg" : "flat" });

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
  if (lastKb.length || prevKb.length) lines.push({ label: "Kettlebell", now: lastKb.length ? `${rounds(lastKb)} rounds` : "skipped", prev: prevKb.length ? `${rounds(prevKb)} rounds` : "skipped", tone: !lastKb.length ? "neg" : !prevKb.length ? "pos" : rounds(lastKb) > rounds(prevKb) ? "pos" : rounds(lastKb) < rounds(prevKb) ? "neg" : "flat" });

  // Watch exercise minutes and the nights · the body's side of the week
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
  const verdict = cl.done >= cl.planned && (sL === null || sL >= 420) ? "Every session done and enough sleep · the week did its job."
    : cl.done >= cl.planned ? "Every session done on short sleep. The training is there; the recovery is not · bed earlier this week."
    : bad >= 2 ? "A lighter week than the one before. Pick the two sessions you will not skip and start with those."
    : good >= 2 ? "Fewer sessions, better numbers · quality over count. Add the missing session back this week."
    : `${cl.done} of ${cl.planned} sessions. One more this week is the whole goal.`;
  return { week: isoWeekOf(lastMon), from: lastMon, to: lastSun, lines, verdict, sessions: cl };
}
