"use client";

/**
 * The coach on /train → Body (spec §7c item 15, Ali 2026-10-04):
 *   ObjectivesCard · the goals with a live progress bar each (coach/types.ts objectiveProgress), tap
 *                    a row to edit title · target · date, mark done or remove; the 5 km ladder
 *                    offers its next step once a rung is done
 *   HeadLine       · this week's Head skill (fixed rule), one line inside the "This week" hero
 *   CoachCard      · the latest Sunday report's headline, the door to /train/report
 * Everything paints from the phone's copies (health summary, kettlebell overview, the coach feed).
 */

import Link from "next/link";
import { useState } from "react";
import { Fold, useDrawn } from "@/components/health/checkup";
import { useCoach } from "@/lib/coach/useCoach";
import { fmtSec, headSkillFor, nextRun5k, objectiveProgress, weekNumbers, type Objective, type ProgressData, type ProgressState } from "@/lib/coach/types";
import type { NightRow } from "@/lib/health/summary";

const stateColor = (s: ProgressState) => (s === "done" ? "var(--pos)" : s === "on" ? "var(--violet)" : s === "behind" ? "var(--warn)" : "var(--ink-4)");
const stateWord = (s: ProgressState) => (s === "done" ? "done" : s === "on" ? "on track" : s === "behind" ? "behind" : "waiting for data");
const fmtDue = (ymd: string) => new Date(ymd + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const parseSec = (s: string): number | null => { const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim()); if (m) return Number(m[1]) * 60 + Number(m[2]); const n = Number(s); return Number.isFinite(n) && n > 0 ? Math.round(n) : null; };

function ObjectiveRow({ o, data, i, drawn, onSave }: { o: Objective; data: ProgressData; i: number; drawn: boolean; onSave: (o: Objective, remove?: boolean) => void }) {
  const p = objectiveProgress(o, data);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(o.title);
  const [target, setTarget] = useState(o.kind === "run5k" ? fmtSec(o.target) : String(o.target));
  const [due, setDue] = useState(o.due);
  const next = p.state === "done" || o.done ? nextRun5k(o) : null;
  const save = () => {
    const t = o.kind === "run5k" ? parseSec(target) : Number(target);
    if (!title.trim() || t === null || !Number.isFinite(t) || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return;
    onSave({ ...o, title: title.trim(), target: t, due });
    setOpen(false);
  };
  return (
    <div style={{ display: "grid", gap: 8, padding: "12px 0", borderTop: i ? "1px solid var(--line)" : "none" }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} style={{ all: "unset", cursor: "pointer", display: "grid", gap: 6, minHeight: 44 }}>
        <span style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "baseline" }}>
          <span style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.3 }}>{o.title}</span>
          <span className="tabular-nums" style={{ fontSize: 13, color: stateColor(p.state), whiteSpace: "nowrap" }}>{stateWord(p.state)} · {fmtDue(o.due)}</span>
        </span>
        <span className="cc-progress-track" style={{ height: 6 }}>
          <span className="cc-progress-fill" style={{ display: "block", width: drawn ? `${Math.max(2, p.pct * 100)}%` : 0, background: stateColor(p.state), transition: `width 700ms var(--easeOut) ${150 + i * 90}ms` }} />
        </span>
        <span style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, fontSize: 13.5, color: "var(--ink-3)" }}>
          <span className="tabular-nums">{p.valueLabel}{p.targetLabel ? ` → ${p.targetLabel}` : ""}</span>
        </span>
        <span style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.45 }}>{p.line}</span>
      </button>
      <Fold open={open}>
        <div style={{ display: "grid", gap: 8, padding: "6px 0 2px" }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Objective" style={{ fontSize: 16, minHeight: 44, padding: "0 12px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--fill-1)", color: "inherit" }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label style={{ display: "grid", gap: 4, fontSize: 13, color: "var(--ink-3)" }}>{o.kind === "run5k" ? "Target (mm:ss)" : o.kind === "strengthWeeks" ? "Weeks" : o.kind === "kbRounds" ? "Rounds" : "VO2 max"}
              <input value={target} onChange={(e) => setTarget(e.target.value)} inputMode={o.kind === "run5k" ? "text" : "decimal"} style={{ fontSize: 16, minHeight: 44, padding: "0 12px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--fill-1)", color: "inherit" }} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 13, color: "var(--ink-3)" }}>By
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={{ fontSize: 16, minHeight: 44, padding: "0 12px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--fill-1)", color: "inherit" }} />
            </label>
          </div>
          {o.note && <div style={{ fontSize: 13.5, color: "var(--ink-3)", lineHeight: 1.45 }}>{o.note}</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="cc-btn cc-btn-primary" onClick={save} style={{ minHeight: 44, borderRadius: 12, padding: "0 16px" }}>Save</button>
            {next && <button className="cc-btn cc-btn-ghost" onClick={() => { onSave({ ...o, done: true }); onSave({ ...o, id: `run5k-${next.target}`, title: next.title, target: next.target, due: next.due, startedAt: data.today, startValue: p.value, done: false }); setOpen(false); }} style={{ minHeight: 44, borderRadius: 12, padding: "0 14px" }}>Next step · {next.title}</button>}
            {!o.done && !next && <button className="cc-btn cc-btn-ghost" onClick={() => { onSave({ ...o, done: true }); setOpen(false); }} style={{ minHeight: 44, borderRadius: 12, padding: "0 14px" }}>Mark done</button>}
            <button className="cc-btn cc-btn-ghost" onClick={() => onSave(o, true)} style={{ minHeight: 44, borderRadius: 12, padding: "0 14px", color: "var(--neg)", marginLeft: "auto" }}>Remove</button>
          </div>
        </div>
      </Fold>
    </div>
  );
}

export function ObjectivesCard({ data }: { data: ProgressData }) {
  const { data: feed, loading, saveObjective } = useCoach();
  const drawn = useDrawn();
  const live = (feed?.objectives ?? []).filter((o) => !o.done);
  const done = (feed?.objectives ?? []).filter((o) => o.done).length;
  return (
    <section className="cc-card">
      <div className="cc-card-head">
        <span className="title">Objectives</span>
        <span className="tail tabular-nums">{live.length ? `${live.filter((o) => objectiveProgress(o, data).state === "on").length} of ${live.length} on track${done ? ` · ${done} done` : ""}` : loading ? "…" : "none"}</span>
      </div>
      <div className="cc-card-body" style={{ paddingTop: 2, paddingBottom: 4 }}>
        {!feed && loading && <div className="cc-skeleton" style={{ height: 120, margin: "10px 0" }} />}
        {live.map((o, i) => <ObjectiveRow key={o.id} o={o} data={data} i={i} drawn={drawn} onSave={saveObjective} />)}
        {feed && !live.length && <div style={{ padding: "12px 0", fontSize: 15, color: "var(--ink-3)" }}>Every objective is done. Tell R2-D2 the next ones.</div>}
      </div>
    </section>
  );
}

/** This week's Head skill (fixed rule) as one line · lives inside the "This week" hero since 2026-10-07. */
export function HeadLine({ data, nights, missedSessions = 0 }: { data: ProgressData; nights: NightRow[]; missedSessions?: number }) {
  const { data: feed } = useCoach();
  const n = weekNumbers({ ...data, nights }, data.today);
  const run5k = (feed?.objectives ?? []).find((o) => o.kind === "run5k" && !o.done);
  const r5 = run5k ? objectiveProgress(run5k, data) : null;
  const head = headSkillFor(n, { missedSessions, run5kPct: r5 && r5.state !== "wait" ? r5.pct : null });
  return (
    <div style={{ display: "grid", gridTemplateColumns: "10px 1fr", gap: 10, alignItems: "start" }}>
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: 99, background: "var(--violet)", marginTop: 7 }} />
      <span style={{ fontSize: 14.5, color: "var(--ink-2)", lineHeight: 1.5 }}><strong style={{ color: "var(--ink)", fontWeight: 600 }}>Head this week · {head.title}.</strong> {head.cue}</span>
    </div>
  );
}

/** The coach's report door: the latest Sunday headline → /train/report. */
export function CoachCard() {
  const { data: feed } = useCoach();
  const latest = feed?.latest ?? null;
  const weekLabel = latest ? new Date(latest.to + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;
  return (
    <section className="cc-card">
      <div className="cc-card-head">
        <span className="title">Coach</span>
        <span className="tail">{latest ? `week to ${weekLabel}` : "first report Sunday evening"}</span>
      </div>
      <div className="cc-card-body" style={{ paddingTop: 8, paddingBottom: 8 }}>
        <Link href="/train/report" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", minHeight: 44, textDecoration: "none", color: "inherit" }}>
          <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 15.5, fontWeight: 500, lineHeight: 1.35 }}>{latest?.headline || "Your week in training"}</span>
            <span style={{ fontSize: 13.5, color: "var(--ink-3)" }}>{latest ? "Read the report" : "Written every Sunday at 20:00"}</span>
          </span>
          <span style={{ color: "var(--ink-3)", fontSize: 15 }}>Open ›</span>
        </Link>
      </div>
    </section>
  );
}
