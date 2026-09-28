/**
 * Apple Watch data · the client's view (no database). Sorting workouts into
 * Runs / Strength / Other, formatting, one-line readings of a night and of each
 * daily metric. Rule-based on purpose: the same night reads the same every day.
 */

import type { NightRow, WorkoutRow, MetricPoint } from "./summary";
export type { HealthSummary, NightRow, WorkoutRow, WorkoutDetail, MetricPoint } from "./summary";
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

export type MetricInfo = { label: string; unit: string; meaning: string; better: "lower" | "higher" | "steady"; field: "qty" | "avg" };

/** The daily metrics worth a card, in display order · anything else HAE sends is listed plainly. */
export const METRIC_INFO: Record<string, MetricInfo> = {
  resting_heart_rate:      { label: "Resting heart rate", unit: "bpm", better: "lower",  field: "qty", meaning: "Lower is fitter. A jump of 5 or more over your usual often means strain, a bad night or an illness on its way." },
  heart_rate_variability:  { label: "Heart rate variability", unit: "ms", better: "higher", field: "qty", meaning: "Higher means more recovered. Only your own 30-day average is a fair comparison, not other people's numbers." },
  respiratory_rate:        { label: "Breathing rate in sleep", unit: "/min", better: "steady", field: "qty", meaning: "Steady is good. A rise of 1 to 2 above your usual can show up a day before you feel ill." },
  blood_oxygen_saturation: { label: "Blood oxygen", unit: "%", better: "steady", field: "qty", meaning: "95 to 100 % is normal. Repeated dips under 90 % during sleep are worth a doctor's look." },
  heart_rate:              { label: "Heart rate range", unit: "bpm", better: "steady", field: "avg", meaning: "Your day's range: the low end tracks rest, the high end your hardest effort." },
  vo2_max:                 { label: "VO2 max", unit: "", better: "higher", field: "qty", meaning: "Apple's fitness estimate. Higher is better; it moves slowly, over months of running." },
  walking_heart_rate_average: { label: "Walking heart rate", unit: "bpm", better: "lower", field: "qty", meaning: "Heart rate on ordinary walks. Falls as fitness builds." },
};

export function metricValue(p: MetricPoint, info: MetricInfo): number | null {
  return info.field === "avg" ? p.avg ?? p.qty : p.qty ?? p.avg;
}

export function fmtMetric(v: number | null, unit: string): string {
  if (v === null) return "—";
  const n = Math.abs(v) >= 100 || Number.isInteger(v) ? Math.round(v).toString() : v.toFixed(1);
  return unit ? `${n} ${unit}` : n;
}

export function avg(xs: number[]): number | null { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; }

/** "vs your 30 days: +4" style delta of the latest value against the 30-day average. */
export function deltaLine(points: MetricPoint[], info: MetricInfo): { latest: number | null; mean30: number | null; delta: number | null; tone: "pos" | "neg" | "flat" } {
  const vals = points.map((p) => metricValue(p, info)).filter((v): v is number => v !== null);
  const latest = vals.length ? vals[vals.length - 1] : null;
  const mean30 = avg(vals);
  const delta = latest !== null && mean30 !== null ? latest - mean30 : null;
  let tone: "pos" | "neg" | "flat" = "flat";
  if (delta !== null && Math.abs(delta) >= Math.max(1, Math.abs(mean30 ?? 0) * 0.05)) {
    tone = info.better === "steady" ? "neg" : (delta > 0) === (info.better === "higher") ? "pos" : "neg";
  }
  return { latest, mean30, delta, tone };
}
