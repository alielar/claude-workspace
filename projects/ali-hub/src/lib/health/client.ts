/**
 * Apple Watch data · the client's view (no database). Sorting workouts into
 * Runs / Strength / Other, formatting, one-line readings of a night and of each
 * daily metric. Rule-based on purpose: the same night reads the same every day.
 */

import type { NightRow, WorkoutRow, MetricPoint } from "./summary";
import type { IntervalSeg } from "./types";
import type { PipeStatus } from "./server";
export type { HealthSummary, NightRow, WorkoutRow, WorkoutDetail, MetricPoint } from "./summary";
export type { PipeStatus } from "./server";

/** HAE metric name → plain words · "resting_heart_rate" → "resting heart rate". */
export function metricWords(name: string): string {
  if (name === "heart_rate_variability") return "HRV";
  if (name === "sleep_analysis") return "sleep";
  return name.replace(/_/g, " ");
}

/**
 * Why a screen is empty, in one line, or null when the pipe is fine · read from what Health
 * Auto Export has really posted. `want` = the data the screen is waiting for. Facts first
 * (what arrived), then the one thing to tap in HAE.
 */
export function pipeNote(pipe: PipeStatus | undefined, want: "sleep" | "workouts", now: number): string | null {
  if (!pipe) return null;
  if (pipe.posts === 0) return "Nothing has reached A L I from the Watch yet. Settings → Apple Watch has the setup.";
  const sent = pipe.carried.filter((m) => m !== "sleep_analysis").map(metricWords);
  const sentLine = sent.length ? `It sends only ${sent.join(", ")}.` : "It sends no metrics at all.";
  if (want === "sleep" && !pipe.sleepSeen) {
    const auto = pipe.automations[0] ?? "the automation";
    return `Health Auto Export is posting, but without sleep. ${sentLine} In HAE: Automations → ${auto} → Select Health Metrics → Select all → Save, then Manual Export.`;
  }
  if (want === "workouts" && !pipe.workoutsSeen) {
    return `No workouts have reached A L I: the posting automation carries health metrics only. In HAE: Automations → + → REST API · name ALI workouts · same URL and key · Data Type: Workouts · Date Range: Previous 7 Days · Save, then Manual Export.`;
  }
  if (pipe.lastAt !== null && now - pipe.lastAt > 20 * 3600_000) {
    const d = new Date(pipe.lastAt);
    return `Last post ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}. Open Health Auto Export or tap its widget to sync now.`;
  }
  return null;
}
export { fmtPace } from "./types";

export type WorkoutKind = "run" | "strength" | "other";

export function workoutKind(type: string): WorkoutKind {
  const s = type.toLowerCase();
  if (s.includes("run")) return "run";
  if (s.includes("strength") || s.includes("functional") || s.includes("core") || s.includes("cross")) return "strength";
  return "other";
}

/** "Traditional Strength Training" → "Strength" · "Outdoor Run" → "Run". */
export function kindLabel(type: string): string {
  const k = workoutKind(type), s = type.toLowerCase();
  if (k === "run") return s.includes("indoor") || s.includes("treadmill") ? "Treadmill run" : "Run";
  if (k === "strength") return "Strength";
  if (s.includes("walk") || s.includes("hik")) return "Walk";
  if (s.includes("cycl") || s.includes("bik")) return "Ride";
  if (s.includes("swim")) return "Swim";
  if (s.includes("yoga") || s.includes("flex") || s.includes("mind") || s.includes("cooldown")) return "Mobility";
  return type.replace(/ Training$/, "");
}

export function fmtKm(km: number | null): string { return km === null ? "—" : `${km < 10 ? km.toFixed(2) : km.toFixed(1)} km`; }

/** 3725 → "1:02:05" · 1505 → "25:05" */
export function fmtDur(sec: number | null): string {
  if (sec === null) return "—";
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.round(sec % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** 432 → "7 h 12" · 45 → "45 min" */
export function fmtMin(min: number | null): string {
  if (min === null) return "—";
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`;
}

export function fmtTime(ms: number | null): string {
  return ms === null ? "—" : new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
}

export function fmtDay(date: string, today: string): string {
  if (date === today) return "Today";
  const d = new Date(date + "T12:00:00");
  const y = new Date(today + "T12:00:00"); y.setDate(y.getDate() - 1);
  if (date === y.toISOString().slice(0, 10)) return "Yesterday";
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(d);
}

export function paceOf(w: Pick<WorkoutRow, "durationSec" | "distanceKm">): number | null {
  return w.durationSec && w.distanceKm && w.distanceKm > 0.2 ? Math.round(w.durationSec / w.distanceKm) : null;
}

/** ISO week key "2026-W40" for a YYYY-MM-DD. */
export function isoWeekOf(date: string): string {
  const d = new Date(date + "T12:00:00Z");
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - first.getTime()) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function weekTotals(runs: WorkoutRow[], today: string): { km: number; runs: number; sec: number } {
  const wk = isoWeekOf(today);
  const mine = runs.filter((r) => isoWeekOf(r.date) === wk);
  return { km: Math.round(mine.reduce((s, r) => s + (r.distanceKm ?? 0), 0) * 10) / 10, runs: mine.length, sec: mine.reduce((s, r) => s + (r.durationSec ?? 0), 0) };
}

/** One plain sentence about a night · the same rules every day. */
export function nightVerdict(n: NightRow): string {
  if (n.totalMin === null) return "No sleep data.";
  const deepPct = n.deepMin !== null ? n.deepMin / n.totalMin : null;
  const bed = n.inBedMin ?? n.totalMin + (n.awakeMin ?? 0);
  const awakePct = n.awakeMin !== null && bed > 0 ? n.awakeMin / bed : null;
  if (n.totalMin < 300) return "Very short night · under 5 h.";
  if (n.totalMin < 360) return "Short night · under 6 h.";
  if (awakePct !== null && awakePct > 0.15) return "Broken night · awake a lot.";
  if (deepPct !== null && deepPct < 0.1) return "Little deep sleep · less repair than usual.";
  if (n.totalMin >= 420 && (deepPct === null || deepPct >= 0.13)) return "A solid night.";
  return "A fair night.";
}

export const STAGES: { key: "deepMin" | "coreMin" | "remMin" | "awakeMin"; label: string; color: string }[] = [
  { key: "deepMin",  label: "Deep",  color: "var(--stage-deep)" },
  { key: "coreMin",  label: "Core",  color: "var(--stage-core)" },
  { key: "remMin",   label: "REM",   color: "var(--stage-rem)" },
  { key: "awakeMin", label: "Awake", color: "var(--stage-awake)" },
];

export type MetricGroup = "overnight" | "heart" | "activity" | "fitness";

export type MetricInfo = {
  label: string; unit: string; meaning: string; better: "lower" | "higher" | "steady"; field: "qty" | "avg" | "sum";
  /** Short name where a row is narrow (the Vitals card, the Activity tiles). */
  short?: string;
  group: MetricGroup;
  /** Half-width floor of the typical range (the Vitals band never gets thinner than this). */
  floor: number;
  /** Shown on the Vitals card (the five Apple checks each night, plus sleep length). */
  vital?: boolean;
  /** Decimals when written. */
  dp?: number;
  /** The typical adult range from the usual medical references, or a note when none applies · the "am I safe" line. */
  safe?: { lo: number; hi: number; text?: string } | { text: string };
};

/**
 * Every daily Watch metric A L I knows how to read, keyed by Health Auto Export's name.
 * Display order inside each group = the order here. Anything else HAE sends is listed plainly.
 */
export const METRIC_INFO: Record<string, MetricInfo> = {
  // Overnight · what Apple's Vitals checks while you sleep
  resting_heart_rate:      { group: "overnight", vital: true, label: "Resting heart rate", short: "Resting HR", unit: "bpm", better: "lower",  field: "qty", floor: 3, safe: { lo: 60, hi: 100, text: "Typical adult 60 to 100 · trained people sit lower" }, meaning: "Lower is fitter. A jump of 5 or more over your usual often means strain, a bad night or an illness on its way." },
  heart_rate_variability:  { group: "overnight", vital: true, label: "Heart rate variability", short: "HRV", unit: "ms", better: "higher", field: "qty", floor: 8, safe: { text: "No adult standard · only your own trend counts" }, meaning: "Higher means more recovered. Only your own range is a fair comparison, not other people's numbers." },
  respiratory_rate:        { group: "overnight", vital: true, label: "Breathing rate", unit: "/min", better: "steady", field: "qty", floor: 1, dp: 1, safe: { lo: 12, hi: 20, text: "Typical adult 12 to 20 a minute" }, meaning: "Breaths per minute in sleep. Steady is good. A rise of 1 to 2 above your usual can show up a day before you feel ill." },
  apple_sleeping_wrist_temperature: { group: "overnight", vital: true, label: "Wrist temperature", short: "Wrist temp", unit: "°C", better: "steady", field: "qty", floor: 0.3, dp: 1, safe: { text: "No fixed range · only the change from your usual" }, meaning: "Skin temperature in sleep. Only the change matters: +0.5 °C or more over your usual points to illness, a hard day or alcohol." },
  blood_oxygen_saturation: { group: "overnight", vital: true, label: "Blood oxygen", unit: "%", better: "steady", field: "qty", floor: 1.5, dp: 1, safe: { lo: 95, hi: 100, text: "Typical adult 95 to 100 %" }, meaning: "95 to 100 % is normal. Repeated dips under 90 % during sleep are worth a doctor's look." },
  // Heart
  heart_rate:              { group: "heart", label: "Heart rate range", unit: "bpm", better: "steady", field: "avg", floor: 5, meaning: "Your day's range: the low end tracks rest, the high end your hardest effort." },
  walking_heart_rate_average: { group: "heart", label: "Walking heart rate", unit: "bpm", better: "lower", field: "qty", floor: 4, meaning: "Heart rate on ordinary walks. Falls as fitness builds." },
  cardio_recovery:         { group: "heart", label: "Cardio recovery", unit: "bpm", better: "higher", field: "qty", floor: 4, safe: { lo: 25, hi: 80, text: "Above 25 is good, above 40 very fit" }, meaning: "How far the heart rate drops one minute after a workout ends. Above 25 is good, above 40 very fit; it rises with training." },
  // Activity · the rings, as numbers
  step_count:              { group: "activity", label: "Steps", unit: "", better: "higher", field: "sum", floor: 1500, meaning: "Daily steps. 7,000 to 10,000 covers most of the benefit; the trend beats any single day." },
  active_energy:           { group: "activity", label: "Active energy", short: "Active", unit: "kcal", better: "higher", field: "sum", floor: 100, meaning: "Calories burned by moving, on top of what the body burns at rest." },
  apple_exercise_time:     { group: "activity", label: "Exercise", short: "Exercise", unit: "min", better: "higher", field: "sum", floor: 10, meaning: "Minutes at a brisk-walk effort or above. 150 a week is the health baseline; 30 a day closes the ring." },
  apple_stand_hour:        { group: "activity", label: "Stand hours", short: "Stand", unit: "h", better: "higher", field: "sum", floor: 2, meaning: "Hours with at least a minute on your feet. 12 closes the ring." },
  walking_running_distance: { group: "activity", label: "Distance on foot", unit: "km", better: "higher", field: "sum", floor: 1, dp: 1, meaning: "Walking and running together." },
  flights_climbed:         { group: "activity", label: "Floors climbed", unit: "", better: "higher", field: "sum", floor: 3, meaning: "Ten floors is about 30 m of climb." },
  time_in_daylight:        { group: "activity", label: "Daylight", unit: "min", better: "higher", field: "sum", floor: 15, meaning: "Minutes outdoors in daylight. 20 or more in the morning sets the body clock and helps the next night's sleep." },
  physical_effort:         { group: "activity", label: "Physical effort", unit: "MET", better: "steady", field: "avg", floor: 0.3, dp: 1, meaning: "Average intensity of the day, where 1 is sitting still." },
  // Fitness · slow-moving estimates
  vo2_max:                 { group: "fitness", label: "VO2 max", unit: "", better: "higher", field: "qty", floor: 1, dp: 1, meaning: "Apple's fitness estimate from your runs and walks. Higher is better; it moves slowly, over months." },
  walking_speed:           { group: "fitness", label: "Walking speed", unit: "km/h", better: "higher", field: "avg", floor: 0.3, dp: 1, meaning: "Your natural walking pace on flat ground. A steady fall is an early sign of fatigue or injury." },
  six_minute_walking_test_distance: { group: "fitness", label: "6-minute walk", unit: "m", better: "higher", field: "qty", floor: 20, meaning: "Apple's estimate of how far you could walk in six minutes. Over 500 m is good." },
};

export const METRIC_GROUPS: { key: MetricGroup; title: string }[] = [
  { key: "overnight", title: "Overnight" },
  { key: "heart",     title: "Heart" },
  { key: "activity",  title: "Activity" },
  { key: "fitness",   title: "Fitness" },
];

/** HAE's name → our key · tolerant of the few naming variants HAE has used. */
export function metricKey(name: string): string | null {
  if (METRIC_INFO[name]) return name;
  const s = name.toLowerCase();
  if (s.includes("wrist_temperature")) return "apple_sleeping_wrist_temperature";
  if (s.includes("exercise_time")) return "apple_exercise_time";
  if (s.includes("stand_hour")) return "apple_stand_hour";
  if (s === "steps" || s.includes("step_count")) return "step_count";
  if (s.includes("active_energy")) return "active_energy";
  if (s.includes("heart_rate_recovery")) return "cardio_recovery";
  if (s.includes("oxygen")) return "blood_oxygen_saturation";
  if (s.includes("distance_walking")) return "walking_running_distance";
  return null;
}

/** The value of a day in the unit we display · converts the few units HAE may send differently. */
export function metricValue(p: MetricPoint, info: MetricInfo, units?: string | null): number | null {
  const raw = info.field === "avg" ? p.avg ?? p.qty : p.qty ?? p.avg;
  if (raw === null) return null;
  const u = (units ?? "").toLowerCase();
  if (info.unit === "kcal" && u === "kj") return raw / 4.184;
  if (info.unit === "km" && u === "mi") return raw * 1.609344;
  if (info.unit === "m" && u === "mi") return raw * 1609.344;
  if (info.unit === "km/h" && (u === "m/s" || u === "mps")) return raw * 3.6;
  if (info.unit === "km/h" && u === "mph") return raw * 1.609344;
  if (info.unit === "°C" && (u === "degf" || u === "°f")) return (raw - 32) / 1.8;
  return raw;
}

export function fmtMetric(v: number | null, unit: string, dp?: number): string {
  if (v === null) return "—";
  const n = dp !== undefined ? v.toFixed(dp) : Math.abs(v) >= 100 || Number.isInteger(v) ? Math.round(v).toLocaleString("en-GB") : v.toFixed(1);
  return unit ? `${n} ${unit}` : n;
}

export function avg(xs: number[]): number | null { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; }

export const RANGE_DAYS = 7; // values needed before a typical range is drawn (Apple's Vitals waits 7 nights too)

/**
 * Your typical range for a metric, from its earlier values (the latest one excluded so it can be
 * judged against it): mean ± 1.5 standard deviations, never thinner than the metric's floor.
 * null until there are RANGE_DAYS values.
 */
export function typicalRange(earlier: number[], floor: number): { lo: number; hi: number; mean: number } | null {
  const xs = earlier.slice(-28);
  if (xs.length < RANGE_DAYS) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  const w = Math.max(1.5 * sd, floor);
  return { lo: mean - w, hi: mean + w, mean };
}

export type VitalState = "typical" | "high" | "low";
export function vitalState(v: number, r: { lo: number; hi: number }): VitalState { return v > r.hi ? "high" : v < r.lo ? "low" : "typical"; }

/** One rule-based sentence over the night's checks · the same numbers read the same every day. */
export function vitalsRead(rows: { label: string; state: VitalState | null }[]): string {
  const known = rows.filter((r) => r.state !== null);
  if (!known.length) return "Your ranges appear after 7 nights.";
  const off = known.filter((r) => r.state !== "typical");
  if (!off.length) return "Everything in your usual range.";
  if (off.length === 1) return `${off[0].label} is ${off[0].state} for you · one outlier is usually noise.`;
  return `${off.length} outliers · ${off.map((r) => `${r.label.toLowerCase()} ${r.state}`).join(", ")}. Take today easier.`;
}

/** The latest value against the 30-day average · tone follows `better`. Before RANGE_DAYS values there is no fair comparison. */
export function deltaLine(points: MetricPoint[], info: MetricInfo, units?: string | null): { latest: number | null; mean30: number | null; delta: number | null; tone: "pos" | "neg" | "flat"; n: number } {
  const vals = points.map((p) => metricValue(p, info, units)).filter((v): v is number => v !== null);
  const latest = vals.length ? vals[vals.length - 1] : null;
  const mean30 = vals.length >= RANGE_DAYS ? avg(vals) : null;
  const delta = latest !== null && mean30 !== null ? latest - mean30 : null;
  let tone: "pos" | "neg" | "flat" = "flat";
  if (delta !== null && Math.abs(delta) >= Math.max(info.floor, Math.abs(mean30 ?? 0) * 0.05)) {
    tone = info.better === "steady" ? "neg" : (delta > 0) === (info.better === "higher") ? "pos" : "neg";
  }
  return { latest, mean30, delta, tone, n: vals.length };
}

/** "+4" / "-0.3" for a delta, with the metric's decimals. */
export function fmtDelta(d: number, dp?: number): string {
  const s = dp !== undefined ? d.toFixed(dp) : Math.abs(d) >= 10 ? Math.round(d).toString() : d.toFixed(1);
  return d > 0 ? `+${s}` : s;
}

// ── The day's read · three signals, one headline (rule-based, no AI) ──────────

export type SignalState = "good" | "ok" | "off" | "wait";
export type Signal = { key: "recovery" | "sleep" | "movement"; label: string; state: SignalState; text: string };
export type DayRead = { headline: string; line: string; signals: Signal[] };

export function signalColor(s: SignalState): string {
  return s === "good" ? "var(--pos)" : s === "ok" ? "var(--warn)" : s === "off" ? "var(--neg)" : "var(--fill-3)";
}

/** Recovery = the night's checks against your own ranges. */
export function recoverySignal(rows: { label: string; state: VitalState | null; n: number }[]): Signal {
  const known = rows.filter((r) => r.state !== null);
  if (!known.length) {
    const n = rows.length ? Math.min(...rows.map((r) => r.n)) : 0;
    return { key: "recovery", label: "Recovery", state: "wait", text: rows.length ? `day ${n} of ${RANGE_DAYS}` : "no night checks yet" };
  }
  const off = known.filter((r) => r.state !== "typical");
  if (!off.length) return { key: "recovery", label: "Recovery", state: "good", text: `${known.length} checks in your range` };
  if (off.length === 1) return { key: "recovery", label: "Recovery", state: "ok", text: `${off[0].label} ${off[0].state}` };
  return { key: "recovery", label: "Recovery", state: "off", text: `${off.length} checks outside your range` };
}

/** Sleep = last night's score, if last night is recent. */
export function sleepSignal(n: NightRow | null, today: string): Signal {
  if (!n || n.score === null) return { key: "sleep", label: "Sleep", state: "wait", text: "no night yet" };
  const y = new Date(today + "T12:00:00"); y.setDate(y.getDate() - 1);
  const recent = n.date === today || n.date === y.toISOString().slice(0, 10);
  if (!recent) return { key: "sleep", label: "Sleep", state: "wait", text: `last night ${fmtDay(n.date, today).toLowerCase()}` };
  const state: SignalState = n.score >= 75 ? "good" : n.score >= 55 ? "ok" : "off";
  return { key: "sleep", label: "Sleep", state, text: `${fmtMin(n.totalMin)} · score ${n.score}` };
}

/** Movement = the last 7 full days: exercise minutes against the 150-a-week baseline, steps against 7,000 a day. */
export function movementSignal(exercise7: number[], steps7: number[]): Signal {
  if (!exercise7.length && !steps7.length) return { key: "movement", label: "Movement", state: "wait", text: "no days yet" };
  const ex = exercise7.reduce((a, b) => a + b, 0);
  const st = avg(steps7);
  const state: SignalState = ex >= 150 || (st !== null && st >= 7000) ? "good" : ex >= 75 || (st !== null && st >= 4000) ? "ok" : "off";
  const text = exercise7.length ? `${Math.round(ex)} exercise min in 7 days` : `${Math.round(st ?? 0).toLocaleString("en-GB")} steps a day`;
  return { key: "movement", label: "Movement", state, text };
}

/** The headline over the three signals · the same signals read the same every day. */
export function dayRead(recovery: Signal, sleep: Signal, movement: Signal, offLabel?: string): DayRead {
  const signals = [recovery, sleep, movement];
  const r = recovery.state, s = sleep.state, m = movement.state;
  if (r === "wait" && s === "wait") return { headline: "Learning your normal", line: "Your ranges appear after 7 nights. Until then the Watch is just listening.", signals };
  if (r === "off") return { headline: "Ease off today", line: "Several night checks sit outside your usual range. Move gently, sleep early, and let tomorrow's numbers decide.", signals };
  if (s === "off" && r === "good") return { headline: "Short night, body fine", line: "The night was short but every check is in your range. Keep the day light and go to bed early.", signals };
  if (s === "off") return { headline: "Running on little", line: "A poor night and one check off. No hard training today.", signals };
  if (r === "ok") return { headline: "Mostly fine", line: `${offLabel ?? "One check"} is off for you. One outlier is usually noise · watch it tomorrow.`, signals };
  if (s === "ok") return { headline: "Fair shape", line: "Body checks in range, the night was fair. A normal day is fine.", signals };
  if (m === "off") return { headline: "Rested, under-moved", line: "Night and body are fine. The week is short on movement · a walk fixes that.", signals };
  if (m === "ok") return { headline: "All clear", line: "Everything in your range and a solid night. A bit more movement would round the week out.", signals };
  if (r === "wait") return { headline: "Good night", line: "A solid night. Recovery ranges still need a few more nights.", signals };
  return { headline: "All clear", line: "Everything in your usual range, a solid night, moving well. Green light for whatever the day holds.", signals };
}

/** Nights in a row (newest first) at or over `minMin` minutes, counted from the latest night. */
export function sleepStreak(nights: NightRow[], minMin = 420): number {
  let n = 0;
  for (const x of nights) { if (x.totalMin !== null && x.totalMin >= minMin) n++; else break; }
  return n;
}

/**
 * A name per interval, the way the Fitness app shows them (Warmup · Work · Recovery · Cooldown).
 * HAE carries the segments but not Apple's step names, so the rule reads them from the shape:
 * a rep is a short segment (60 s or less) when the run has both short and long ones, else a
 * segment faster than the median pace; the first segment before the first rep is the warmup,
 * the last one after the last rep the cooldown, anything else between reps a recovery.
 */
export type IntervalRole = "Warmup" | "Work" | "Recovery" | "Cooldown";
export function intervalRoles(intervals: IntervalSeg[]): IntervalRole[] {
  const n = intervals.length;
  if (!n) return [];
  const short = intervals.some((s) => s.sec <= 60), long = intervals.some((s) => s.sec > 60);
  let isWork: (s: IntervalSeg) => boolean;
  if (short && long) isWork = (s) => s.sec <= 60;
  else {
    const paces = intervals.map((s) => s.paceSec).filter((p): p is number => p !== null).sort((a, b) => a - b);
    const median = paces.length ? paces[Math.floor(paces.length / 2)] : null;
    isWork = (s) => median !== null && s.paceSec !== null && s.paceSec < median;
  }
  const work = intervals.map(isWork);
  const first = work.indexOf(true), last = work.lastIndexOf(true);
  return intervals.map((_, i) => {
    if (work[i]) return "Work";
    if (first === -1) return i === 0 ? "Warmup" : "Recovery";
    if (i < first) return "Warmup";
    if (i > last) return "Cooldown";
    return "Recovery";
  });
}
