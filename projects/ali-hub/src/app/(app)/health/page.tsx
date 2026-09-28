"use client";

/**
 * /health · the Health tab (Ali 2026-09-28: "analytics, just above ALAI"). Two halves:
 *   Sleep  · last night (score, stages, in bed vs asleep, one plain sentence), the last
 *            7 nights as bars, 30 nights of score as a line
 *   Health · one card per daily Watch metric: latest value, against your own 30 days,
 *            the 30-day line, and one line on what the number means
 * Everything comes from /api/health/summary, phone copy first. Nothing here is
 * judged by an AI · the sentences are fixed rules, so the same night reads the same.
 */

import { useHealthSummary } from "@/lib/health/useHealth";
import { METRIC_INFO, STAGES, avg, deltaLine, fmtDay, fmtMetric, fmtMin, fmtTime, metricValue, nightVerdict, type NightRow } from "@/lib/health/client";
import { Bars, Spark, StageBar } from "@/components/health/charts";
import { checklistToday } from "@/lib/checklist/day";

function scoreTone(s: number | null): string {
  return s === null ? "var(--ink-3)" : s >= 75 ? "var(--pos)" : s >= 55 ? "var(--warn)" : "var(--neg)";
}

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

function lastNDays(n: number, today: string): string[] {
  const out: string[] = [];
  const d = new Date(today + "T12:00:00");
  for (let i = n - 1; i >= 0; i--) { const x = new Date(d); x.setDate(d.getDate() - i); out.push(x.toISOString().slice(0, 10)); }
  return out;
}
const dow = (date: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(new Date(date + "T12:00:00")).slice(0, 2);
const dm = (date: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(date + "T12:00:00"));

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
  const metricNames = data ? Object.keys(data.metrics) : [];
  const known = Object.keys(METRIC_INFO).filter((k) => metricNames.includes(k));
  const unknown = metricNames.filter((k) => !METRIC_INFO[k] && k !== "sleep_analysis");
  const empty = !loading && data && nights.length === 0 && metricNames.length === 0;

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div className="cc-pagetitle" style={{ marginBottom: 0 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600 }}>Health</h1>
          <div className="sub">{data ? `${nights.length} night${nights.length === 1 ? "" : "s"} · ${known.length} measure${known.length === 1 ? "" : "s"} from the Watch` : "—"}</div>
        </div>
      </div>

      {empty && <div style={{ fontSize: 15, color: "var(--ink-3)", padding: "0 2px" }}>Nothing from the Watch yet. Tonight&apos;s sleep lands in the morning.</div>}
      {!data && loading && <div className="cc-skeleton" style={{ height: 180 }} />}

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

      {known.map((k) => {
        const info = METRIC_INFO[k], m = data!.metrics[k];
        const pts = days30.map((d) => { const p = m.points.find((x) => x.date === d); return { label: dm(d), v: p ? metricValue(p, info) : null }; });
        const dl = deltaLine(m.points, info);
        const hrRange = k === "heart_rate" ? m.points[m.points.length - 1] : null;
        return (
          <section key={k} className="cc-card">
            <div className="cc-card-head"><span className="title">{info.label}</span><span className="tail">{m.points.length ? fmtDay(m.points[m.points.length - 1].date, today) : ""}</span></div>
            <div className="cc-card-body" style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                <span className="tabular-nums" style={{ fontSize: 30, fontWeight: 600, lineHeight: 1, fontFamily: "var(--f-mono)", letterSpacing: "-0.02em" }}>{hrRange ? `${hrRange.min ?? "—"} to ${hrRange.max ?? "—"}` : fmtMetric(dl.latest, info.unit)}</span>
                {!hrRange && dl.delta !== null && dl.mean30 !== null && (
                  <span className="tabular-nums" style={{ fontSize: 14, color: dl.tone === "pos" ? "var(--pos)" : dl.tone === "neg" ? "var(--neg)" : "var(--ink-3)" }}>
                    {dl.delta > 0 ? "+" : ""}{Math.abs(dl.delta) >= 10 ? Math.round(dl.delta) : dl.delta.toFixed(1)} vs your 30 days ({fmtMetric(dl.mean30, info.unit)})
                  </span>
                )}
                {hrRange && <span style={{ fontSize: 14, color: "var(--ink-3)" }}>avg {hrRange.avg !== null ? Math.round(hrRange.avg) : "—"} bpm</span>}
              </div>
              <Spark points={pts} fmt={(v) => fmtMetric(v, info.unit)} />
              <div style={{ fontSize: 14, color: "var(--ink-3)", lineHeight: 1.45 }}>{info.meaning}</div>
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
