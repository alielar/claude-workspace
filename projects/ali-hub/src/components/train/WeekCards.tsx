"use client";

/**
 * The training week on /train (Ali 2026-10-04, spec §7c item 15) · fixed rules from
 * src/lib/train/insights.ts, no AI:
 *   WeekCard   · the five planned sessions as a strip (done · today · missed · upcoming, extras
 *                after), readiness from last night, then up to four insight lines
 *   ReportCard · the last full week against the one before, folded closed
 * Everything paints from the phone's cached copies.
 */

import Link from "next/link";
import { useState } from "react";
import { DAY_LABELS } from "@/lib/train/types";
import { signalColor } from "@/lib/health/client";
import type { PlanSlot, Readiness, TrainInsight, WeekReport } from "@/lib/train/insights";
import { Fold, useDrawn } from "@/components/health/checkup";

const slotColor = (s: PlanSlot["state"]) => (s === "done" || s === "extra" ? "var(--pos)" : s === "today" ? "var(--violet)" : s === "missed" ? "var(--neg)" : "var(--fill-3)");
const toneColor = (t: TrainInsight["tone"]) => (t === "pos" ? "var(--pos)" : t === "neg" ? "var(--neg)" : t === "warn" ? "var(--warn)" : "var(--violet)");

/** One planned session · a dot in its state's colour, the day under it, the detail once done. */
function Slot({ s, i, drawn }: { s: PlanSlot; i: number; drawn: boolean }) {
  const filled = s.state === "done" || s.state === "extra" || s.state === "missed";
  const inner = (
    <>
      <span aria-hidden style={{ width: 12, height: 12, borderRadius: 99, border: `2px solid ${slotColor(s.state)}`, background: filled && drawn ? slotColor(s.state) : s.state === "today" ? "var(--accent-soft)" : "transparent", boxShadow: s.state === "today" ? "0 0 0 4px var(--accent-soft)" : "none", transition: `background 360ms var(--easeOut) ${150 + i * 90}ms`, justifySelf: "center" }} />
      <span style={{ fontSize: 13.5, fontWeight: 600, color: s.state === "upcoming" ? "var(--ink-3)" : s.state === "missed" ? "var(--neg)" : "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: "center" }}>{s.label}</span>
      <span className="tabular-nums" style={{ fontSize: 12, color: "var(--ink-4)", textAlign: "center", fontFamily: "var(--f-mono)" }}>{DAY_LABELS[s.day]}{s.state === "extra" ? " +" : ""}</span>
    </>
  );
  const style: React.CSSProperties = { display: "grid", gap: 4, minWidth: 0, padding: "6px 2px", textDecoration: "none", color: "inherit", opacity: s.state === "upcoming" ? 0.7 : 1 };
  return s.hkId ? <Link href={`/train/run/${encodeURIComponent(s.hkId)}`} style={style} aria-label={`${s.label} ${DAY_LABELS[s.day]} · ${s.detail ?? ""}`}>{inner}</Link> : <span style={style}>{inner}</span>;
}

export function WeekCard({ slots, ready, insights, sub }: { slots: PlanSlot[]; ready: Readiness; insights: TrainInsight[]; sub: string }) {
  const drawn = useDrawn();
  const planned = slots.filter((s) => s.state !== "extra");
  const done = slots.filter((s) => s.state === "done" || s.state === "extra").length;
  return (
    <section className="cc-card">
      <div className="cc-card-head">
        <span className="title">This week</span>
        <span className="tail tabular-nums">{planned.length ? `${done} of ${planned.length}` : "no plan yet"}</span>
      </div>
      <div className="cc-card-body" style={{ display: "grid", gap: 14 }}>
        {slots.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(slots.length, 6)}, minmax(0, 1fr))`, gap: 2 }}>
            {slots.map((s, i) => <Slot key={`${s.kind}-${s.date}-${i}`} s={s} i={i} drawn={drawn} />)}
          </div>
        )}
        <div style={{ fontSize: 13.5, color: "var(--ink-3)" }}>{sub}</div>
        {/* Readiness · one line, the dot in the signal's colour */}
        <div style={{ display: "grid", gridTemplateColumns: "10px 1fr", gap: 10, alignItems: "start", padding: "10px 12px", borderRadius: 12, background: "var(--fill-1)" }}>
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: 99, background: signalColor(ready.state), marginTop: 7 }} />
          <span style={{ display: "grid", gap: 2 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{ready.title}</span>
            <span style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.45 }}>{ready.text}</span>
          </span>
        </div>
        {insights.length > 0 && (
          <div style={{ display: "grid", gap: 12 }}>
            {insights.map((it) => (
              <div key={it.key} style={{ display: "grid", gridTemplateColumns: "10px 1fr", gap: 10, alignItems: "start" }}>
                <span aria-hidden style={{ width: 8, height: 8, borderRadius: 99, background: toneColor(it.tone), marginTop: 7 }} />
                <span style={{ display: "grid", gap: 3 }}>
                  <span style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.3 }}>{it.title}</span>
                  {it.text && <span style={{ fontSize: 14.5, color: "var(--ink-2)", lineHeight: 1.5 }}>{it.text}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/** The weekly training report · last Monday to Sunday against the week before, folded closed. */
export function ReportCard({ report }: { report: WeekReport | null }) {
  const [open, setOpen] = useState(false);
  if (!report) return null;
  const tone = (t: "pos" | "neg" | "flat") => (t === "pos" ? "var(--pos)" : t === "neg" ? "var(--neg)" : "var(--ink-3)");
  const range = (() => { const f = new Date(report.from + "T12:00:00"), t = new Date(report.to + "T12:00:00"); const d = (x: Date, m: boolean) => new Intl.DateTimeFormat("en-GB", { day: "numeric", ...(m ? { month: "short" } : {}) }).format(x); return `${d(f, f.getMonth() !== t.getMonth())} to ${d(t, true)}`; })();
  return (
    <section className="cc-card">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="cc-card-head" style={{ width: "100%", background: "none", color: "inherit", cursor: "pointer", font: "inherit", borderLeft: "none", borderRight: "none", borderTop: "none", borderBottom: open ? undefined : "none", borderRadius: open ? undefined : "inherit" }}>
        <span className="title">Last week</span>
        <span className="tail tabular-nums">{report.sessions.done} of {report.sessions.planned} · {range} <span aria-hidden style={{ display: "inline-block", transition: "transform var(--t-2) var(--easeOut)", transform: open ? "rotate(90deg)" : "none", marginLeft: 6 }}>›</span></span>
      </button>
      <Fold open={open}>
        <div className="cc-card-body" style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 15, color: "var(--ink-2)", lineHeight: 1.5 }}>{report.verdict}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
            {report.lines.map((l) => (
              <div key={l.label} style={{ display: "grid", gap: 2, padding: "8px 10px", borderRadius: 10, background: "var(--fill-1)", minWidth: 0 }}>
                <span style={{ fontSize: 12, color: "var(--ink-4)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.label}</span>
                <span className="tabular-nums" style={{ fontSize: 16, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.now}</span>
                {l.prev && <span className="tabular-nums" style={{ fontSize: 12, color: tone(l.tone), whiteSpace: "nowrap" }}>{l.tone === "pos" ? "↑" : l.tone === "neg" ? "↓" : "="} {l.prev}</span>}
              </div>
            ))}
          </div>
        </div>
      </Fold>
    </section>
  );
}
