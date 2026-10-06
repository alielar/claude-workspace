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

export type WeekKey = "sleep" | "score" | "exercise" | "steps" | "rhr" | "hrv";
export type WeekLine = { key: WeekKey; label: string; now: string; prev: string | null; tone: "pos" | "neg" | "flat"; nowV: number; prevV: number | null };
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
  if (sleepNow !== null) lines.push({ key: "sleep", nowV: sleepNow, prevV: sleepPrev, label: "Sleep a night", now: fmtMin(Math.round(sleepNow)), prev: sleepPrev !== null ? fmtMin(Math.round(sleepPrev)) : null, tone: sleepPrev === null ? "flat" : sleepNow - sleepPrev > 10 ? "pos" : sleepNow - sleepPrev < -10 ? "neg" : "flat" });
  const scNow = m(nThis.map((n) => n.score)), scPrev = m(nPrev.map((n) => n.score));
  if (scNow !== null) lines.push({ key: "score", nowV: scNow, prevV: scPrev, label: "Sleep score", now: String(Math.round(scNow)), prev: scPrev !== null ? String(Math.round(scPrev)) : null, tone: scPrev === null ? "flat" : scNow - scPrev > 3 ? "pos" : scNow - scPrev < -3 ? "neg" : "flat" });
  const exNow = sum(args.daily.exercise.slice(7)), exPrev = sum(args.daily.exercise.slice(0, 7));
  if (args.daily.exercise.some((v) => v !== null)) lines.push({ key: "exercise", nowV: exNow, prevV: exPrev, label: "Exercise", now: `${Math.round(exNow)} min`, prev: `${Math.round(exPrev)} min`, tone: exNow >= 150 ? "pos" : exNow < exPrev - 20 ? "neg" : "flat" });
  const stNow = m(args.daily.steps.slice(7)), stPrev = m(args.daily.steps.slice(0, 7));
  if (stNow !== null) lines.push({ key: "steps", nowV: stNow, prevV: stPrev, label: "Steps a day", now: Math.round(stNow).toLocaleString("en-GB"), prev: stPrev !== null ? Math.round(stPrev).toLocaleString("en-GB") : null, tone: stPrev === null ? "flat" : stNow - stPrev > 800 ? "pos" : stNow - stPrev < -800 ? "neg" : "flat" });
  const rNow = m(args.daily.rhr.slice(7)), rPrev = m(args.daily.rhr.slice(0, 7));
  if (rNow !== null) lines.push({ key: "rhr", nowV: rNow, prevV: rPrev, label: "Resting HR", now: `${Math.round(rNow)} bpm`, prev: rPrev !== null ? `${Math.round(rPrev)} bpm` : null, tone: rPrev === null ? "flat" : rNow - rPrev <= -2 ? "pos" : rNow - rPrev >= 2 ? "neg" : "flat" });
  const hNow = m(args.daily.hrv.slice(7)), hPrev = m(args.daily.hrv.slice(0, 7));
  if (hNow !== null) lines.push({ key: "hrv", nowV: hNow, prevV: hPrev, label: "HRV", now: `${Math.round(hNow)} ms`, prev: hPrev !== null ? `${Math.round(hPrev)} ms` : null, tone: hPrev === null ? "flat" : hNow - hPrev >= 4 ? "pos" : hNow - hPrev <= -4 ? "neg" : "flat" });
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

export type Change = { key: WeekKey; tone: "pos" | "neg" | "flat"; title: string; text: string };

/**
 * "What changed since last week" in sentences (REDESIGN 2026-10-07, Ali: "readings, not metrics ·
 * every number gets a plain name and one line on what it means for today's training"). Fixed rules
 * over the week brief's lines, so the same week reads the same every day.
 */
export function whatChanged(brief: WeekBrief): Change[] {
  const out: Change[] = [];
  for (const l of brief.lines) {
    const d = l.prevV === null ? null : l.nowV - l.prevV;
    const dir = (unit: string, dp = 0) => d === null ? "first week measured" : Math.abs(d) < (dp ? 0.05 : 0.5) ? "the same as last week" : `${d > 0 ? "up" : "down"} ${dp ? Math.abs(d).toFixed(dp) : Math.round(Math.abs(d))}${unit} from last week`;
    if (l.key === "sleep") {
      const dm = d === null ? null : Math.round(d);
      out.push({ key: l.key, tone: l.tone, title: `Sleep ${l.now} a night, ${dm === null ? "first week measured" : Math.abs(dm) < 10 ? "the same as last week" : `${dm > 0 ? "up" : "down"} ${Math.abs(dm)} min from last week`}.`,
        text: l.nowV >= 420 ? "Over seven hours. The one number that fixes every other one; keep the bedtime." : l.nowV >= 390 ? "Just under seven. Hard sessions cost more on short nights; the long run reads the same, the sprints a touch slower." : "Short. Under six and a half the body is still paying for the week before; protect the next three nights before adding training." });
    } else if (l.key === "score") {
      out.push({ key: l.key, tone: l.tone, title: `Sleep score ${l.now}, ${dir("")}.`, text: l.nowV >= 75 ? "Good nights on the whole: enough time, few wake-ups." : l.nowV >= 55 ? "Fair nights. Usually time in bed, not quality; fifteen minutes earlier moves this." : "Poor nights. Wake-ups or very short sleep; look at the bedtime spread and the last meal." });
    } else if (l.key === "exercise") {
      out.push({ key: l.key, tone: l.tone, title: `Exercise ${l.now}, ${dir(" min")}.`, text: l.nowV >= 150 ? "Above the 150-minute baseline. Keep the two rest days; the number is already there." : l.nowV >= 75 ? "Half the baseline. The program's five sessions cover it; the missing minutes are a session not done." : "A quiet week. One run and the functional session put most of it back." });
    } else if (l.key === "steps") {
      out.push({ key: l.key, tone: l.tone, title: `${l.now} steps a day, ${dir("")}.`, text: l.nowV >= 7000 ? "Enough walking; most of the benefit sits between 7,000 and 10,000." : l.nowV >= 4000 ? "A sitting week with some walking. A 20-minute walk after lunch adds about 2,500." : "A sitting week. The cheapest change in the whole page: a walk a day." });
    } else if (l.key === "rhr") {
      out.push({ key: l.key, tone: l.tone, title: `Resting heart rate ${l.now}, ${dir("")}.`, text: d !== null && d <= -2 ? "Fitter or better rested; both are good news. Expect it to climb back after a hard week." : d !== null && d >= 2 ? "Higher means strain: a hard week, short nights, a drink, or something coming. Two more days up means rest." : "Steady. The body took the week as planned." });
    } else if (l.key === "hrv") {
      out.push({ key: l.key, tone: l.tone, title: `HRV ${l.now}, ${dir(" ms")}.`, text: d !== null && d >= 4 ? "The nervous system handled the sessions well; a good week to keep the plan." : d !== null && d <= -4 ? "Lower means less recovered. Keep the intensity, drop the volume this week." : "Steady, which is the point. Only your own range is a fair comparison." });
    }
  }
  return out;
}
