"use client";

/**
 * Exercise editor. Tap the numbers on an exercise → this sheet.
 * Big +/- buttons for sweaty thumbs. Saves on close.
 * Also: rename, attach a how-to video link (YouTube / Instagram), add a new
 * exercise (isNew) and remove one (onRemove).
 */

import { useState } from "react";
import type { TrainExercise } from "@/lib/train/types";

function Stepper({ label, value, min, max, step, suffix, onChange }: {
  label: string; value: number; min: number; max: number; step: number; suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 12, minHeight: 56 }}>
      <span style={{ fontSize: 16, color: "var(--ink-2)" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button className="cc-btn cc-btn-ghost" onClick={() => onChange(Math.max(min, +(value - step).toFixed(1)))} style={{ width: 52, height: 48, fontSize: 22, borderRadius: 12, padding: 0 }} aria-label={`less ${label}`}>−</button>
        <span className="tabular-nums" style={{ minWidth: 72, textAlign: "center", fontSize: 22, fontWeight: 600 }}>{value}{suffix}</span>
        <button className="cc-btn cc-btn-ghost" onClick={() => onChange(Math.min(max, +(value + step).toFixed(1)))} style={{ width: 52, height: 48, fontSize: 22, borderRadius: 12, padding: 0 }} aria-label={`more ${label}`}>+</button>
      </div>
    </div>
  );
}

const chip = (on: boolean): React.CSSProperties => ({
  minHeight: 40, padding: "0 12px", borderRadius: 10, fontSize: 15, font: "inherit", cursor: "pointer",
  border: `1px solid ${on ? "var(--violet)" : "var(--line-hi)"}`, background: on ? "var(--accent-soft)" : "var(--fill-1)", color: on ? "var(--ink)" : "var(--ink-2)",
});

export function RepEditor({ exercise, showSets, kettlebellKg, isNew = false, onSave, onRemove, onClose }: {
  exercise: TrainExercise;
  showSets: boolean;
  kettlebellKg: number;
  isNew?: boolean;
  onSave: (e: TrainExercise) => void;
  onRemove?: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<TrainExercise>(exercise);
  const valid = draft.name.trim().length > 0;
  const done = () => {
    if (!valid) { onClose(); return; }
    const url = (draft.videoUrl ?? "").trim();
    onSave({ ...draft, name: draft.name.trim(), videoUrl: /^https?:\/\/\S+$/.test(url) ? url : null });
    onClose();
  };

  return (
    <>
      <div onClick={done} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.5)" }} />
      <div
        role="dialog"
        aria-label={isNew ? "New exercise" : `Edit ${exercise.name}`}
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 71,
          background: "var(--bg-chrome)", borderTop: "1px solid var(--line-hi)",
          borderRadius: "20px 20px 0 0", padding: "16px 20px calc(env(safe-area-inset-bottom) + 16px)",
          display: "grid", gap: 8, maxWidth: 560, margin: "0 auto", maxHeight: "90vh", overflowY: "auto",
        }}
      >
        <input className="cc-input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Exercise name" autoFocus={isNew} style={{ fontSize: 18, fontWeight: 600, minHeight: 48 }} />

        <Stepper label={draft.perSide ? "Reps per side" : "Reps"} value={draft.reps} min={1} max={100} step={1}
                 onChange={(v) => setDraft({ ...draft, reps: v })} />
        {showSets && (
          <Stepper label="Sets" value={draft.sets} min={1} max={10} step={1}
                   onChange={(v) => setDraft({ ...draft, sets: v })} />
        )}

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={() => setDraft({ ...draft, perSide: !draft.perSide })} style={chip(draft.perSide)}>Per side</button>
          <button onClick={() => setDraft({ ...draft, kettlebell: !draft.kettlebell })} style={chip(draft.kettlebell)}>Kettlebell</button>
        </div>

        {draft.kettlebell ? (
          <div style={{ fontSize: 15, color: "var(--ink-3)", minHeight: 36, display: "flex", alignItems: "center" }}>
            Kettlebell: {kettlebellKg} kg · change it in Settings
          </div>
        ) : (
          <Stepper label="Weight" value={draft.weightKg ?? 0} min={0} max={100} step={0.5} suffix=" kg"
                   onChange={(v) => setDraft({ ...draft, weightKg: v || null })} />
        )}

        <label style={{ display: "grid", gap: 4, fontSize: 14, color: "var(--ink-3)" }}>How-to video (YouTube or Instagram)
          <div style={{ display: "grid", gridTemplateColumns: draft.videoUrl ? "1fr auto" : "1fr", gap: 8 }}>
            <input className="cc-input" type="url" inputMode="url" value={draft.videoUrl ?? ""}
              onChange={(e) => setDraft({ ...draft, videoUrl: e.target.value || null })}
              placeholder="https://…" style={{ fontSize: 16, minHeight: 44, width: "100%", boxSizing: "border-box" }} />
            {draft.videoUrl && /^https?:\/\/\S+$/.test(draft.videoUrl.trim()) && (
              <a href={draft.videoUrl.trim()} target="_blank" rel="noopener noreferrer" className="cc-btn cc-btn-secondary"
                style={{ minHeight: 44, textDecoration: "none", borderRadius: 12 }}>▶ Watch</a>
            )}
          </div>
        </label>

        <div style={{ display: "grid", gridTemplateColumns: onRemove ? "1fr auto" : "1fr", gap: 10, marginTop: 4 }}>
          <button className="cc-btn cc-btn-primary" onClick={done} disabled={!valid} style={{ minHeight: 52, borderRadius: 14, fontSize: 17 }}>
            {isNew ? "Add exercise" : "Done"}
          </button>
          {onRemove && (
            <button className="cc-btn cc-btn-ghost" onClick={() => { if (confirm(`Remove ${exercise.name} from this workout?`)) { onRemove(); onClose(); } }}
              style={{ minHeight: 52, minWidth: 52, borderRadius: 14, padding: 0, color: "var(--neg)" }} aria-label="Remove exercise">✕</button>
          )}
        </div>
      </div>
    </>
  );
}
