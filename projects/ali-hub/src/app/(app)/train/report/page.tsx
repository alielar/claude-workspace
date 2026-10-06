"use client";

/**
 * /train/report · the weekly training report (spec §7c item 15, Ali 2026-10-04): the Sunday
 * coach's text in five sections, the Head skill, the objectives as they stood, past weeks as pills.
 * `?week=2026-W41` opens one; without it, the latest. "Write it now" asks the server for a missing
 * one (one AI call); the Sunday 20:00 tick does it on its own otherwise.
 * SINCE 2026-10-07 the page is the ONE "Your week" (Ali: merge the Sunday coach report and the weekly
 * health brief): under the coach's text and numbers, "The body" = Health's what-changed sentences
 * (`whatChanged`, fixed rules over the phone's health summary · the latest week only).
 */

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useCached, fetchJson } from "@/lib/local/store";
import { Reveal } from "@/components/health/checkup";
import type { CoachReport } from "@/lib/coach/types";
import { checklistToday } from "@/lib/checklist/day";
import { isoWeekOf, METRIC_INFO, metricKey, metricValue, type HealthSummary } from "@/lib/health/client";
import { useHealthSummary } from "@/lib/health/useHealth";
import { weekBrief, whatChanged } from "@/lib/health/insights";

/** Health's "what changed" for the last 7 full days · the same sentences as the Health tab. */
function BodyWeek({ h, today }: { h: HealthSummary | null | undefined; today: string }) {
  if (!h) return null;
  const days14: string[] = [];
  const d = new Date(today + "T12:00:00");
  for (let i = 13; i >= 0; i--) { const x = new Date(d); x.setDate(d.getDate() - i); days14.push(x.toISOString().slice(0, 10)); }
  const known: Record<string, HealthSummary["metrics"][string]> = {};
  for (const [name, s] of Object.entries(h.metrics)) { const k = metricKey(name); if (k) known[k] = s; }
  const series = (k: string) => (known[k] ? days14.map((day) => { const p = known[k].points.find((x) => x.date === day); return p ? metricValue(p, METRIC_INFO[k], known[k].units) : null; }) : days14.map(() => null));
  const brief = weekBrief({ nights: h.nights, today, daily: { exercise: series("apple_exercise_time"), steps: series("step_count"), rhr: series("resting_heart_rate"), hrv: series("heart_rate_variability") } });
  if (!brief) return null;
  const items = whatChanged(brief);
  const color = (t: "pos" | "neg" | "flat") => (t === "pos" ? "var(--pos)" : t === "neg" ? "var(--warn)" : "var(--ink-4)");
  return (
    <section className="cc-card">
      <div className="cc-card-head"><span className="title">The body</span><span className="tail">the last 7 days vs the 7 before</span></div>
      <div className="cc-card-body" style={{ display: "grid", gap: 12 }}>
        <div style={{ fontSize: 15, color: "var(--ink-2)", lineHeight: 1.5 }}>{brief.verdict}</div>
        {items.map((it) => (
          <div key={it.key} style={{ display: "grid", gridTemplateColumns: "10px 1fr", gap: 10, alignItems: "start" }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 99, background: color(it.tone), marginTop: 7 }} />
            <span style={{ display: "grid", gap: 3 }}>
              <span className="tabular-nums" style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.3 }}>{it.title}</span>
              <span style={{ fontSize: 14.5, color: "var(--ink-2)", lineHeight: 1.5 }}>{it.text}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

type Feed = { report: CoachReport | null; week: string; reports: { week: string; from: string; to: string; headline: string }[]; error: string | null };

const range = (from: string, to: string) => { const f = new Date(from + "T12:00:00"), t = new Date(to + "T12:00:00"); const d = (x: Date, m: boolean) => new Intl.DateTimeFormat("en-GB", { day: "numeric", ...(m ? { month: "short" } : {}) }).format(x); return `${d(f, f.getMonth() !== t.getMonth())} to ${d(t, true)}`; };
const stateColor = (s: string) => (s === "done" ? "var(--pos)" : s === "on" ? "var(--violet)" : s === "behind" ? "var(--warn)" : "var(--ink-4)");

/** "## Title\ntext" blocks → sections. */
function sections(md: string): { title: string; body: string }[] {
  const out: { title: string; body: string }[] = [];
  for (const part of md.split(/^## /m)) {
    if (!part.trim()) continue;
    const [first, ...rest] = part.split("\n");
    out.push({ title: first.replace(/\s*·.*$/, "").trim(), body: rest.join("\n").trim() });
  }
  return out;
}

export default function ReportPage() {
  return <Suspense fallback={null}><Report /></Suspense>;
}

function Report() {
  const q = useSearchParams().get("week");
  const week = q && /^\d{4}-W\d{2}$/.test(q) ? q : null;
  const { data, setData, loading } = useCached<Feed>(week ? `coach-report-${week}` : "coach-report", () => fetchJson<Feed>(week ? `/api/coach/report?week=${week}` : "/api/coach/report"));
  const [busy, setBusy] = useState(false);
  const r = data?.report ?? null;
  const today = checklistToday();
  const { data: health } = useHealthSummary();
  const thisWeek = isoWeekOf(today);
  const write = async () => {
    setBusy(true);
    try { const f = await fetchJson<Feed>(`/api/coach/report?week=${data?.week ?? thisWeek}&make=1`); if (f) setData(f); } catch { /* the page keeps what it had */ }
    setBusy(false);
  };
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div className="cc-pagetitle" style={{ marginBottom: 0 }}>
        <div>
          <Link href="/train" style={{ fontSize: 14, color: "var(--ink-3)", textDecoration: "none" }}>‹ Train</Link>
          <h1 style={{ fontSize: 28, fontWeight: 600, marginTop: 4 }}>Your week</h1>
          <div className="sub">{r ? range(r.from, r.to) : loading ? "…" : "no report yet"}</div>
        </div>
      </div>

      {(data?.reports?.length ?? 0) > 1 && (
        <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "0 2px 2px" }}>
          {data!.reports.map((w) => (
            <Link key={w.week} href={w.week === data!.reports[0].week ? "/train/report" : `/train/report?week=${w.week}`} className="cc-pill" style={{ minHeight: 32, padding: "0 12px", fontSize: 13.5, whiteSpace: "nowrap", textDecoration: "none", background: w.week === (r?.week ?? data?.week) ? "var(--accent-soft)" : undefined }}>{range(w.from, w.to)}</Link>
          ))}
        </div>
      )}

      {r && <>
        <Reveal i={0}><section className="cc-card"><div className="cc-card-body" style={{ display: "grid", gap: 14 }}>
          <div style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.3, letterSpacing: "-0.01em" }}>{r.headline}</div>
          {sections(r.text).map((s) => (
            <div key={s.title} style={{ display: "grid", gap: 4 }}>
              <div style={{ fontSize: 12.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-4)", fontFamily: "var(--f-mono)" }}>{s.title}</div>
              <div style={{ fontSize: 16, lineHeight: 1.55, color: "var(--ink)", whiteSpace: "pre-wrap" }}>{s.body}</div>
            </div>
          ))}
        </div></section></Reveal>
        <Reveal i={1}><section className="cc-card">
          <div className="cc-card-head"><span className="title">Head · {r.head.title}</span></div>
          <div className="cc-card-body" style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 16, fontWeight: 500, color: "var(--violet)" }}>{r.head.cue}</div>
            <div style={{ fontSize: 15, lineHeight: 1.55, color: "var(--ink-2)" }}>{r.head.text}</div>
          </div>
        </section></Reveal>
        {r.objectives.length > 0 && <Reveal i={2}><section className="cc-card">
          <div className="cc-card-head"><span className="title">Objectives that week</span></div>
          <div className="cc-card-body" style={{ display: "grid", gap: 12 }}>
            {r.objectives.map((o) => (
              <div key={o.id} style={{ display: "grid", gap: 5 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, fontSize: 15 }}><span style={{ fontWeight: 600 }}>{o.title}</span><span className="tabular-nums" style={{ color: "var(--ink-3)" }}>{o.valueLabel}{o.targetLabel ? ` → ${o.targetLabel}` : ""}</span></div>
                <span className="cc-progress-track" style={{ height: 6 }}><span className="cc-progress-fill" style={{ display: "block", width: `${Math.max(2, o.pct * 100)}%`, background: stateColor(o.state) }} /></span>
              </div>
            ))}
          </div>
        </section></Reveal>}
        <Reveal i={3}><section className="cc-card"><div className="cc-card-body" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
          {[
            { k: "Training days", v: String(r.numbers.sessionDays) },
            { k: "Runs", v: `${r.numbers.runs.n} · ${r.numbers.runs.km} km` },
            { k: "Strength", v: `${r.numbers.strength.n} · ${r.numbers.strength.min} min` },
            { k: "Functional", v: r.numbers.kb.rounds !== null ? `${r.numbers.kb.rounds} rounds` : "—" },
            { k: "Sleep", v: r.numbers.sleep.avgMin !== null ? `${Math.floor(r.numbers.sleep.avgMin / 60)} h ${String(Math.round(r.numbers.sleep.avgMin % 60)).padStart(2, "0")}` : "—" },
            { k: "Resting HR", v: r.numbers.restingHr.week !== null ? `${Math.round(r.numbers.restingHr.week)} bpm` : "—" },
          ].map((t) => (
            <div key={t.k} style={{ display: "grid", gap: 2, padding: "8px 10px", borderRadius: 10, background: "var(--fill-1)", minWidth: 0 }}>
              <span style={{ fontSize: 12, color: "var(--ink-4)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.k}</span>
              <span className="tabular-nums" style={{ fontSize: 15, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.v}</span>
            </div>
          ))}
        </div></section></Reveal>
        {!week && <Reveal i={4}><BodyWeek h={health} today={today} /></Reveal>}
      </>}
      {!r && !week && data && <BodyWeek h={health} today={today} />}

      {!r && data && (
        <section className="cc-card"><div className="cc-card-body" style={{ display: "grid", gap: 12 }}>
          <div style={{ fontSize: 15.5, color: "var(--ink-2)", lineHeight: 1.5 }}>{data.error ? `The writer did not answer: ${data.error}` : "The coach writes the report every Sunday at 20:00, on the week that ends that day."}</div>
          <button className="cc-btn cc-btn-primary" onClick={write} disabled={busy} style={{ minHeight: 48, borderRadius: 12 }}>{busy ? "Writing…" : "Write it now"}</button>
        </div></section>
      )}
      {!data && loading && <div className="cc-skeleton" style={{ height: 240 }} />}
    </div>
  );
}
