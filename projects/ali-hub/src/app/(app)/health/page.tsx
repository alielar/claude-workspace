"use client";

/**
 * /health · the Health tab, rebuilt 2026-09-30 as a daily CHECKUP (Ali: "too many metrics,
 * what do they imply, am I in a safe range · make it interesting to go through every day").
 *   Checkup  · one ring with three arcs, Recovery · Sleep · Movement, each in its state's colour
 *              (green in range, amber one thing off, red several), a headline in plain words and
 *              one sentence on what to do with the day. Tap a signal → its chapter.
 *   Recovery · the checks Apple runs on you every night, one tile each: the number, a strip with
 *              your typical range (mean ± 1.5 SD of the previous 28 values, drawn after 7) and
 *              tonight's dot, "in your range" / "high for you". Tap a tile → the 30-day line with
 *              your range as the band, the typical adult range when medicine has one, and one
 *              fixed line on what the number means.
 *   Sleep    · last night (score ring, hours, the stage bar), 7 or 30 nights, the streak.
 *   Movement · today's rings against your own averages and Apple's targets, the week's
 *              exercise minutes against 150, 14 days of steps.
 *   Fitness  · the slow numbers (VO2 max, cardio recovery, walking HR, walking speed).
 *   All measures · everything else the Watch sends, folded away.
 * Everything comes from /api/health/summary, phone copy first. Nothing here is judged by an
 * AI · the sentences are fixed rules (`dayRead`, `vitalsRead`, `nightVerdict`, `insightsFor`,
 * `weekBrief`), so the same night reads the same every day. Motion in checkup.tsx.
 *
 * 2026-10-03 (Ali): a GRID instead of one long scroll · the important things sit at the top,
 * small panels share a row. Order: Checkup · Insights (what is off, what to do) · Last night and
 * Today side by side · This week (the weekly health brief) · Recovery tiles · Sleep history ·
 * Movement · Fitness and All measures folded. `.h-grid` in globals.css: two columns on the phone
 * (small panels take one, the rest span both), three from 760 px.
 */

import { useState } from "react";
import { useHealthSummary } from "@/lib/health/useHealth";
import {
  METRIC_INFO, RANGE_DAYS, STAGES, avg, dayRead, deltaLine, fmtDay, fmtDelta, fmtMetric, fmtMin, fmtTime,
  metricKey, metricValue, movementSignal, nightVerdict, pipeNote, recoverySignal, sleepSignal, sleepStreak, typicalRange, vitalState, vitalsRead,
  type HealthSummary, type MetricInfo, type NightRow, type Signal, type VitalState,
} from "@/lib/health/client";
import { Bars, Line, RangeBar, Spark, StageBar } from "@/components/health/charts";
import { CheckupRing, CountUp, Fold, MiniRing, Reveal, StateDot } from "@/components/health/checkup";
import { checklistToday } from "@/lib/checklist/day";
import { useNow } from "@/lib/useClientValue";
import { insightsFor, weekBrief, type Insight } from "@/lib/health/insights";

function scoreTone(s: number | null): string {
  return s === null ? "var(--ink-3)" : s >= 75 ? "var(--pos)" : s >= 55 ? "var(--warn)" : "var(--neg)";
}

function lastNDays(n: number, today: string): string[] {
  const out: string[] = [];
  const d = new Date(today + "T12:00:00");
  for (let i = n - 1; i >= 0; i--) { const x = new Date(d); x.setDate(d.getDate() - i); out.push(x.toISOString().slice(0, 10)); }
  return out;
}
const dow = (date: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(new Date(date + "T12:00:00")).slice(0, 2);
const dm = (date: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(date + "T12:00:00"));
const longDay = (date: string) => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date(date + "T12:00:00"));

type Series = HealthSummary["metrics"][string];

/** The metrics we know, keyed by our name (HAE's naming variants folded in). */
function knownMetrics(metrics: HealthSummary["metrics"]): Record<string, Series> {
  const out: Record<string, Series> = {};
  for (const [name, s] of Object.entries(metrics)) { const k = metricKey(name); if (k) out[k] = s; }
  return out;
}
function seriesValues(s: Series, info: MetricInfo): { date: string; v: number }[] {
  return s.points.map((p) => ({ date: p.date, v: metricValue(p, info, s.units) })).filter((p): p is { date: string; v: number } => p.v !== null);
}
function valueOn(s: Series | undefined, info: MetricInfo, date: string): number | null {
  const p = s?.points.find((x) => x.date === date);
  return p ? metricValue(p, info, s!.units) : null;
}

// ── Checkup · the hero ───────────────────────────────────────────────────────

function Checkup({ read, today }: { read: ReturnType<typeof dayRead>; today: string }) {
  const go = (s: Signal) => document.getElementById(`h-${s.key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <section className="cc-card">
      <div className="cc-card-body" style={{ display: "grid", gap: 16, padding: "18px 16px 14px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 18, alignItems: "center" }}>
          <CheckupRing signals={read.signals} onPick={go} />
          <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
            <span style={{ fontSize: 13, color: "var(--ink-4)" }}>{longDay(today)}</span>
            <span style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.15 }}>{read.headline}</span>
            <span style={{ fontSize: 15, color: "var(--ink-2)", lineHeight: 1.45 }}>{read.line}</span>
          </div>
        </div>
        <div style={{ display: "grid", gap: 2 }}>
          {read.signals.map((s) => (
            <button key={s.key} onClick={() => go(s)}
              style={{ display: "grid", gridTemplateColumns: "auto 92px 1fr auto", gap: 10, alignItems: "center", minHeight: 44, padding: "0 4px", background: "none", border: "none", borderRadius: 10, color: "inherit", textAlign: "left", cursor: "pointer", font: "inherit" }}>
              <StateDot state={s.state} />
              <span style={{ fontSize: 15, fontWeight: 500 }}>{s.label}</span>
              <span className="tabular-nums" style={{ fontSize: 14, color: s.state === "wait" ? "var(--ink-4)" : "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.text}</span>
              <span aria-hidden style={{ color: "var(--ink-4)", fontSize: 14 }}>›</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Insights · what is off and what to do (fixed rules, insights.ts) ──────────

function Insights({ items }: { items: Insight[] }) {
  const color = (t: Insight["tone"]) => (t === "pos" ? "var(--pos)" : t === "neg" ? "var(--neg)" : t === "warn" ? "var(--warn)" : "var(--violet)");
  return (
    <section className="cc-card">
      <div className="cc-card-head"><span className="title">What to do</span><span className="tail">{items.length === 1 && items[0].tone === "pos" ? "all clear" : `${items.length} thing${items.length === 1 ? "" : "s"}`}</span></div>
      <div className="cc-card-body" style={{ display: "grid", gap: 12 }}>
        {items.map((it) => (
          <div key={it.key} style={{ display: "grid", gridTemplateColumns: "10px 1fr", gap: 10, alignItems: "start" }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 99, background: color(it.tone), marginTop: 7 }} />
            <span style={{ display: "grid", gap: 3 }}>
              <span style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.3 }}>{it.title}</span>
              <span style={{ fontSize: 14.5, color: "var(--ink-2)", lineHeight: 1.5 }}>{it.text}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** The weekly health brief · the last 7 full days against the 7 before. */
function Week({ brief }: { brief: ReturnType<typeof weekBrief> }) {
  if (!brief) return null;
  const tone = (t: "pos" | "neg" | "flat") => (t === "pos" ? "var(--pos)" : t === "neg" ? "var(--neg)" : "var(--ink-3)");
  return (
    <section className="cc-card">
      <div className="cc-card-head"><span className="title">{brief.title}</span><span className="tail">vs the week before</span></div>
      <div className="cc-card-body" style={{ display: "grid", gap: 10 }}>
        <div style={{ fontSize: 15, color: "var(--ink-2)", lineHeight: 1.5 }}>{brief.verdict}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
          {brief.lines.map((l) => (
            <div key={l.label} style={{ display: "grid", gap: 2, padding: "8px 10px", borderRadius: 10, background: "var(--fill-1)", minWidth: 0 }}>
              <span style={{ fontSize: 12, color: "var(--ink-4)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.label}</span>
              <span className="tabular-nums" style={{ fontSize: 16, fontWeight: 600, whiteSpace: "nowrap" }}>{l.now}</span>
              {l.prev && <span className="tabular-nums" style={{ fontSize: 12, color: tone(l.tone), whiteSpace: "nowrap" }}>{l.tone === "pos" ? "↑" : l.tone === "neg" ? "↓" : "="} {l.prev}</span>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Small panel · last night at a glance. */
function NightTile({ n, today }: { n: NightRow; today: string }) {
  return (
    <section className="cc-card" style={{ padding: "14px 14px 12px", display: "grid", gap: 8, alignContent: "start" }}>
      <span style={{ fontSize: 13, color: "var(--ink-3)" }}>Last night · {fmtDay(n.date, today).toLowerCase()}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <ScoreRing score={n.score} />
        <span className="tabular-nums" style={{ display: "grid", gap: 2 }}>
          <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1 }}><CountUp value={n.totalMin} fmt={(v) => fmtMin(Math.round(v))} /></span>
          <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>asleep</span>
        </span>
      </div>
      <span style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.4 }}>{nightVerdict(n)}</span>
    </section>
  );
}

/** Small panel · today's movement rings. */
function TodayTile({ known, today }: { known: Record<string, Series>; today: string }) {
  const ex = known.apple_exercise_time ? valueOn(known.apple_exercise_time, METRIC_INFO.apple_exercise_time, today) : null;
  const st = known.step_count ? valueOn(known.step_count, METRIC_INFO.step_count, today) : null;
  const stMean = known.step_count ? avg(seriesValues(known.step_count, METRIC_INFO.step_count).filter((p) => p.date !== today).slice(-7).map((p) => p.v)) : null;
  return (
    <section className="cc-card" style={{ padding: "14px 14px 12px", display: "grid", gap: 8, alignContent: "start" }}>
      <span style={{ fontSize: 13, color: "var(--ink-3)" }}>Today so far</span>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <MiniRing value={ex} target={30} fmt={(v) => String(Math.round(v))} label="exercise" sub="of 30 min" size={64} />
        <MiniRing value={st} target={stMean && stMean > 0 ? stMean : null} fmt={(v) => `${(Math.round(v) / 1000).toFixed(1)}k`} label="steps" sub={stMean ? `avg ${(Math.round(stMean) / 1000).toFixed(1)}k` : ""} size={64} />
      </div>
    </section>
  );
}

// ── Recovery · the night's checks as tiles ───────────────────────────────────

type VitalRow = { key: string; label: string; info: MetricInfo | null; value: number | null; text: string; unit: string; dp?: number; range: { lo: number; hi: number } | null; state: VitalState | null; n: number; date: string | null; pts: { date: string; v: number }[] };

function vitalRows(known: Record<string, Series>, nights: NightRow[]): VitalRow[] {
  const rows: VitalRow[] = [];
  const hrs = [...nights].reverse().map((n) => ({ date: n.date, v: n.totalMin !== null ? n.totalMin / 60 : null })).filter((p): p is { date: string; v: number } => p.v !== null);
  if (hrs.length) {
    const last = hrs[hrs.length - 1], range = typicalRange(hrs.slice(0, -1).map((p) => p.v), 0.75);
    rows.push({ key: "sleep", label: "Sleep", info: null, value: last.v, text: fmtMin(Math.round(last.v * 60)), unit: "h", dp: 1, range, state: range ? vitalState(last.v, range) : null, n: hrs.length, date: last.date, pts: hrs });
  }
  for (const [k, info] of Object.entries(METRIC_INFO)) {
    if (!info.vital || !known[k]) continue;
    const pts = seriesValues(known[k], info);
    if (!pts.length) continue;
    const last = pts[pts.length - 1], range = typicalRange(pts.slice(0, -1).map((p) => p.v), info.floor);
    rows.push({ key: k, label: info.short ?? info.label, info, value: last.v, text: fmtMetric(last.v, info.unit, info.dp), unit: info.unit, dp: info.dp, range, state: range ? vitalState(last.v, range) : null, n: pts.length, date: last.date, pts });
  }
  return rows;
}

function stateWords(r: VitalRow): { text: string; color: string } {
  if (r.state === null) return { text: `day ${r.n} of ${RANGE_DAYS}`, color: "var(--ink-4)" };
  if (r.state === "typical") return { text: "in your range", color: "var(--pos)" };
  return { text: `${r.state} for you`, color: "var(--warn)" };
}

function Recovery({ rows, today, days30 }: { rows: VitalRow[]; today: string; days30: string[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const latest = rows.map((r) => r.date).filter((d): d is string => d !== null).sort().pop() ?? null;
  const sel = rows.find((r) => r.key === open) ?? null;
  const pts = sel ? days30.map((d) => ({ label: dm(d), v: sel.pts.find((p) => p.date === d)?.v ?? null })) : [];
  const fmtV = (r: VitalRow) => (v: number) => r.key === "sleep" ? fmtMin(Math.round(v * 60)) : fmtMetric(v, r.unit, r.dp);
  const safe = sel?.info?.safe ?? (sel?.key === "sleep" ? { lo: 7, hi: 9, text: "Adults need 7 to 9 h" } : undefined);
  return (
    <section className="cc-card">
      <div className="cc-card-head"><span className="title">Recovery</span><span className="tail">{latest ? `night checks · ${fmtDay(latest, today).toLowerCase()}` : ""}</span></div>
      <div className="cc-card-body" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
          {rows.map((r) => {
            const w = stateWords(r), on = open === r.key;
            return (
              <button key={r.key} className="cc-h-tile" onClick={() => setOpen(on ? null : r.key)} aria-expanded={on}
                style={{ display: "grid", gap: 6, padding: "12px 12px 10px", minHeight: 44, textAlign: "left", borderRadius: 12, border: `1px solid ${on ? "var(--violet)" : "var(--line)"}`, background: on ? "var(--accent-soft)" : "var(--fill-1)", color: "inherit", cursor: "pointer", font: "inherit", minWidth: 0 }}>
                <span style={{ fontSize: 13, color: "var(--ink-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</span>
                <span className="tabular-nums" style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1, whiteSpace: "nowrap" }}>
                  {r.key === "sleep" ? <CountUp value={r.value === null ? null : Math.round(r.value * 60)} fmt={(v) => fmtMin(Math.round(v))} /> : <CountUp value={r.value} fmt={(v) => fmtMetric(r.dp === undefined ? Math.round(v) : v, r.unit, r.dp)} />}
                </span>
                <RangeBar value={r.value} range={r.range} outside={r.state !== null && r.state !== "typical"} />
                <span style={{ fontSize: 12, fontWeight: 500, color: w.color }}>{w.text}</span>
              </button>
            );
          })}
        </div>
        <Fold open={sel !== null}>
          {sel && (
            <div style={{ display: "grid", gap: 10, padding: "4px 0 2px" }}>
              <Spark points={pts} band={sel.range ? [sel.range.lo, sel.range.hi] : null} fmt={fmtV(sel)} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={{ display: "grid", gap: 2 }}>
                  <span style={{ fontSize: 12, color: "var(--ink-4)" }}>Your range</span>
                  <span className="tabular-nums" style={{ fontSize: 14, color: "var(--ink-2)" }}>{sel.range ? `${fmtV(sel)(sel.range.lo)} to ${fmtV(sel)(sel.range.hi)}` : `after ${RANGE_DAYS} nights`}</span>
                </div>
                <div style={{ display: "grid", gap: 2 }}>
                  <span style={{ fontSize: 12, color: "var(--ink-4)" }}>Typical adult</span>
                  <span className="tabular-nums" style={{ fontSize: 14, color: "var(--ink-2)" }}>{safe ? ("lo" in safe ? `${fmtMetric(safe.lo, "", sel.dp)} to ${fmtMetric(safe.hi, sel.unit, sel.dp)}` : safe.text) : "no standard"}</span>
                </div>
              </div>
              {safe && "lo" in safe && safe.text && <div style={{ fontSize: 13, color: "var(--ink-3)" }}>{safe.text}</div>}
              <div style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.45 }}>{sel.info?.meaning ?? "Time asleep, all stages together. Seven hours or more most nights is the target; one short night costs little, a week of them adds up."}</div>
            </div>
          )}
        </Fold>
        <div style={{ fontSize: 15, color: "var(--ink-2)", lineHeight: 1.45 }}>{vitalsRead(rows)}</div>
      </div>
    </section>
  );
}

// ── Sleep ────────────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number | null }) {
  return (
    <MiniRing value={score} target={100} fmt={(v) => String(Math.round(v))} label="score" size={84} color={scoreTone(score)} />
  );
}

function Sleep({ nights, today, days7, days30 }: { nights: NightRow[]; today: string; days7: string[]; days30: string[] }) {
  const [span, setSpan] = useState<"7" | "30">("7");
  const n = nights[0];
  const byDate = new Map(nights.map((x) => [x.date, x]));
  const hours7 = days7.map((d) => { const x = byDate.get(d); return x?.totalMin != null ? x.totalMin / 60 : null; });
  const avg7 = avg(hours7.filter((h): h is number => h !== null));
  const score30 = days30.map((d) => ({ label: dm(d), v: byDate.get(d)?.score ?? null }));
  const avgScore30 = avg(nights.map((x) => x.score).filter((s): s is number => s !== null));
  const bedtimes = nights.map((x) => x.inBedStart ?? x.sleepStart).filter((t): t is number => t !== null).map((t) => { const d = new Date(t); const h = d.getHours() + d.getMinutes() / 60; return h < 12 ? h + 24 : h; });
  const bedSpread = bedtimes.length >= 3 ? Math.round((Math.max(...bedtimes) - Math.min(...bedtimes)) * 60) : null;
  const streak = sleepStreak(nights);
  const best = nights.reduce<NightRow | null>((b, x) => (x.totalMin !== null && (b === null || x.totalMin > (b.totalMin ?? 0)) ? x : b), null);
  return (
    <section className="cc-card">
      <div className="cc-card-head"><span className="title">Sleep</span><span className="tail">{fmtDay(n.date, today)}</span></div>
      <div className="cc-card-body" style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 16, alignItems: "center" }}>
          <ScoreRing score={n.score} />
          <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
            <span style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.1 }} className="tabular-nums">
              <CountUp value={n.totalMin} fmt={(v) => fmtMin(Math.round(v))} /> <span style={{ fontSize: 14, fontWeight: 400, color: "var(--ink-3)" }}>asleep</span>
            </span>
            <span style={{ fontSize: 14, color: "var(--ink-3)" }} className="tabular-nums">
              in bed {fmtMin(n.inBedMin)} · {fmtTime(n.inBedStart ?? n.sleepStart)} to {fmtTime(n.sleepEnd ?? n.inBedEnd)}
            </span>
            <span style={{ fontSize: 15, color: "var(--ink-2)" }}>{nightVerdict(n)}</span>
          </div>
        </div>
        <StageBar n={n} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {STAGES.map((s) => (
            <div key={s.key} style={{ display: "grid", gap: 2 }}>
              <span className="tabular-nums" style={{ fontSize: 17, fontWeight: 600 }}>{fmtMin(n[s.key])}</span>
              <span style={{ fontSize: 12, color: "var(--ink-3)", display: "inline-flex", alignItems: "center", gap: 5 }}><span aria-hidden style={{ width: 7, height: 7, borderRadius: 2, background: s.color }} />{s.label}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, paddingTop: 4, borderTop: "1px solid var(--line)" }}>
          <div role="tablist" aria-label="Span" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, padding: 3, borderRadius: 10, background: "var(--fill-1)" }}>
            {(["7", "30"] as const).map((k) => (
              <button key={k} role="tab" aria-selected={span === k} onClick={() => setSpan(k)}
                style={{ minHeight: 32, padding: "0 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: span === k ? "var(--bg-card)" : "transparent", color: span === k ? "var(--ink)" : "var(--ink-3)", boxShadow: span === k ? "0 1px 2px rgba(0,0,0,.18)" : "none" }}>
                {k} nights
              </button>
            ))}
          </div>
          <span className="tabular-nums" style={{ fontSize: 13, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
            {span === "7" ? (avg7 !== null ? `avg ${fmtMin(Math.round(avg7 * 60))}` : "") : avgScore30 !== null ? `avg score ${Math.round(avgScore30)}` : ""}
          </span>
        </div>
        {span === "7"
          ? <Bars values={hours7} labels={days7.map(dow)} target={8} fmt={(h, i) => { const sc = byDate.get(days7[i])?.score; return `${fmtMin(Math.round(h * 60))} asleep${sc != null ? ` · score ${sc}` : ""}`; }} />
          : <Spark points={score30} fmt={(v) => `score ${Math.round(v)}`} />}

        <div style={{ display: "grid", gap: 6, fontSize: 14, color: "var(--ink-3)", lineHeight: 1.45 }}>
          {streak >= 2 && <span><span style={{ color: "var(--pos)", fontWeight: 600 }} className="tabular-nums">{streak} nights</span> in a row over 7 h.</span>}
          {streak < 2 && n.totalMin !== null && n.totalMin >= 420 && <span>First night over 7 h · two more makes a streak.</span>}
          {best && best.totalMin !== null && nights.length >= 7 && <span className="tabular-nums">Longest this month · {fmtMin(best.totalMin)} on {fmtDay(best.date, today).toLowerCase()}.</span>}
          {bedSpread !== null && span === "30" && <span>Bedtime moves by up to {bedSpread >= 60 ? `${Math.floor(bedSpread / 60)} h ${bedSpread % 60 ? `${bedSpread % 60} min` : ""}` : `${bedSpread} min`}{bedSpread > 90 ? " · a steadier bedtime is the cheapest way to sleep better" : ""}.</span>}
        </div>
      </div>
    </section>
  );
}

// ── Movement · today's rings, the week, 14 days of steps ─────────────────────

const ACTIVITY_TILES = ["step_count", "active_energy", "apple_exercise_time", "apple_stand_hour"] as const;

function Movement({ known, today, days14 }: { known: Record<string, Series>; today: string; days14: string[] }) {
  const tiles = ACTIVITY_TILES.filter((k) => known[k]).map((k) => {
    const info = METRIC_INFO[k], pts = seriesValues(known[k], info);
    const last = pts[pts.length - 1] ?? null;
    const earlier = pts.filter((p) => last && p.date !== last.date).slice(-7).map((p) => p.v);
    return { k, info, last, mean: avg(earlier) };
  });
  if (!tiles.length) return null;
  const latest = tiles.map((t) => t.last?.date).filter((d): d is string => !!d).sort().pop() ?? null;
  const stepVals = known.step_count ? days14.map((d) => valueOn(known.step_count, METRIC_INFO.step_count, d)) : null;
  // The week's exercise minutes (Monday to today) against the 150-minute baseline.
  const dowIdx = (new Date(today + "T12:00:00").getDay() + 6) % 7;
  const weekDays = days14.slice(days14.length - 1 - dowIdx);
  const weekEx = known.apple_exercise_time ? weekDays.map((d) => valueOn(known.apple_exercise_time, METRIC_INFO.apple_exercise_time, d) ?? 0).reduce((a, b) => a + b, 0) : null;
  const ringFor = (t: (typeof tiles)[number]) => {
    const v = t.last?.v ?? null;
    if (t.k === "apple_exercise_time") return { target: 30, sub: "of 30 min" };
    if (t.k === "apple_stand_hour") return { target: 12, sub: "of 12 h" };
    const target = t.mean !== null && t.mean > 0 ? t.mean : null;
    return { target, sub: target !== null ? `avg ${fmtMetric(target, "", t.info.dp)}` : v !== null ? "first day" : "" };
  };
  return (
    <section className="cc-card">
      <div className="cc-card-head"><span className="title">Movement</span><span className="tail">{latest ? (latest === today ? "today so far" : fmtDay(latest, today).toLowerCase()) : ""}</span></div>
      <div className="cc-card-body" style={{ display: "grid", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(tiles.length, 4)}, 1fr)`, gap: 6 }}>
          {tiles.map((t) => {
            const r = ringFor(t);
            return <MiniRing key={t.k} value={t.last?.v ?? null} target={r.target} fmt={(v) => fmtMetric(t.info.dp === undefined ? Math.round(v) : v, "", t.info.dp)} label={t.info.short ?? t.info.label} sub={r.sub} size={70} />;
          })}
        </div>
        {weekEx !== null && (
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--ink-3)" }} className="tabular-nums">
              <span>This week · exercise</span>
              <span style={{ color: weekEx >= 150 ? "var(--pos)" : "var(--ink-2)" }}>{Math.round(weekEx)} of 150 min</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: "var(--fill-2)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(100, (weekEx / 150) * 100)}%`, background: weekEx >= 150 ? "var(--pos)" : "var(--violet)", borderRadius: 3, transition: "width 900ms var(--easeOut) 300ms" }} />
            </div>
          </div>
        )}
        {stepVals && stepVals.some((v) => v !== null) && (
          <div style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, color: "var(--ink-3)" }}>14 days of steps</span>
            <Bars values={stepVals} labels={days14.map(dow)} height={64} target={7000} fmt={(v) => `${Math.round(v).toLocaleString("en-GB")} steps`} />
          </div>
        )}
      </div>
    </section>
  );
}

// ── One metric row · compact, tap for the detail ─────────────────────────────

function MetricRow({ k, info, s, today, days30 }: { k: string; info: MetricInfo; s: Series; today: string; days30: string[] }) {
  const [open, setOpen] = useState(false);
  const dl = deltaLine(s.points, info, s.units);
  const lastPt = s.points[s.points.length - 1] ?? null;
  const pts = days30.map((d) => ({ label: dm(d), v: valueOn(s, info, d) }));
  const vals = pts.map((p) => p.v).filter((v): v is number => v !== null);
  const range = typicalRange(vals.slice(0, -1), info.floor);
  const isRange = k === "heart_rate" && lastPt && (lastPt.min !== null || lastPt.max !== null);
  const value = isRange ? `${lastPt!.min ?? "—"} to ${lastPt!.max ?? "—"} bpm` : fmtMetric(dl.latest, info.unit, info.dp);
  const arrow = dl.tone === "flat" || dl.delta === null ? "" : dl.delta > 0 ? "↑ " : "↓ ";
  const sub = isRange
    ? `avg ${lastPt!.avg !== null ? Math.round(lastPt!.avg) : "—"} bpm`
    : dl.delta !== null && dl.mean30 !== null
    ? `${arrow}${fmtDelta(dl.delta, info.dp)} vs your 30 days`
    : `day ${dl.n} of ${RANGE_DAYS}${lastPt ? ` · ${fmtDay(lastPt.date, today).toLowerCase()}` : ""}`;
  const tone = isRange ? "var(--ink-3)" : dl.tone === "pos" ? "var(--pos)" : dl.tone === "neg" ? "var(--neg)" : "var(--ink-3)";
  return (
    <div style={{ borderBottom: "1px solid var(--line)" }}>
      <button onClick={() => setOpen(!open)} aria-expanded={open}
        style={{ display: "grid", gridTemplateColumns: "1fr auto 64px", gap: 12, alignItems: "center", width: "100%", minHeight: 56, padding: "8px 0", background: "none", border: "none", color: "inherit", textAlign: "left", cursor: "pointer", font: "inherit" }}>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 16, fontWeight: 500 }}>{info.label}</span>
          <span className="tabular-nums" style={{ display: "block", fontSize: 13, color: tone }}>{sub}</span>
        </span>
        <span className="tabular-nums" style={{ fontSize: 17, fontWeight: 600, whiteSpace: "nowrap", textAlign: "right" }}>{value}</span>
        <Line points={pts.map((p) => p.v)} />
      </button>
      <Fold open={open}>
        <div style={{ display: "grid", gap: 10, padding: "2px 0 14px" }}>
          <Spark points={pts} band={range ? [range.lo, range.hi] : null} fmt={(v) => fmtMetric(v, info.unit, info.dp)} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ display: "grid", gap: 2 }}>
              <span style={{ fontSize: 12, color: "var(--ink-4)" }}>Your range</span>
              <span className="tabular-nums" style={{ fontSize: 14, color: "var(--ink-2)" }}>{range ? `${fmtMetric(range.lo, "", info.dp)} to ${fmtMetric(range.hi, info.unit, info.dp)}` : `after ${RANGE_DAYS} days`}</span>
            </div>
            {info.safe && (
              <div style={{ display: "grid", gap: 2 }}>
                <span style={{ fontSize: 12, color: "var(--ink-4)" }}>Typical adult</span>
                <span className="tabular-nums" style={{ fontSize: 14, color: "var(--ink-2)" }}>{"lo" in info.safe ? `${fmtMetric(info.safe.lo, "", info.dp)} to ${fmtMetric(info.safe.hi, info.unit, info.dp)}` : info.safe.text}</span>
              </div>
            )}
          </div>
          <div style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.45 }}>{info.meaning}</div>
        </div>
      </Fold>
    </div>
  );
}

function RowsCard({ title, tail, keys, known, today, days30, closed }: { title: string; tail?: string; keys: string[]; known: Record<string, Series>; today: string; days30: string[]; closed?: boolean }) {
  const [open, setOpen] = useState(!closed);
  if (!keys.length) return null;
  return (
    <section className="cc-card">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="cc-card-head" style={{ width: "100%", background: "none", color: "inherit", cursor: "pointer", font: "inherit", borderLeft: "none", borderRight: "none", borderTop: "none", borderBottom: open ? undefined : "none", borderRadius: open ? undefined : "inherit" }}>
        <span className="title">{title}</span>
        <span className="tail">{tail ?? `${keys.length} measure${keys.length === 1 ? "" : "s"}`} <span aria-hidden style={{ display: "inline-block", transition: "transform var(--t-2) var(--easeOut)", transform: open ? "rotate(90deg)" : "none", marginLeft: 6 }}>›</span></span>
      </button>
      <Fold open={open}>
        <div style={{ padding: "0 14px" }}>
          {keys.map((k) => <MetricRow key={k} k={k} info={METRIC_INFO[k]} s={known[k]} today={today} days30={days30} />)}
        </div>
      </Fold>
    </section>
  );
}

// ── The page ─────────────────────────────────────────────────────────────────

const FITNESS_KEYS = ["vo2_max", "cardio_recovery", "walking_heart_rate_average", "walking_speed", "six_minute_walking_test_distance"];

export default function HealthPage() {
  const { data, loading } = useHealthSummary();
  const today = checklistToday();
  const nights = data?.nights ?? [];
  const last = nights[0] ?? null;
  const days7 = lastNDays(7, today), days14 = lastNDays(14, today), days30 = lastNDays(30, today);

  const known = data?.metrics ? knownMetrics(data.metrics) : {};
  const knownKeys = Object.keys(known);
  const unknown = data?.metrics ? Object.keys(data.metrics).filter((k) => !metricKey(k) && k !== "sleep_analysis") : [];
  const vitals = vitalRows(known, nights);
  const empty = !loading && data && nights.length === 0 && knownKeys.length === 0 && unknown.length === 0;
  const now = useNow();
  const note = data && nights.length === 0 && now ? pipeNote(data.pipe, "sleep", now) : null;

  // The three signals · movement from the last 7 full days (today is only partly measured).
  const full7 = lastNDays(8, today).slice(0, 7);
  const ex7 = known.apple_exercise_time ? full7.map((d) => valueOn(known.apple_exercise_time, METRIC_INFO.apple_exercise_time, d)).filter((v): v is number => v !== null) : [];
  const st7 = known.step_count ? full7.map((d) => valueOn(known.step_count, METRIC_INFO.step_count, d)).filter((v): v is number => v !== null) : [];
  const recovery = recoverySignal(vitals);
  const offRow = vitals.find((r) => r.state !== null && r.state !== "typical");
  const read = dayRead(recovery, sleepSignal(last, today), movementSignal(ex7, st7), offRow ? offRow.label : undefined);

  const fitnessKeys = FITNESS_KEYS.filter((k) => known[k]);
  const restKeys = Object.keys(METRIC_INFO).filter((k) => known[k] && !METRIC_INFO[k].vital && !(ACTIVITY_TILES as readonly string[]).includes(k) && !FITNESS_KEYS.includes(k));
  const hasAny = nights.length > 0 || knownKeys.length > 0;

  // Insights + the weekly brief (fixed rules · insights.ts)
  const dowIdx = (new Date(today + "T12:00:00").getDay() + 6) % 7;
  const weekDays = days14.slice(days14.length - 1 - dowIdx);
  const weekEx = known.apple_exercise_time ? weekDays.map((d) => valueOn(known.apple_exercise_time, METRIC_INFO.apple_exercise_time, d) ?? 0).reduce((a, b) => a + b, 0) : null;
  const insights = hasAny ? insightsFor({ vitals, night: last, nights, exerciseWeekMin: weekEx, steps7: st7, today }) : [];
  const series14 = (k: string) => (known[k] ? days14.map((d) => valueOn(known[k], METRIC_INFO[k], d)) : days14.map(() => null));
  const week = hasAny ? weekBrief({ nights, today, daily: { exercise: series14("apple_exercise_time"), steps: series14("step_count"), rhr: series14("resting_heart_rate"), hrv: series14("heart_rate_variability") } }) : null;
  let i = 0;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="cc-pagetitle" style={{ marginBottom: 0 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600 }}>Health</h1>
          <div className="sub">{data ? `${nights.length} night${nights.length === 1 ? "" : "s"} · ${knownKeys.length} measure${knownKeys.length === 1 ? "" : "s"} from the Watch` : "—"}</div>
        </div>
      </div>

      {note && <div style={{ fontSize: 15, color: "var(--warn)", padding: "0 2px", lineHeight: 1.45 }}>{note}</div>}
      {empty && !note && <div style={{ fontSize: 15, color: "var(--ink-3)", padding: "0 2px" }}>Nothing from the Watch yet. Tonight&apos;s sleep lands in the morning.</div>}
      {!data && loading && <div className="cc-skeleton" style={{ height: 200 }} />}

      <div className="h-grid">
        {hasAny && <div className="h-span"><Reveal i={i++}><Checkup read={read} today={today} /></Reveal></div>}
        {insights.length > 0 && <div className="h-span"><Reveal i={i++}><Insights items={insights} /></Reveal></div>}
        {last && <Reveal i={i++}><NightTile n={last} today={today} /></Reveal>}
        {ACTIVITY_TILES.some((k) => known[k]) && <Reveal i={i++}><TodayTile known={known} today={today} /></Reveal>}
        {week && <div className="h-span"><Reveal i={i++}><Week brief={week} /></Reveal></div>}
        {vitals.length > 0 && <div className="h-span"><Reveal i={i++} id="h-recovery"><Recovery rows={vitals} today={today} days30={days30} /></Reveal></div>}
        {last && <div className="h-span h-half"><Reveal i={i++} id="h-sleep"><Sleep nights={nights} today={today} days7={days7} days30={days30} /></Reveal></div>}
        {ACTIVITY_TILES.some((k) => known[k]) && <div className="h-span h-half"><Reveal i={i++} id="h-movement"><Movement known={known} today={today} days14={days14} /></Reveal></div>}
        {fitnessKeys.length > 0 && <div className="h-span"><Reveal i={i++}><RowsCard title="Fitness" tail="slow numbers · months, not days" keys={fitnessKeys} known={known} today={today} days30={days30} closed /></Reveal></div>}
        {(restKeys.length > 0 || unknown.length > 0) && (
          <div className="h-span"><Reveal i={i++}>
            <RowsCard title="All measures" keys={restKeys} known={known} today={today} days30={days30} closed />
            {unknown.length > 0 && (
              <section className="cc-card" style={{ marginTop: 14 }}>
                <div className="cc-card-head"><span className="title">Also received</span></div>
                <div className="cc-card-body" style={{ display: "grid", gap: 6, fontSize: 14, color: "var(--ink-3)" }}>
                  {unknown.map((k) => { const p = data!.metrics[k].points; const l = p[p.length - 1]; return <span key={k} className="tabular-nums">{k.replace(/_/g, " ")} · {fmtMetric(l?.qty ?? l?.avg ?? null, data!.metrics[k].units ?? "")} · {l ? fmtDay(l.date, today) : ""}</span>; })}
                </div>
              </section>
            )}
          </Reveal></div>
        )}
      </div>
    </div>
  );
}
