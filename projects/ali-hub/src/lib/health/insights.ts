/**
 * Health insights and the weekly health brief (Ali 2026-10-03: "brief, concise insights on the
 * numbers · what's wrong, what to do · add a weekly health brief") · pure rules, no AI, so the
 * same numbers read the same every day. Everything is computed on the phone from the summary.
 */

import type { NightRow } from "./summary";
import { avg, fmtMin, type VitalState } from "./client";

export type Insight = { key: string; title: string; text: string; tone: "pos" | "warn" | "neg" | "info" };

export type VitalLike = { key: string; label: string; value: number | null; state: VitalState | null; range: { lo: number; hi: number; mean?: number } | null; unit: string; dp?: number };

const fmt = (v: number, unit: string, dp = 0) => `${dp ? v.toFixed(dp) : Math.round(v)}${unit === "%" ? "%" : unit ? ` ${unit}` : ""}`;

/** What is off and what to do about it · up to four lines, the most actionable first. */
export function insightsFor(args: {
  vitals: VitalLike[]; night: NightRow | null; nights: NightRow[]; exerciseWeekMin: number | null; steps7: number[]; today: string;
}): Insight[] {
  const out: Insight[] = [];
  const by = (k: string) => args.vitals.find((v) => v.key === k);

  const rhr = by("resting_heart_rate");
  if (rhr?.state === "high" && rhr.value !== null && rhr.range) {
    out.push({ key: "rhr", tone: "warn", title: `Resting heart rate ${fmt(rhr.value, "bpm")}, above your usual ${fmt(rhr.range.lo, "")} to ${fmt(rhr.range.hi, "bpm")}`, text: "Most often a hard day, a late night or a drink. Keep today easy, drink water, and sleep early. Two mornings in a row with a fever feeling is an illness, not fatigue." });
  }
  const hrv = by("heart_rate_variability");
  if (hrv?.state === "low" && hrv.value !== null && hrv.range) {
    out.push({ key: "hrv", tone: "warn", title: `HRV ${fmt(hrv.value, "ms")}, under your usual ${fmt(hrv.range.lo, "")} to ${fmt(hrv.range.hi, "ms")}`, text: "The body is still recovering. Swap hard training for a walk or mobility today; one low morning means little, three in a row means rest." });
  }
  const rr = by("respiratory_rate");
  if (rr?.state === "high" && rr.value !== null) {
    out.push({ key: "rr", tone: "warn", title: `Breathing rate ${fmt(rr.value, "/min", 1)}, above your usual`, text: "A rise of one or two breaths a minute often shows up a day before a cold. Take it easy and watch tomorrow's number." });
  }
  const temp = by("apple_sleeping_wrist_temperature");
  if (temp?.state === "high" && temp.value !== null && temp.range?.mean !== undefined) {
    out.push({ key: "temp", tone: "warn", title: `Wrist temperature ${(temp.value - temp.range.mean).toFixed(1)} °C over your usual`, text: "Half a degree or more points to illness coming, a hard day or alcohol. Hydrate, sleep early, no hard session." });
  }
  const spo2 = by("blood_oxygen_saturation");
  if (spo2?.state === "low" && spo2.value !== null && spo2.value < 94) {
    out.push({ key: "spo2", tone: "neg", title: `Blood oxygen ${fmt(spo2.value, "%", 1)} in sleep`, text: "Under 94 % now and then is usually position or a cold. Repeated nights under 90 % are worth a doctor's look." });
  }

  const n = args.night;
  if (n?.totalMin !== null && n?.totalMin !== undefined) {
    if (n.totalMin < 360) out.push({ key: "short", tone: "neg", title: `Only ${fmtMin(n.totalMin)} of sleep`, text: "Under six hours. No hard training, a short walk in daylight before noon, and bed by 22:30 tonight · the next night repays most of it." });
    else if (n.totalMin < 420) out.push({ key: "shortish", tone: "warn", title: `${fmtMin(n.totalMin)} of sleep, a bit short`, text: "Fine once. Aim for seven tonight; morning daylight and no screens after 22:00 are the two cheapest fixes." });
    if (n.awakeMin !== null && n.awakeMin >= 45) out.push({ key: "awake", tone: "info", title: `${fmtMin(n.awakeMin)} awake during the night`, text: "Broken sleep: usually a late meal, alcohol, heat or stress. Keep the room cool and the last meal three hours before bed." });
    if (n.deepMin !== null && n.totalMin >= 360 && n.deepMin < 45) out.push({ key: "deep", tone: "info", title: `Little deep sleep (${fmtMin(n.deepMin)})`, text: "Deep sleep comes early in the night and rewards an earlier, regular bedtime. Hard training late in the evening cuts it." });
  }
  // Bedtime drift over the last 7 nights
  const beds = args.nights.slice(0, 7).map((x) => x.inBedStart ?? x.sleepStart).filter((t): t is number => t !== null).map((t) => { const d = new Date(t); const h = d.getHours() + d.getMinutes() / 60; return h < 12 ? h + 24 : h; });
  if (beds.length >= 4 && Math.max(...beds) - Math.min(...beds) > 1.75) out.push({ key: "bed", tone: "info", title: "Bedtime moves by nearly two hours this week", text: "A steady bedtime is the single cheapest way to sleep better. Pick one time and keep it on weekends too." });

  if (args.exerciseWeekMin !== null && args.exerciseWeekMin < 75) {
    const dow = (new Date(args.today + "T12:00:00").getDay() + 6) % 7; // Monday = 0
    if (dow >= 3) out.push({ key: "ex", tone: "warn", title: `${Math.round(args.exerciseWeekMin)} exercise minutes this week`, text: `${150 - Math.round(args.exerciseWeekMin)} more minutes reach the 150 baseline by Sunday · a run and a brisk walk cover it.` });
  }
  const steps = avg(args.steps7);
  if (steps !== null && steps < 5000) out.push({ key: "steps", tone: "info", title: `About ${Math.round(steps / 100) * 100} steps a day this week`, text: "Under 5,000 is a sitting week. A 20-minute walk adds roughly 2,500 and most of the benefit sits between 5,000 and 8,000." });

  if (!out.length) out.push({ key: "all", tone: "pos", title: "Nothing to fix today", text: "Every night check is in your range and the night was fine. Green light for a hard session if one is planned." });
  return out.slice(0, 4);
}

export type WeekLine = { label: string; now: string; prev: string | null; tone: "pos" | "neg" | "flat" };
export type WeekBrief = { title: string; verdict: string; lines: WeekLine[] };

/** The last 7 full days against the 7 before · sleep, score, exercise, steps, resting HR, HRV. */
export function weekBrief(args: {
  nights: NightRow[]; today: string;
  daily: { exercise: (number | null)[]; steps: (number | null)[]; rhr: (number | null)[]; hrv: (number | null)[] }; // 14 days, oldest first
}): WeekBrief | null {
  const { nights } = args;
  const dayOf = (d: string, n: number) => { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10); };
  const thisDays = new Set(Array.from({ length: 7 }, (_, i) => dayOf(args.today, i + 1)));
  const prevDays = new Set(Array.from({ length: 7 }, (_, i) => dayOf(args.today, i + 8)));
  const nThis = nights.filter((n) => thisDays.has(n.date)), nPrev = nights.filter((n) => prevDays.has(n.date));
  if (nThis.length < 3 && args.daily.exercise.filter((v) => v !== null).length < 3) return null;
  const m = (xs: (number | null)[]) => avg(xs.filter((v): v is number => v !== null));
  const sum = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);
  const lines: WeekLine[] = [];
  const sleepNow = m(nThis.map((n) => n.totalMin)), sleepPrev = m(nPrev.map((n) => n.totalMin));
  if (sleepNow !== null) lines.push({ label: "Sleep a night", now: fmtMin(Math.round(sleepNow)), prev: sleepPrev !== null ? fmtMin(Math.round(sleepPrev)) : null, tone: sleepPrev === null ? "flat" : sleepNow - sleepPrev > 10 ? "pos" : sleepNow - sleepPrev < -10 ? "neg" : "flat" });
  const scNow = m(nThis.map((n) => n.score)), scPrev = m(nPrev.map((n) => n.score));
  if (scNow !== null) lines.push({ label: "Sleep score", now: String(Math.round(scNow)), prev: scPrev !== null ? String(Math.round(scPrev)) : null, tone: scPrev === null ? "flat" : scNow - scPrev > 3 ? "pos" : scNow - scPrev < -3 ? "neg" : "flat" });
  const exNow = sum(args.daily.exercise.slice(7)), exPrev = sum(args.daily.exercise.slice(0, 7));
  if (args.daily.exercise.some((v) => v !== null)) lines.push({ label: "Exercise", now: `${Math.round(exNow)} min`, prev: `${Math.round(exPrev)} min`, tone: exNow >= 150 ? "pos" : exNow < exPrev - 20 ? "neg" : "flat" });
  const stNow = m(args.daily.steps.slice(7)), stPrev = m(args.daily.steps.slice(0, 7));
  if (stNow !== null) lines.push({ label: "Steps a day", now: Math.round(stNow).toLocaleString("en-GB"), prev: stPrev !== null ? Math.round(stPrev).toLocaleString("en-GB") : null, tone: stPrev === null ? "flat" : stNow - stPrev > 800 ? "pos" : stNow - stPrev < -800 ? "neg" : "flat" });
  const rNow = m(args.daily.rhr.slice(7)), rPrev = m(args.daily.rhr.slice(0, 7));
  if (rNow !== null) lines.push({ label: "Resting HR", now: `${Math.round(rNow)} bpm`, prev: rPrev !== null ? `${Math.round(rPrev)} bpm` : null, tone: rPrev === null ? "flat" : rNow - rPrev <= -2 ? "pos" : rNow - rPrev >= 2 ? "neg" : "flat" });
  const hNow = m(args.daily.hrv.slice(7)), hPrev = m(args.daily.hrv.slice(0, 7));
  if (hNow !== null) lines.push({ label: "HRV", now: `${Math.round(hNow)} ms`, prev: hPrev !== null ? `${Math.round(hPrev)} ms` : null, tone: hPrev === null ? "flat" : hNow - hPrev >= 4 ? "pos" : hNow - hPrev <= -4 ? "neg" : "flat" });
  if (!lines.length) return null;
  const good = lines.filter((l) => l.tone === "pos").length, bad = lines.filter((l) => l.tone === "neg").length;
  const verdict = bad === 0 && good >= 2 ? "A better week than the one before · keep the same rhythm."
    : bad >= 2 ? "A heavier week: sleep and recovery slipped. Protect the next three nights before adding training."
    : exNow >= 150 && (sleepNow ?? 0) >= 420 ? "Enough movement and enough sleep · the week did its job."
    : exNow < 150 && (sleepNow ?? 0) >= 420 ? "Rested, under-moved. Two sessions next week put the 150 minutes back."
    : (sleepNow ?? 999) < 420 ? "Short on sleep. Nothing else fixes much until the nights are longer."
    : "A steady week, nothing moved far either way.";
  return { title: "This week", verdict, lines };
}
