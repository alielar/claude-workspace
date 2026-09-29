"use client";

/**
 * /health · the Health tab (Ali 2026-09-28: "analytics, just above ALAI" · rethought 2026-09-29
 * around what the Watch actually measures, "more data points, simple but rich").
 *   Vitals   · the checks Apple runs on you every night (resting HR, HRV, breathing, wrist
 *              temperature, blood oxygen) plus sleep length, each against YOUR typical range
 *              (mean ± 1.5 SD of the previous 28 values, drawn after 7) · one rule-based read.
 *   Sleep    · last night (score, stages, one sentence), 7 nights as bars, 30 nights of score.
 *   Activity · steps, active energy, exercise minutes, stand hours as tiles vs your average,
 *              14 days of steps as bars.
 *   Groups   · Overnight · Heart · Activity · Fitness: one compact row per metric (latest,
 *              vs your 30 days, a mini trend) · tap a row for the 30-day line, your range and
 *              one fixed line on what the number means.
 *   Also received · anything HAE sends that has no card yet.
 * Everything comes from /api/health/summary, phone copy first. Nothing here is judged by an
 * AI · the sentences are fixed rules, so the same night reads the same every day.
 */

import { useState } from "react";
import { useHealthSummary } from "@/lib/health/useHealth";
import {
  METRIC_GROUPS, METRIC_INFO, RANGE_DAYS, STAGES, avg, deltaLine, fmtDay, fmtDelta, fmtMetric, fmtMin, fmtTime,
  metricKey, metricValue, nightVerdict, pipeNote, typicalRange, vitalState, vitalsRead, type HealthSummary, type MetricInfo, type NightRow, type VitalState,
} from "@/lib/health/client";
import { Bars, Line, RangeBar, Spark, StageBar } from "@/components/health/charts";
import { checklistToday } from "@/lib/checklist/day";
import { useClientValue } from "@/lib/useClientValue";

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

type Series = HealthSummary["metrics"][string];

/** The metrics we know, keyed by our name (HAE's naming variants folded in). */
function knownMetrics(metrics: HealthSummary["metrics"]): Record<string, Series> {
  const out: Record<string, Series> = {};
  for (const [name, s] of Object.entries(metrics)) { const k = metricKey(name); if (k) out[k] = s; }
  return out;
}

// ── Vitals ───────────────────────────────────────────────────────────────────

type VitalRow = { key: string; label: string; value: number | null; text: string; range: { lo: number; hi: number } | null; state: VitalState | null; n: number; date: string | null };

function vitalRows(known: Record<string, Series>, nights: NightRow[]): VitalRow[] {
  const rows: VitalRow[] = [];
  const hrs = [...nights].reverse().map((n) => ({ date: n.date, v: n.totalMin !== null ? n.totalMin / 60 : null })).filter((p): p is { date: string; v: number } => p.v !== null);
  if (hrs.length) {
    const last = hrs[hrs.length - 1], range = typicalRange(hrs.slice(0, -1).map((p) => p.v), 0.75);
    rows.push({ key: "sleep", label: "Sleep", value: last.v, text: fmtMin(Math.round(last.v * 60)), range, state: range ? vitalState(last.v, range) : null, n: hrs.length, date: last.date });
  }
  for (const [k, info] of Object.entries(METRIC_INFO)) {
    if (!info.vital || !known[k]) continue;
    const s = known[k];
    const pts = s.points.map((p) => ({ date: p.date, v: metricValue(p, info, s.units) })).filter((p): p is { date: string; v: number } => p.v !== null);
    if (!pts.length) continue;
    const last = pts[pts.length - 1], range = typicalRange(pts.slice(0, -1).map((p) => p.v), info.floor);
    rows.push({ key: k, label: info.short ?? info.label, value: last.v, text: fmtMetric(last.v, info.unit, info.dp), range, state: range ? vitalState(last.v, range) : null, n: pts.length, date: last.date });
  }
  return rows;
}

function Vitals({ rows, today }: { rows: VitalRow[]; today: string }) {
  const latest = rows.map((r) => r.date).filter((d): d is string => d !== null).sort().pop() ?? null;
  const minN = Math.min(...rows.map((r) => r.n));
  return (
    <section className="cc-card">
      <div className="cc-card-head"><span className="title">Vitals</span><span className="tail">{latest ? fmtDay(latest, today) : ""}{minN < RANGE_DAYS ? ` · day ${minN} of ${RANGE_DAYS}` : ""}</span></div>
      <div className="cc-card-body" style={{ display: "grid", gap: 12 }}>
        {rows.map((r) => (
          <div key={r.key} style={{ display: "grid", gridTemplateColumns: "104px 1fr auto", gap: 12, alignItems: "center" }}>
            <span style={{ fontSize: 14, color: "var(--ink-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</span>
            <RangeBar value={r.value} range={r.range} outside={r.state !== null && r.state !== "typical"} />
            <span className="tabular-nums" style={{ fontSize: 15, fontWeight: 600, textAlign: "right", whiteSpace: "nowrap", color: r.state && r.state !== "typical" ? "var(--warn)" : "var(--ink)" }}>
              {r.text}{r.state && r.state !== "typical" ? <span style={{ fontSize: 12, fontWeight: 500, marginLeft: 5 }}>{r.state}</span> : null}
            </span>
          </div>
        ))}
        <div style={{ fontSize: 15, color: "var(--ink-2)" }}>{vitalsRead(rows)}</div>
      </div>
    </section>
  );
}

// ── Sleep ────────────────────────────────────────────────────────────────────

function LastNight({ n, today }: { n: NightRow; today: string }) {
  return (
    <section className="cc-card">
      <div className="cc-card-head"><span className="title">Last night</span><span className="tail">{fmtDay(n.date, today)}</span></div>
      <div className="cc-card-body" style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 16, alignItems: "center" }}>
          <div style={{ display: "grid", justifyItems: "center", gap: 0 }}>
            <span className="tabular-nums" style={{ fontSize: 44, fontWeight: 600, lineHeight: 1, fontFamily: "var(--f-mono)", color: scoreTone(n.score) }}>{n.score ?? "—"}</span>
            <span style={{ fontSize: 12, color: "var(--ink-4)" }}>score</span>
          </div>
          <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
            <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }} className="tabular-nums">{fmtMin(n.totalMin)} <span style={{ fontSize: 14, fontWeight: 400, color: "var(--ink-3)" }}>asleep</span></span>
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
      </div>
    </section>
  );
}

// ── Activity ─────────────────────────────────────────────────────────────────

const ACTIVITY_TILES = ["step_count", "active_energy", "apple_exercise_time", "apple_stand_hour"] as const;

function Activity({ known, today }: { known: Record<string, Series>; today: string }) {
  const tiles = ACTIVITY_TILES.filter((k) => known[k]).map((k) => {
    const info = METRIC_INFO[k], s = known[k];
    const pts = s.points.map((p) => ({ date: p.date, v: metricValue(p, info, s.units) })).filter((p): p is { date: string; v: number } => p.v !== null);
    const last = pts[pts.length - 1] ?? null;
    const earlier = pts.filter((p) => last && p.date !== last.date).slice(-7).map((p) => p.v);
    return { k, info, last, mean: avg(earlier) };
  });
  if (!tiles.length) return null;
  const latest = tiles.map((t) => t.last?.date).filter((d): d is string => !!d).sort().pop() ?? null;
  const steps = known.step_count;
  const days14 = lastNDays(14, today);
  const stepVals = steps ? days14.map((d) => { const p = steps.points.find((x) => x.date === d); return p ? metricValue(p, METRIC_INFO.step_count, steps.units) : null; }) : null;
  return (
    <section className="cc-card">
      <div className="cc-card-head"><span className="title">Activity</span><span className="tail">{latest ? (latest === today ? "today so far" : fmtDay(latest, today)) : ""}</span></div>
      <div className="cc-card-body" style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(tiles.length, 4)}, 1fr)`, gap: 8 }}>
          {tiles.map((t) => (
            <div key={t.k} style={{ display: "grid", gap: 2, minWidth: 0 }}>
              <span className="tabular-nums" style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>{t.last ? fmtMetric(t.last.v, "", t.info.dp) : "—"}</span>
              <span style={{ fontSize: 12, color: "var(--ink-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.info.short ?? t.info.label}{t.info.unit ? ` ${t.info.unit}` : ""}</span>
              <span className="tabular-nums" style={{ fontSize: 12, color: "var(--ink-4)" }}>{t.mean !== null ? `avg ${fmtMetric(t.mean, "", t.info.dp)}` : ""}</span>
            </div>
          ))}
        </div>
        {stepVals && stepVals.some((v) => v !== null) && (
          <Bars values={stepVals} labels={days14.map(dow)} height={72} fmt={(v) => `${Math.round(v).toLocaleString("en-GB")} steps`} />
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
  const pts = days30.map((d) => { const p = s.points.find((x) => x.date === d); return { label: dm(d), v: p ? metricValue(p, info, s.units) : null }; });
  const vals = pts.map((p) => p.v).filter((v): v is number => v !== null);
  const range = typicalRange(vals.slice(0, -1), info.floor);
  const isRange = k === "heart_rate" && lastPt && (lastPt.min !== null || lastPt.max !== null);
  const value = isRange ? `${lastPt!.min ?? "—"} to ${lastPt!.max ?? "—"} bpm` : fmtMetric(dl.latest, info.unit, info.dp);
  const sub = isRange
    ? `avg ${lastPt!.avg !== null ? Math.round(lastPt!.avg) : "—"} bpm`
    : dl.delta !== null && dl.mean30 !== null
    ? `${fmtDelta(dl.delta, info.dp)} vs your 30 days`
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
      {open && (
        <div style={{ display: "grid", gap: 10, padding: "2px 0 14px" }}>
          <Spark points={pts} band={range ? [range.lo, range.hi] : null} fmt={(v) => fmtMetric(v, info.unit, info.dp)} />
          {range && <div className="tabular-nums" style={{ fontSize: 13, color: "var(--ink-3)" }}>Your range · {fmtMetric(range.lo, "", info.dp)} to {fmtMetric(range.hi, info.unit, info.dp)}</div>}
          <div style={{ fontSize: 14, color: "var(--ink-3)", lineHeight: 1.45 }}>{info.meaning}</div>
        </div>
      )}
    </div>
  );
}

// ── The page ─────────────────────────────────────────────────────────────────

export default function HealthPage() {
  const { data, loading } = useHealthSummary();
  const today = checklistToday();
  const nights = data?.nights ?? [];
  const byDate = new Map(nights.map((n) => [n.date, n]));
  const last = nights[0] ?? null;
  const days7 = lastNDays(7, today), days30 = lastNDays(30, today);
  const hours7 = days7.map((d) => { const n = byDate.get(d); return n?.totalMin != null ? n.totalMin / 60 : null; });
  const avg7 = avg(hours7.filter((h): h is number => h !== null));
  const score30 = days30.map((d) => ({ label: dm(d), v: byDate.get(d)?.score ?? null }));
  const avgScore30 = avg(nights.map((n) => n.score).filter((s): s is number => s !== null));
  const bedtimes = nights.map((n) => n.inBedStart ?? n.sleepStart).filter((t): t is number => t !== null).map((t) => { const d = new Date(t); const h = (d.getHours() + d.getMinutes() / 60); return h < 12 ? h + 24 : h; });
  const bedSpread = bedtimes.length >= 3 ? Math.round((Math.max(...bedtimes) - Math.min(...bedtimes)) * 60) : null;

  const known = data ? knownMetrics(data.metrics) : {};
  const knownKeys = Object.keys(known);
  const unknown = data ? Object.keys(data.metrics).filter((k) => !metricKey(k) && k !== "sleep_analysis") : [];
  const vitals = vitalRows(known, nights);
  const empty = !loading && data && nights.length === 0 && knownKeys.length === 0 && unknown.length === 0;
  // Why sleep is missing, from what HAE really posted · shown while there is no night at all.
  const now = useClientValue(() => Date.now(), 0);
  const note = data && nights.length === 0 && now ? pipeNote(data.pipe, "sleep", now) : null;

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div className="cc-pagetitle" style={{ marginBottom: 0 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600 }}>Health</h1>
          <div className="sub">{data ? `${nights.length} night${nights.length === 1 ? "" : "s"} · ${knownKeys.length} measure${knownKeys.length === 1 ? "" : "s"} from the Watch` : "—"}</div>
        </div>
      </div>

      {note && <div style={{ fontSize: 15, color: "var(--warn)", padding: "0 2px", lineHeight: 1.45 }}>{note}</div>}
      {empty && !note && <div style={{ fontSize: 15, color: "var(--ink-3)", padding: "0 2px" }}>Nothing from the Watch yet. Tonight&apos;s sleep lands in the morning.</div>}
      {!data && loading && <div className="cc-skeleton" style={{ height: 180 }} />}

      {vitals.length > 0 && <Vitals rows={vitals} today={today} />}

      {last && <LastNight n={last} today={today} />}

      {nights.length > 0 && (
        <section className="cc-card">
          <div className="cc-card-head"><span className="title">7 nights</span><span className="tail">{avg7 !== null ? `avg ${fmtMin(Math.round(avg7 * 60))}` : ""}</span></div>
          <div className="cc-card-body">
            <Bars values={hours7} labels={days7.map(dow)} target={8} fmt={(h, i) => { const sc = byDate.get(days7[i])?.score; return `${fmtMin(Math.round(h * 60))} asleep${sc != null ? ` · score ${sc}` : ""}`; }} />
          </div>
        </section>
      )}

      {nights.length >= 2 && (
        <section className="cc-card">
          <div className="cc-card-head"><span className="title">30 nights · score</span><span className="tail">{avgScore30 !== null ? `avg ${Math.round(avgScore30)}` : ""}</span></div>
          <div className="cc-card-body" style={{ display: "grid", gap: 10 }}>
            <Spark points={score30} fmt={(v) => `score ${Math.round(v)}`} />
            {bedSpread !== null && <div style={{ fontSize: 14, color: "var(--ink-3)" }}>Bedtime moves by up to {bedSpread >= 60 ? `${Math.floor(bedSpread / 60)} h ${bedSpread % 60 ? `${bedSpread % 60} min` : ""}` : `${bedSpread} min`} across these nights{bedSpread > 90 ? " · a steadier bedtime is the cheapest way to sleep better" : ""}.</div>}
          </div>
        </section>
      )}

      <Activity known={known} today={today} />

      {METRIC_GROUPS.map((g) => {
        const keys = Object.keys(METRIC_INFO).filter((k) => METRIC_INFO[k].group === g.key && known[k] && !(g.key === "activity" && (ACTIVITY_TILES as readonly string[]).includes(k)));
        if (!keys.length) return null;
        return (
          <section key={g.key} className="cc-card">
            <div className="cc-card-head"><span className="title">{g.title}</span></div>
            <div style={{ padding: "0 14px" }}>
              {keys.map((k) => <MetricRow key={k} k={k} info={METRIC_INFO[k]} s={known[k]} today={today} days30={days30} />)}
            </div>
          </section>
        );
      })}

      {unknown.length > 0 && (
        <section className="cc-card">
          <div className="cc-card-head"><span className="title">Also received</span></div>
          <div className="cc-card-body" style={{ display: "grid", gap: 6, fontSize: 14, color: "var(--ink-3)" }}>
            {unknown.map((k) => { const p = data!.metrics[k].points; const l = p[p.length - 1]; return <span key={k} className="tabular-nums">{k.replace(/_/g, " ")} · {fmtMetric(l?.qty ?? l?.avg ?? null, data!.metrics[k].units ?? "")} · {l ? fmtDay(l.date, today) : ""}</span>; })}
          </div>
        </section>
      )}
    </div>
  );
}
