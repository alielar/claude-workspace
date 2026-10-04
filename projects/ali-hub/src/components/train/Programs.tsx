"use client";

/**
 * A Speediance program on Train → Strength (Ali 2026-10-04): the session as he built it in the
 * Speediance app · one card per program, the day it is planned, the last time the Watch saw it,
 * the session summary Speediance quotes, then the moves (warm-up · training · stretch) with their
 * sets. The machine runs it; the card only shows the plan. Folded to the summary by default,
 * except today's program.
 */

import Link from "next/link";
import { useState } from "react";
import { fmtTonnes, programSummary, setsLabel, type Program } from "@/lib/train/programs";
import { DAY_LABELS, type DayCode } from "@/lib/train/types";
import { fmtDay, fmtDur, type WorkoutRow } from "@/lib/health/client";
import { Fold } from "@/components/health/checkup";

const PHASE_LABEL = { warm: "Warm-up", training: "Training", stretch: "Stretch" } as const;

export function ProgramCard({ p, days, sessions, today, isToday }: {
  p: Program;
  /** The Routine row's weekdays for this program. */
  days: DayCode[];
  /** Watch strength workouts matched to this program's days, newest first. */
  sessions: WorkoutRow[];
  today: string;
  isToday: boolean;
}) {
  const [open, setOpen] = useState(isToday);
  const sum = programSummary(p);
  const last = sessions[0] ?? null;
  const dayLine = days.length ? days.map((d) => DAY_LABELS[d]).join(" · ") : "no day set";
  return (
    <section className="cc-card" style={{ borderColor: isToday ? "var(--violet)" : undefined }}>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="cc-card-head" style={{ width: "100%", background: "none", color: "inherit", cursor: "pointer", font: "inherit", borderLeft: "none", borderRight: "none", borderTop: "none", borderBottom: open ? undefined : "none", borderRadius: open ? undefined : "inherit", alignItems: "center" }}>
        <span className="title" style={{ display: "inline-flex", alignItems: "baseline", gap: 8 }}>{p.name}<span style={{ fontSize: 13.5, fontWeight: 400, color: isToday ? "var(--violet)" : "var(--ink-3)" }}>{isToday ? "today" : dayLine}</span></span>
        <span className="tail">{last ? `last ${fmtDay(last.date, today).toLowerCase()}` : "not yet on the Watch"} <span aria-hidden style={{ display: "inline-block", transition: "transform var(--t-2) var(--easeOut)", transform: open ? "rotate(90deg)" : "none", marginLeft: 6 }}>›</span></span>
      </button>
      {/* The one-line summary always shows */}
      <div style={{ padding: open ? "12px 14px 4px" : "12px 14px 14px", display: "grid", gap: 6 }}>
        <div style={{ fontSize: 14.5, color: "var(--ink-2)" }}>{p.muscles}</div>
        <div className="tabular-nums" style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: 13.5, color: "var(--ink-3)" }}>
          <span>{p.planned.minutes} min</span>
          <span>{sum.moves} moves · {sum.sets} sets</span>
          <span>{fmtTonnes(p.planned.kg)} lifted</span>
          <span>{p.planned.kcal} kcal</span>
          {sessions.length > 0 && <span>{sessions.length} on the Watch</span>}
        </div>
      </div>
      <Fold open={open}>
        <div style={{ padding: "6px 14px 14px", display: "grid", gap: 2 }}>
          {p.moves.map((m, i) => {
            const first = i === 0 || p.moves[i - 1].phase !== m.phase;
            return (
              <div key={`${m.name}-${i}`} style={{ display: "grid", gap: 2 }}>
                {first && <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-3)", padding: i === 0 ? "4px 0 6px" : "12px 0 6px" }}>{PHASE_LABEL[m.phase]}</div>}
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "baseline", minHeight: 40, padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                  <span style={{ fontSize: m.phase === "training" ? 15.5 : 14.5, fontWeight: m.phase === "training" ? 500 : 400, color: m.phase === "training" ? "var(--ink)" : "var(--ink-2)", minWidth: 0, overflowWrap: "anywhere" }}>{m.name}</span>
                  <span className="tabular-nums" style={{ fontSize: 14, color: "var(--ink-3)", whiteSpace: "nowrap" }}>{setsLabel(m)}</span>
                </div>
              </div>
            );
          })}
          {sessions.length > 0 && (
            <div style={{ paddingTop: 12, display: "grid", gap: 2 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-3)", padding: "4px 0 6px" }}>On the Watch</div>
              {sessions.slice(0, 5).map((w) => (
                <Link key={w.hkId} href={`/train/run/${encodeURIComponent(w.hkId)}`} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", minHeight: 44, padding: "6px 0", borderBottom: "1px solid var(--line)", textDecoration: "none", color: "inherit" }}>
                  <span style={{ fontSize: 15 }}>{fmtDay(w.date, today)}</span>
                  <span className="tabular-nums" style={{ fontSize: 14.5, color: "var(--ink-2)", whiteSpace: "nowrap" }}>{fmtDur(w.durationSec)}{w.hrAvg !== null ? ` · ${w.hrAvg} bpm` : ""}{w.activeKcal !== null ? ` · ${w.activeKcal} kcal` : ""} <span style={{ color: "var(--ink-4)" }}>›</span></span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </Fold>
    </section>
  );
}
