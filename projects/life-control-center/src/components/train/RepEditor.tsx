"use client";

/**
 * Inline rep / set / weight editor. Tap the numbers on an exercise → this sheet.
 * Big +/- buttons for sweaty thumbs. Saves on close.
 */

import { useState } from "react";
import type { TrainExercise } from "@/lib/train/types";

function Stepper({ label, value, min, max, step, suffix, onChange }: {
  label: string; value: number; min: number; max: number; step: number; suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 12, minHeight: 56 }}>
      <span style={{ fontSize: 15, color: "var(--ink-2)" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button className="cc-btn cc-btn-ghost" onClick={() => onChange(Math.max(min, +(value - step).toFixed(1)))} style={{ width: 52, height: 48, fontSize: 22, borderRadius: 12, padding: 0 }} aria-label={`less ${label}`}>−</button>
        <span className="tabular-nums" style={{ minWidth: 72, textAlign: "center", fontSize: 22, fontWeight: 600 }}>{value}{suffix}</span>
        <button className="cc-btn cc-btn-ghost" onClick={() => onChange(Math.min(max, +(value + step).toFixed(1)))} style={{ width: 52, height: 48, fontSize: 22, borderRadius: 12, padding: 0 }} aria-label={`more ${label}`}>+</button>
      </div>
    </div>
  );
}

export function RepEditor({ exercise, showSets, kettlebellKg, onSave, onClose }: {
  exercise: TrainExercise;
  showSets: boolean;
  kettlebellKg: number;
  onSave: (e: TrainExercise) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<TrainExercise>(exercise);
  const done = () => { onSave(draft); onClose(); };

  return (
    <>
      <div onClick={done} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.5)" }} />
      <div
        role="dialog"
        aria-label={`Edit ${exercise.name}`}
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 71,
          background: "var(--bg-chrome)", borderTop: "1px solid var(--line-hi)",
          borderRadius: "20px 20px 0 0", padding: "16px 20px calc(env(safe-area-inset-bottom) + 16px)",
          display: "grid", gap: 4, maxWidth: 560, margin: "0 auto",
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 6 }}>{exercise.name}</div>
        <Stepper label={exercise.perSide ? "Reps per side" : "Reps"} value={draft.reps} min={1} max={100} step={1}
                 onChange={(v) => setDraft({ ...draft, reps: v })} />
        {showSets && (
          <Stepper label="Sets" value={draft.sets} min={1} max={10} step={1}
                   onChange={(v) => setDraft({ ...draft, sets: v })} />
        )}
        {exercise.kettlebell ? (
          <div style={{ fontSize: 13, color: "var(--ink-3)", minHeight: 40, display: "flex", alignItems: "center" }}>
            Kettlebell: {kettlebellKg} kg — change it in Settings
          </div>
        ) : (
          <Stepper label="Weight" value={draft.weightKg ?? 0} min={0} max={100} step={0.5} suffix=" kg"
                   onChange={(v) => setDraft({ ...draft, weightKg: v || null })} />
        )}
        <button className="cc-btn cc-btn-primary" onClick={done} style={{ minHeight: 52, borderRadius: 14, fontSize: 16, marginTop: 8 }}>Done</button>
      </div>
    </>
  );
}
