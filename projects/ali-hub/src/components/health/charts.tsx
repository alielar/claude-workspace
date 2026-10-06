"use client";

/**
 * Small inline-SVG charts for the Health tab and the run page. One hue (the
 * accent), thin marks, text in ink tokens, a tap on a mark selects it and the
 * value is written under the chart (there is no hover on the phone).
 */

import { useMemo, useState } from "react";
import { haversineM, type HrPoint, type IntervalSeg, type RoutePoint, type Split } from "@/lib/health/types";
import { STAGES, type NightRow } from "@/lib/health/client";

const ink = (n: 1 | 2 | 3 | 4) => (n === 1 ? "var(--ink)" : `var(--ink-${n})`);

/** Proportional stage bar for one night · every segment carries its label, so colour is never alone. */
export function StageBar({ n }: { n: NightRow }) {
  const parts = STAGES.map((s) => ({ ...s, min: n[s.key] ?? 0 })).filter((p) => p.min > 0);
  const total = parts.reduce((s, p) => s + p.min, 0);
  if (!total) return null;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", gap: 2, height: 14, borderRadius: 7, overflow: "hidden" }}>
        {parts.map((p) => <span key={p.key} title={`${p.label} ${p.min} min`} style={{ flex: `${p.min} 0 0`, background: p.color }} />)}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: 13, color: ink(3) }}>
        {parts.map((p) => (
          <span key={p.key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
            {p.label} <span className="tabular-nums" style={{ color: ink(2) }}>{Math.round((p.min / total) * 100)} %</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Bars, oldest → newest · tap a bar to read it. `fmt` writes the selected value. */
export function Bars({ values, labels, fmt, target, height = 96 }: {
  values: (number | null)[]; labels: string[]; fmt: (v: number, i: number) => string; target?: number | null; height?: number;
}) {
  const [sel, setSel] = useState<number | null>(null);
  const max = Math.max(target ?? 0, ...values.map((v) => v ?? 0), 1);
  const n = values.length;
  const W = 100, gap = 1.2, bw = (W - gap * (n - 1)) / n;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }} role="img" aria-label="bar chart">
        {target != null && <line x1={0} x2={W} y1={height - (target / max) * (height - 4)} y2={height - (target / max) * (height - 4)} style={{ stroke: "var(--line-strong)", strokeWidth: 0.4, strokeDasharray: "1.5 1.5" }} vectorEffect="non-scaling-stroke" />}
        {values.map((v, i) => {
          const h = v === null ? 0 : (v / max) * (height - 4);
          const x = i * (bw + gap);
          return (
            <g key={i} onClick={() => setSel(sel === i ? null : i)} style={{ cursor: "pointer" }}>
              <rect x={x} y={0} width={bw} height={height} fill="transparent" />
              {v === null
                ? <rect x={x} y={height - 2} width={bw} height={2} style={{ fill: "var(--fill-3)" }} />
                : <rect x={x} y={height - h} width={bw} height={h} rx={0} style={{ fill: sel === null || sel === i ? "var(--violet)" : "var(--accent-soft)" }} />}
            </g>
          );
        })}
      </svg>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${n}, 1fr)`, fontSize: 12, color: ink(4), textAlign: "center" }}>
        {labels.map((l, i) => <span key={i} style={{ color: sel === i ? ink(1) : undefined }}>{l}</span>)}
      </div>
      <div className="tabular-nums" style={{ fontSize: 14, color: ink(2), minHeight: 20 }}>
        {sel !== null && values[sel] !== null ? `${labels[sel]} · ${fmt(values[sel]!, sel)}` : sel !== null ? `${labels[sel]} · no data` : ""}
      </div>
    </div>
  );
}

/** A 2 px line over ~30 points · tap anywhere to read the nearest point. */
export function Spark({ points, fmt, height = 64, band }: {
  points: { label: string; v: number | null }[]; fmt: (v: number) => string; height?: number; band?: [number, number] | null;
}) {
  const [sel, setSel] = useState<number | null>(null);
  const vals = points.map((p) => p.v).filter((v): v is number => v !== null);
  if (vals.length < 2) return <div style={{ fontSize: 14, color: ink(3), minHeight: height, display: "flex", alignItems: "center" }}>Needs a few days.</div>;
  const lo = Math.min(...vals, band?.[0] ?? Infinity), hi = Math.max(...vals, band?.[1] ?? -Infinity);
  const span = hi - lo || 1;
  const W = 100, pad = 4;
  const x = (i: number) => (i / Math.max(points.length - 1, 1)) * W;
  const y = (v: number) => height - pad - ((v - lo) / span) * (height - pad * 2);
  const d = points.map((p, i) => (p.v === null ? null : `${x(i).toFixed(2)},${y(p.v).toFixed(2)}`)).reduce<string>((acc, pt, i) => (pt === null ? acc : acc + (acc && points[i - 1]?.v !== null ? " L" : " M") + pt), "").trim();
  const pick = (e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => {
    const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const cx = "touches" in e ? e.touches[0]?.clientX ?? 0 : e.clientX;
    const i = Math.round(((cx - r.left) / r.width) * (points.length - 1));
    setSel(Math.max(0, Math.min(points.length - 1, i)));
  };
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block", touchAction: "pan-y" }} role="img" aria-label="trend"
        onClick={pick} onTouchStart={pick} onTouchMove={pick}>
        {band && <rect x={0} width={W} y={y(band[1])} height={Math.max(0, y(band[0]) - y(band[1]))} style={{ fill: "var(--fill-2)" }} />}
        <path d={d} fill="none" style={{ stroke: "var(--violet)", strokeWidth: 2 }} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        {sel !== null && points[sel].v !== null && (
          <>
            <line x1={x(sel)} x2={x(sel)} y1={0} y2={height} style={{ stroke: "var(--line-strong)", strokeWidth: 1 }} vectorEffect="non-scaling-stroke" />
            <circle cx={x(sel)} cy={y(points[sel].v!)} r={3} style={{ fill: "var(--violet)", stroke: "var(--bg-card)", strokeWidth: 2 }} vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      <div className="tabular-nums" style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: ink(3), minHeight: 18 }}>
        <span>{points[0].label}</span>
        <span style={{ color: ink(2) }}>{sel !== null ? `${points[sel].label} · ${points[sel].v === null ? "no data" : fmt(points[sel].v!)}` : ""}</span>
        <span>{points[points.length - 1].label}</span>
      </div>
    </div>
  );
}

/** A plain 2 px trend, no labels, no tap · for compact rows. */
export function Line({ points, height = 28, width = 64 }: { points: (number | null)[]; height?: number; width?: number }) {
  const vals = points.filter((v): v is number => v !== null);
  if (vals.length < 2) return <span style={{ display: "inline-block", width, height }} aria-hidden />;
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const W = 100, pad = 3;
  const x = (i: number) => (i / Math.max(points.length - 1, 1)) * W;
  const y = (v: number) => height - pad - ((v - lo) / span) * (height - pad * 2);
  const d = points.map((v, i) => (v === null ? null : `${x(i).toFixed(2)},${y(v).toFixed(2)}`)).reduce<string>((acc, pt, i) => (pt === null ? acc : acc + (acc && points[i - 1] !== null ? " L" : " M") + pt), "").trim();
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ width, height, display: "block" }} aria-hidden>
      <path d={d} fill="none" style={{ stroke: "var(--violet)", strokeWidth: 1.6 }} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The Vitals band: a track, your typical range as the raised segment, tonight's value as the dot.
 * Without a range yet, only the track (the dot sits mid-way) · the row's text says "day n of 7".
 */
export function RangeBar({ value, range, outside }: { value: number | null; range: { lo: number; hi: number } | null; outside: boolean }) {
  const H = 14;
  if (value === null) return <span style={{ display: "block", height: H }} aria-hidden />;
  // Scale: the range fills the middle 50 % of the track; values are clamped to the ends.
  const lo = range ? range.lo : value, hi = range ? range.hi : value;
  const span = hi - lo || 1, pad = span * 0.5;
  const x = (v: number) => Math.max(2, Math.min(98, ((v - (lo - pad)) / (span * 2)) * 100));
  return (
    <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: H, display: "block" }} aria-hidden>
      <rect x={0} y={H / 2 - 1.5} width={100} height={3} rx={1.5} style={{ fill: "var(--fill-2)" }} />
      {range && <rect x={x(range.lo)} y={H / 2 - 3} width={Math.max(0, x(range.hi) - x(range.lo))} height={6} rx={3} style={{ fill: "var(--accent-soft)" }} />}
      <circle cx={range ? x(value) : 50} cy={H / 2} r={4.5} style={{ fill: outside ? "var(--warn)" : range ? "var(--violet)" : "var(--ink-4)", stroke: "var(--bg-card)", strokeWidth: 1.5 }} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** The run's route, fitted to the box · start dot, finish dot, a small mark at every kilometre. */
export function RouteMap({ route, height = 220 }: { route: RoutePoint[]; height?: number }) {
  const geo = useMemo(() => {
    if (route.length < 2) return null;
    const lats = route.map((p) => p[0]), lons = route.map((p) => p[1]);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const k = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
    const w = (maxLon - minLon) * k || 1e-6, h = (maxLat - minLat) || 1e-6;
    const pts = route.map((p) => [((p[1] - minLon) * k) / w, (maxLat - p[0]) / h] as [number, number]);
    const kms: [number, number][] = [];
    let d = 0, next = 1000;
    for (let i = 1; i < route.length; i++) {
      d += haversineM(route[i - 1][0], route[i - 1][1], route[i][0], route[i][1]);
      if (d >= next) { kms.push(pts[i]); next += 1000; }
    }
    return { pts, kms, aspect: w / h };
  }, [route]);
  if (!geo) return null;
  // Fit the trace into the card: wide routes take the full width, tall ones the full height.
  const W = 100, H = 100;
  const sx = geo.aspect >= 1 ? 1 : geo.aspect, sy = geo.aspect >= 1 ? 1 / geo.aspect : 1;
  const px = (p: [number, number]) => 6 + p[0] * (W - 12) * sx + ((1 - sx) * (W - 12)) / 2;
  const py = (p: [number, number]) => 6 + p[1] * (H - 12) * sy + ((1 - sy) * (H - 12)) / 2;
  const d = geo.pts.map((p, i) => `${i ? "L" : "M"}${px(p).toFixed(2)},${py(p).toFixed(2)}`).join(" ");
  const start = geo.pts[0], end = geo.pts[geo.pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height, display: "block", background: "var(--fill-1)", borderRadius: 12 }} role="img" aria-label="route">
      <path d={d} fill="none" style={{ stroke: "var(--violet)", strokeWidth: 2.5 }} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      {geo.kms.map((p, i) => <circle key={i} cx={px(p)} cy={py(p)} r={2.6} style={{ fill: "var(--bg-card)", stroke: "var(--violet)", strokeWidth: 1.5 }} vectorEffect="non-scaling-stroke" />)}
      <circle cx={px(start)} cy={py(start)} r={4} style={{ fill: "var(--pos)", stroke: "var(--bg-card)", strokeWidth: 2 }} vectorEffect="non-scaling-stroke" />
      <circle cx={px(end)} cy={py(end)} r={4} style={{ fill: "var(--ink)", stroke: "var(--bg-card)", strokeWidth: 2 }} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Heart rate over the run · tap to read; min and max written at the sides. */
export function HrLine({ hr, startMs, height = 110 }: { hr: HrPoint[]; startMs: number; height?: number }) {
  const [sel, setSel] = useState<number | null>(null);
  if (hr.length < 3) return null;
  const vals = hr.map((p) => p[1]);
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const t0 = hr[0][0], t1 = hr[hr.length - 1][0], ts = t1 - t0 || 1;
  const W = 100, pad = 6;
  const x = (t: number) => ((t - t0) / ts) * W;
  const y = (v: number) => height - pad - ((v - lo) / span) * (height - pad * 2);
  const d = hr.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(2)},${y(p[1]).toFixed(2)}`).join(" ");
  const pick = (e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const cx = "touches" in e ? e.touches[0]?.clientX ?? 0 : e.clientX;
    const t = t0 + ((cx - r.left) / r.width) * ts;
    let best = 0;
    for (let i = 1; i < hr.length; i++) if (Math.abs(hr[i][0] - t) < Math.abs(hr[best][0] - t)) best = i;
    setSel(best);
  };
  const clock = (t: number) => { const s = Math.max(0, Math.round((t - startMs) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block", touchAction: "pan-y" }} role="img" aria-label="heart rate" onClick={pick} onTouchStart={pick} onTouchMove={pick}>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={0} x2={W} y1={height * f} y2={height * f} style={{ stroke: "var(--line)", strokeWidth: 0.5 }} vectorEffect="non-scaling-stroke" />)}
        <path d={d} fill="none" style={{ stroke: "var(--neg)", strokeWidth: 2 }} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {sel !== null && (
          <>
            <line x1={x(hr[sel][0])} x2={x(hr[sel][0])} y1={0} y2={height} style={{ stroke: "var(--line-strong)", strokeWidth: 1 }} vectorEffect="non-scaling-stroke" />
            <circle cx={x(hr[sel][0])} cy={y(hr[sel][1])} r={3} style={{ fill: "var(--neg)", stroke: "var(--bg-card)", strokeWidth: 2 }} vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      <div className="tabular-nums" style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: ink(3) }}>
        <span>low {lo}</span>
        <span style={{ color: ink(2) }}>{sel !== null ? `${clock(hr[sel][0])} · ${hr[sel][1]} bpm` : ""}</span>
        <span>high {hi}</span>
      </div>
    </div>
  );
}

/** Kilometre splits · pace bar relative to the fastest km, so the slow ones show at a glance. */
export function SplitsTable({ splits, fmtPace }: { splits: Split[]; fmtPace: (s: number | null) => string }) {
  if (!splits.length) return null;
  const full = splits.filter((s) => !s.partial).map((s) => s.paceSec ?? 0).filter(Boolean);
  const paces = full.length ? full : splits.map((s) => s.paceSec ?? 0).filter(Boolean);
  const fastest = Math.min(...paces), slowest = Math.max(...paces);
  const hasHr = splits.some((s) => s.hrAvg !== null), hasClimb = splits.some((s) => (s.elevM ?? 0) > 0);
  const cols = `36px 1fr 56px${hasHr ? " 52px" : ""}${hasClimb ? " 48px" : ""}`;
  const head = (t: string, right = true) => <span style={{ fontSize: 12, color: ink(4), textAlign: right ? "right" : "left" }}>{t}</span>;
  return (
    <div style={{ display: "grid", gap: 0 }}>
      <div style={{ display: "grid", gridTemplateColumns: cols, gap: 10, padding: "4px 0 6px", borderBottom: "1px solid var(--line)" }}>
        {head("km", false)}{head("pace", false)}{head("time")}{hasHr && head("bpm")}{hasClimb && head("climb")}
      </div>
      {splits.map((s) => {
        const w = s.paceSec && slowest > fastest ? 40 + (60 * (slowest - s.paceSec)) / (slowest - fastest) : 100;
        return (
          <div key={s.km} className="tabular-nums" style={{ display: "grid", gridTemplateColumns: cols, gap: 10, alignItems: "center", minHeight: 40, borderBottom: "1px solid var(--line)", fontSize: 15 }}>
            <span style={{ color: ink(3) }}>{s.partial ? `${s.distKm.toFixed(1)}` : s.km}</span>
            <span style={{ display: "grid", gridTemplateColumns: "auto 1fr", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span style={{ fontWeight: 600, color: s.paceSec === fastest && !s.partial ? "var(--pos)" : ink(1) }}>{fmtPace(s.paceSec)}</span>
              <span style={{ height: 6, borderRadius: 3, background: "var(--fill-2)", overflow: "hidden" }}><span style={{ display: "block", width: `${w}%`, height: "100%", background: "var(--violet)", opacity: s.partial ? 0.5 : 1 }} /></span>
            </span>
            <span style={{ textAlign: "right", color: ink(2) }}>{`${Math.floor(s.sec / 60)}:${String(s.sec % 60).padStart(2, "0")}`}</span>
            {hasHr && <span style={{ textAlign: "right", color: ink(2) }}>{s.hrAvg ?? "—"}</span>}
            {hasClimb && <span style={{ textAlign: "right", color: ink(3) }}>{s.elevM ? `+${s.elevM}` : "—"}</span>}
          </div>
        );
      })}
    </div>
  );
}

/** A structured run's own segments (a sprint rep, its walk recovery, the warm-up …) · fastest pace in green, same shape as SplitsTable. */
export function IntervalsTable({ intervals, fmtPace }: { intervals: IntervalSeg[]; fmtPace: (s: number | null) => string }) {
  if (intervals.length < 2) return null;
  const paces = intervals.map((s) => s.paceSec ?? 0).filter(Boolean);
  const fastest = Math.min(...paces), slowest = Math.max(...paces);
  const hasHr = intervals.some((s) => s.hrAvg !== null);
  const cols = `30px 1fr 56px${hasHr ? " 52px" : ""}`;
  const head = (t: string, right = true) => <span style={{ fontSize: 12, color: ink(4), textAlign: right ? "right" : "left" }}>{t}</span>;
  return (
    <div style={{ display: "grid", gap: 0 }}>
      <div style={{ display: "grid", gridTemplateColumns: cols, gap: 10, padding: "4px 0 6px", borderBottom: "1px solid var(--line)" }}>
        {head("#", false)}{head("pace", false)}{head("time")}{hasHr && head("bpm")}
      </div>
      {intervals.map((s) => {
        const w = s.paceSec && slowest > fastest ? 40 + (60 * (slowest - s.paceSec)) / (slowest - fastest) : 100;
        return (
          <div key={s.index} className="tabular-nums" style={{ display: "grid", gridTemplateColumns: cols, gap: 10, alignItems: "center", minHeight: 40, borderBottom: "1px solid var(--line)", fontSize: 15 }}>
            <span style={{ color: ink(3) }}>{s.index}</span>
            <span style={{ display: "grid", gridTemplateColumns: "auto 1fr", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span style={{ fontWeight: 600, color: s.paceSec === fastest ? "var(--pos)" : ink(1) }}>{fmtPace(s.paceSec)}</span>
              <span style={{ height: 6, borderRadius: 3, background: "var(--fill-2)", overflow: "hidden" }}><span style={{ display: "block", width: `${w}%`, height: "100%", background: "var(--violet)" }} /></span>
            </span>
            <span style={{ textAlign: "right", color: ink(2) }}>{`${Math.floor(s.sec / 60)}:${String(s.sec % 60).padStart(2, "0")}`}</span>
            {hasHr && <span style={{ textAlign: "right", color: ink(2) }}>{s.hrAvg ?? "—"}</span>}
          </div>
        );
      })}
    </div>
  );
}
