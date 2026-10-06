"use client";

/**
 * The training week on /train (Ali 2026-10-04, spec §7c item 15) · fixed rules from
 * src/lib/train/insights.ts, no AI:
 *   WeekStrip  · the seven days, one session each (program.ts), done · today · missed · upcoming
 *   TodayCard  · today's session, its state and the button, readiness in plain words
 *   NotesCard  · up to three lines from the numbers
 *   ReportCard · the last full week against the one before, folded closed
 * Everything paints from the phone's cached copies.
 */

import Link from "next/link";
import { useState } from "react";
import { DAY_LABELS } from "@/lib/train/types";
import { signalColor } from "@/lib/health/client";
import { PROGRAM, sessionByKey } from "@/lib/train/program";
import type { DaySlot, Readiness, SlotState, TrainInsight, WeekReport } from "@/lib/train/insights";
import { Fold, useDrawn } from "@/components/health/checkup";

const toneColor = (t: TrainInsight["tone"]) => (t === "pos" ? "var(--pos)" : t === "neg" ? "var(--neg)" : t === "warn" ? "var(--warn)" : "var(--violet)");
const stateColor = (s: SlotState) => (s === "done" ? "var(--pos)" : s === "today" ? "var(--violet)" : s === "missed" ? "var(--neg)" : "var(--line-strong)");

/**
 * The week · seven cells, Monday to Sunday: the session's short name (or a quiet "rest"), the
 * day under it, a dot in the day's state. Today is framed in the accent. One session a day, so
 * the strip can never show two things on one day. Tap a done day → its Watch page.
 */
export function WeekStrip({ slots, today }: { slots: DaySlot[]; today: string }) {
  const drawn = useDrawn();
  return (
    <div role="list" aria-label="This week" style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4 }}>
      {slots.map((d, i) => {
        const s = d.session ? sessionByKey(d.session) : null;
        const isToday = d.date === today;
        const inner = (
          <>
            <span className="tabular-nums" style={{ fontSize: 11.5, color: isToday ? "var(--violet)" : "var(--ink-4)", fontFamily: "var(--f-mono)", fontWeight: isToday ? 700 : 500 }}>{DAY_LABELS[d.day].toUpperCase().slice(0, 2)}</span>
            <span style={{ fontSize: 13, fontWeight: s ? 600 : 400, lineHeight: 1.2, color: !s ? "var(--ink-4)" : d.state === "missed" ? "var(--neg)" : d.state === "upcoming" ? "var(--ink-2)" : "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{s ? s.short : "rest"}</span>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 99, border: `2px solid ${s ? stateColor(d.state) : "transparent"}`, background: s && (d.state === "done" || d.state === "missed") && drawn ? stateColor(d.state) : "transparent", transition: `background 360ms var(--easeOut) ${120 + i * 70}ms` }} />
            {d.extra?.length ? <span aria-label="extra session" style={{ fontSize: 10, color: "var(--pos)", lineHeight: 1 }}>+{d.extra.length}</span> : null}
          </>
        );
        const style: React.CSSProperties = { display: "grid", justifyItems: "center", alignContent: "start", gap: 5, padding: "8px 2px 7px", borderRadius: 12, minWidth: 0, textDecoration: "none", color: "inherit", background: isToday ? "var(--accent-soft)" : "transparent", border: `1px solid ${isToday ? "var(--violet)" : "transparent"}` };
        const label = `${DAY_LABELS[d.day]} · ${s ? s.name : "rest"}${d.detail ? ` · ${d.detail}` : ""}`;
        return d.hkId
          ? <Link key={d.date} role="listitem" href={`/train/run/${encodeURIComponent(d.hkId)}`} style={style} aria-label={label}>{inner}</Link>
          : <span key={d.date} role="listitem" style={style} aria-label={label}>{inner}</span>;
      })}
    </div>
  );
}

/**
 * Today's session · the big card: the session's name and what it is, its state (done with the
 * numbers · planned with the button · rest day with what comes next), and readiness in plain
 * words. Before the program starts (2026-10-05) it announces Monday instead.
 */
export function TodayCard({ slot, next, ready, before }: { slot: DaySlot; next: DaySlot | null; ready: Readiness; before: boolean }) {
  const s = slot.session ? sessionByKey(slot.session) : null;
  const n = next?.session ? sessionByKey(next.session) : null;
  const title = before ? "New program from Monday" : !s ? "Rest day" : slot.state === "done" ? `${s.name} · done` : s.name;
  const line = before ? `${PROGRAM.map((x) => `${x.name} ${DAY_LABELS[x.day]}`).join(" · ")}. One session a day, two rest days.`
    : !s ? (n ? `Next: ${n.name} ${DAY_LABELS[next!.day]}.` : "Nothing planned this week.")
    : slot.state === "done" ? (slot.detail ?? s.what)
    : s.what;
  return (
    <section className="cc-card" style={{ borderColor: !before && s && slot.state !== "done" ? "var(--violet)" : undefined }}>
      <div className="cc-card-body" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 13.5, color: "var(--ink-3)" }}>{before ? "This week" : "Today"}</span>
          <span style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.15, color: slot.state === "done" ? "var(--pos)" : "var(--ink)" }}>{title}</span>
          <span style={{ fontSize: 15, color: "var(--ink-2)", lineHeight: 1.45 }}>{line}</span>
        </div>
        {!before && s && slot.state !== "done" && (
          <div style={{ display: "grid", gap: 8 }}>
            <Link href={s.href} className="cc-btn cc-btn-primary" style={{ minHeight: 52, fontSize: 17, borderRadius: 14, textDecoration: "none" }}>{s.action}</Link>
            <span style={{ fontSize: 13.5, color: "var(--ink-3)", lineHeight: 1.45 }}>{s.how}</span>
          </div>
        )}
        {!before && slot.state === "done" && slot.hkId && <Link href={`/train/run/${encodeURIComponent(slot.hkId)}`} style={{ fontSize: 15, color: "var(--violet)", textDecoration: "none", minHeight: 44, display: "inline-flex", alignItems: "center" }}>Open the session ›</Link>}
        {/* Readiness · one line, the dot in the signal's colour, no score */}
        {ready.state !== "wait" && (
          <div style={{ display: "grid", gridTemplateColumns: "10px 1fr", gap: 10, alignItems: "start", padding: "10px 12px", borderRadius: 12, background: "var(--fill-1)" }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 99, background: signalColor(ready.state), marginTop: 7 }} />
            <span style={{ display: "grid", gap: 2 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{ready.title}</span>
              <span style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.45 }}>{ready.text}</span>
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Today inside the "This week" hero (REDESIGN 2026-10-07, summary first): the session's name and
 * what it is on the left, the Start button on the right · done = the numbers · rest = what is next.
 */
export function TodayBlock({ slot, next, before }: { slot: DaySlot; next: DaySlot | null; before: boolean }) {
  const s = slot.session ? sessionByKey(slot.session) : null;
  const n = next?.session ? sessionByKey(next.session) : null;
  const title = before ? "New program from Monday" : !s ? "Rest day" : slot.state === "done" ? `${s.name} · done` : `${s.name} · today`;
  const line = before ? `${PROGRAM.map((x) => `${x.name} ${DAY_LABELS[x.day]}`).join(" · ")}. One session a day, two rest days.`
    : !s ? (n ? `Next: ${n.name} ${DAY_LABELS[next!.day]}.` : "Nothing planned this week.")
    : slot.state === "done" ? (slot.detail ?? s.what)
    : s.what;
  const live = !before && s && slot.state !== "done";
  return (
    <div style={{ display: "grid", gridTemplateColumns: live ? "minmax(0, 1fr) auto" : "minmax(0, 1fr)", gap: 12, alignItems: "center", padding: "12px 14px", borderRadius: 12, background: live ? "var(--accent-soft)" : "var(--fill-1)" }}>
      <span style={{ display: "grid", gap: 3, minWidth: 0 }}>
        <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.2, color: slot.state === "done" ? "var(--pos)" : "var(--ink)" }}>{title}</span>
        <span style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.45 }}>{line}</span>
        {live && <span style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.4 }}>{s.how}</span>}
        {!before && slot.state === "done" && slot.hkId && <Link href={`/train/run/${encodeURIComponent(slot.hkId)}`} style={{ fontSize: 14, color: "var(--violet)", textDecoration: "none", minHeight: 32, display: "inline-flex", alignItems: "center" }}>Open the session ›</Link>}
      </span>
      {live && <Link href={s.href} className="cc-btn cc-btn-primary" style={{ minHeight: 46, padding: "0 18px", fontSize: 16, borderRadius: 12, textDecoration: "none", whiteSpace: "nowrap" }}>{s.action}</Link>}
    </div>
  );
}

/** What the numbers say · up to three lines, folded into one quiet card. */
export function NotesCard({ insights }: { insights: TrainInsight[] }) {
  if (!insights.length) return null;
  return (
    <section className="cc-card">
      <div className="cc-card-head"><span className="title">Notes</span><span className="tail">from the numbers</span></div>
      <div className="cc-card-body" style={{ display: "grid", gap: 12 }}>
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
