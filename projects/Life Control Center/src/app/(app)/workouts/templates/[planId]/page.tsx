"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";

interface SetConfig {
  type: "standard" | "warmup" | "drop" | "failure";
  repMin: number;
  repMax: number;
  restS: number;
}

interface PlanExercise {
  id: number;
  sortOrder: number;
  setConfig: SetConfig[];
  exerciseId: number;
  name: string;
  primaryMuscle: string | null;
  equipment: string | null;
  weightIncrement: number;
  videoUrl: string | null;
  videoType: string | null;
}

interface Plan {
  id: number;
  name: string;
  type: string;
}

interface ExerciseOption {
  id: number;
  name: string;
  primaryMuscle: string | null;
  equipment: string | null;
}

const MUSCLE_LABELS: Record<string, string> = {
  chest: "Chest", front_delts: "Front Delts", side_delts: "Side Delts",
  rear_delts: "Rear Delts", triceps: "Triceps", biceps: "Biceps",
  lats: "Lats", upper_back: "Upper Back", upper_traps: "Traps",
  quads: "Quads", hamstrings: "Hams", glutes: "Glutes",
  calves: "Calves", abs: "Abs", obliques: "Obliques",
  forearms: "Forearms", serratus: "Serratus", unknown: "—",
};

const SET_TYPE_COLORS: Record<string, string> = {
  standard: "var(--ink-3)",
  warmup: "var(--cyan)",
  drop: "var(--warn)",
  failure: "var(--neg)",
};

export default function PlanEditorPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = use(params);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [exercises, setExercises] = useState<PlanExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [allExercises, setAllExercises] = useState<ExerciseOption[]>([]);
  const [pickerSearch, setPickerSearch] = useState("");
  const [editingSet, setEditingSet] = useState<{ peId: number; idx: number } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/workouts/plans/${planId}`).then((r) => r.json()),
      fetch(`/api/workouts/plans/${planId}/exercises`).then((r) => r.json()),
    ]).then(([planData, exData]) => {
      setPlan(planData);
      setExercises(exData);
      setLoading(false);
    });
  }, [planId]);

  async function openPicker() {
    if (allExercises.length === 0) {
      const data = await fetch("/api/workouts/exercises").then((r) => r.json());
      setAllExercises(data);
    }
    setShowPicker(true);
  }

  async function addExercise(exerciseId: number) {
    const res = await fetch(`/api/workouts/plans/${planId}/exercises`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exerciseId }),
    });
    if (res.ok) {
      const updated = await fetch(`/api/workouts/plans/${planId}/exercises`).then((r) => r.json());
      setExercises(updated);
      setShowPicker(false);
    }
  }

  async function removeExercise(peId: number) {
    await fetch(`/api/workouts/plan-exercises/${peId}`, { method: "DELETE" });
    setExercises((prev) => prev.filter((e) => e.id !== peId));
  }

  async function saveSetConfig(peId: number, newConfig: SetConfig[]) {
    await fetch(`/api/workouts/plan-exercises/${peId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setConfig: newConfig }),
    });
    setExercises((prev) =>
      prev.map((e) => (e.id === peId ? { ...e, setConfig: newConfig } : e))
    );
    setEditingSet(null);
  }

  const filteredExercises = allExercises.filter((e) =>
    e.name.toLowerCase().includes(pickerSearch.toLowerCase())
  );

  if (loading) {
    return (
      <div style={{ padding: "28px 32px", color: "var(--ink-4)" }}>Loading…</div>
    );
  }

  return (
    <div style={{ padding: "28px 32px 64px", maxWidth: 900, margin: "0 auto" }}>

      {/* Page title */}
      <div className="cc-pagetitle" style={{ marginBottom: 26 }}>
        <div>
          <h1>{plan?.name ?? "—"}<span className="grad-text">.</span></h1>
          <div className="sub">Template editor · {exercises.length} exercises</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/workouts/templates" className="cc-btn">← Templates</Link>
          <button className="cc-btn cc-btn-primary" onClick={openPicker}>+ Add exercise</button>
        </div>
      </div>

      {/* Exercise list */}
      <div className="cc-card">
        <div className="cc-card-head">
          <div className="title">Exercises</div>
          <div className="tail">{exercises.length} in this template</div>
        </div>
        <div style={{ padding: "4px 0" }}>
          {exercises.length === 0 && (
            <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--ink-4)", fontSize: 13 }}>
              No exercises yet. Add some using the button above.
            </div>
          )}
          {exercises.map((ex, idx) => (
            <div key={ex.id}>
              {/* Exercise row */}
              <div style={{
                display: "grid", gridTemplateColumns: "32px 1fr auto",
                alignItems: "center", gap: 16, padding: "14px 20px",
                borderBottom: idx < exercises.length - 1 ? "1px solid var(--line)" : "none",
              }}>
                {/* Number */}
                <span style={{ fontFamily: "var(--f-mono)", color: "var(--ink-4)", fontSize: 11, letterSpacing: "0.06em" }}>
                  {String(idx + 1).padStart(2, "0")}
                </span>

                {/* Exercise info */}
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>{ex.name}</div>
                  <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap" as const }}>
                    {ex.primaryMuscle && (
                      <span style={{ fontSize: 11, color: "var(--violet)", fontFamily: "var(--f-mono)", letterSpacing: "0.04em" }}>
                        {MUSCLE_LABELS[ex.primaryMuscle] ?? ex.primaryMuscle}
                      </span>
                    )}
                    {ex.equipment && (
                      <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{ex.equipment}</span>
                    )}
                    <span style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "var(--f-mono)" }}>
                      +{ex.weightIncrement}kg steps
                    </span>
                  </div>

                  {/* Set config pills */}
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" as const }}>
                    {ex.setConfig.map((s, si) => (
                      <span
                        key={si}
                        onClick={() => setEditingSet({ peId: ex.id, idx: si })}
                        style={{
                          fontSize: 10.5, fontFamily: "var(--f-mono)", letterSpacing: "0.04em",
                          padding: "3px 8px", borderRadius: 6, cursor: "pointer",
                          border: `1px solid ${SET_TYPE_COLORS[s.type]}40`,
                          color: SET_TYPE_COLORS[s.type],
                          background: `${SET_TYPE_COLORS[s.type]}12`,
                        }}
                      >
                        {s.type === "warmup" ? "WU" : s.type === "drop" ? "DROP" : s.type === "failure" ? "FAIL" : ""}
                        {s.repMin}–{s.repMax} {s.restS}s
                      </span>
                    ))}
                    <span
                      onClick={() => {
                        const newSet: SetConfig = { type: "standard", repMin: 8, repMax: 12, restS: 60 };
                        saveSetConfig(ex.id, [...ex.setConfig, newSet]);
                      }}
                      style={{
                        fontSize: 10.5, padding: "3px 8px", borderRadius: 6, cursor: "pointer",
                        border: "1px dashed var(--line-hi)", color: "var(--ink-4)",
                      }}
                    >
                      + set
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {ex.videoUrl ? (
                    <a href={ex.videoUrl} target="_blank" rel="noopener" style={{ fontSize: 11, color: "var(--cyan)" }}>▶ Video</a>
                  ) : (
                    <Link href={`/workouts/exercises?edit=${ex.exerciseId}`} style={{ fontSize: 11, color: "var(--ink-4)" }}>+ Video</Link>
                  )}
                  <button
                    onClick={() => removeExercise(ex.id)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-4)", fontSize: 16, padding: "4px", lineHeight: 1 }}
                    title="Remove from plan"
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Inline set editor (when a set pill is clicked) */}
              {editingSet?.peId === ex.id && (
                <SetEditor
                  setConfig={ex.setConfig}
                  editIdx={editingSet.idx}
                  onSave={(newConfig) => saveSetConfig(ex.id, newConfig)}
                  onClose={() => setEditingSet(null)}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Exercise picker modal */}
      {showPicker && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 50,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowPicker(false); }}
        >
          <div className="cc-card" style={{ width: 560, maxHeight: "70vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div className="cc-card-head">
              <div className="title">Add exercise to {plan?.name}</div>
              <button onClick={() => setShowPicker(false)} style={{ background: "none", border: "none", color: "var(--ink-4)", cursor: "pointer", fontSize: 18 }}>×</button>
            </div>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
              <input
                autoFocus
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder="Search exercises…"
                style={{
                  width: "100%", background: "var(--bg-input)", border: "1px solid var(--line)",
                  borderRadius: 8, padding: "10px 14px", color: "var(--ink)", fontSize: 13, outline: "none",
                }}
              />
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {filteredExercises.slice(0, 50).map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => addExercise(ex.id)}
                  style={{
                    width: "100%", textAlign: "left", padding: "12px 16px",
                    background: "transparent", border: "none", cursor: "pointer",
                    borderBottom: "1px solid var(--line)",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, color: "var(--ink)" }}>{ex.name}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
                      {ex.primaryMuscle ? MUSCLE_LABELS[ex.primaryMuscle] ?? ex.primaryMuscle : ""}
                      {ex.equipment ? ` · ${ex.equipment}` : ""}
                    </div>
                  </div>
                  <span style={{ fontSize: 18, color: "var(--ink-4)" }}>+</span>
                </button>
              ))}
              {filteredExercises.length === 0 && (
                <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--ink-4)", fontSize: 13 }}>
                  No exercises match "{pickerSearch}"
                </div>
              )}
            </div>
            <div style={{ padding: "12px 16px", borderTop: "1px solid var(--line)" }}>
              <Link href="/workouts/exercises" className="cc-btn" style={{ fontSize: 12 }}>
                + Create new exercise
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SetEditor({
  setConfig,
  editIdx,
  onSave,
  onClose,
}: {
  setConfig: SetConfig[];
  editIdx: number;
  onSave: (newConfig: SetConfig[]) => void;
  onClose: () => void;
}) {
  const [local, setLocal] = useState<SetConfig[]>(setConfig.map((s) => ({ ...s })));
  const s = local[editIdx];

  function updateField(field: keyof SetConfig, value: string | number) {
    setLocal((prev) =>
      prev.map((item, i) => (i === editIdx ? { ...item, [field]: value } : item))
    );
  }

  function removeSet() {
    onSave(setConfig.filter((_, i) => i !== editIdx));
  }

  return (
    <div style={{ padding: "12px 20px 16px", background: "rgba(179,136,255,0.04)", borderBottom: "1px solid var(--line)" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" as const }}>
        {/* Set type */}
        <label style={{ fontSize: 11, color: "var(--ink-3)" }}>
          Type
          <select
            value={s.type}
            onChange={(e) => updateField("type", e.target.value)}
            style={{ display: "block", marginTop: 4, background: "var(--bg-input)", border: "1px solid var(--line)", borderRadius: 6, padding: "6px 10px", color: "var(--ink)", fontSize: 12, cursor: "pointer" }}
          >
            <option value="standard">Standard</option>
            <option value="warmup">Warm-up</option>
            <option value="drop">Drop</option>
            <option value="failure">Failure</option>
          </select>
        </label>

        {/* Rep range */}
        <label style={{ fontSize: 11, color: "var(--ink-3)" }}>
          Rep Min
          <input type="number" value={s.repMin} onChange={(e) => updateField("repMin", parseInt(e.target.value))}
            style={{ display: "block", marginTop: 4, width: 64, background: "var(--bg-input)", border: "1px solid var(--line)", borderRadius: 6, padding: "6px 10px", color: "var(--ink)", fontSize: 12 }}
          />
        </label>
        <label style={{ fontSize: 11, color: "var(--ink-3)" }}>
          Rep Max
          <input type="number" value={s.repMax} onChange={(e) => updateField("repMax", parseInt(e.target.value))}
            style={{ display: "block", marginTop: 4, width: 64, background: "var(--bg-input)", border: "1px solid var(--line)", borderRadius: 6, padding: "6px 10px", color: "var(--ink)", fontSize: 12 }}
          />
        </label>
        <label style={{ fontSize: 11, color: "var(--ink-3)" }}>
          Rest (s)
          <input type="number" value={s.restS} onChange={(e) => updateField("restS", parseInt(e.target.value))}
            style={{ display: "block", marginTop: 4, width: 72, background: "var(--bg-input)", border: "1px solid var(--line)", borderRadius: 6, padding: "6px 10px", color: "var(--ink)", fontSize: 12 }}
          />
        </label>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <button onClick={removeSet} style={{ background: "rgba(255,80,80,0.1)", border: "1px solid rgba(255,80,80,0.3)", borderRadius: 6, padding: "6px 12px", color: "var(--neg)", fontSize: 12, cursor: "pointer" }}>
            Delete
          </button>
          <button onClick={onClose} style={{ background: "transparent", border: "1px solid var(--line)", borderRadius: 6, padding: "6px 12px", color: "var(--ink-3)", fontSize: 12, cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={() => onSave(local)} style={{ background: "var(--grad)", borderRadius: 6, padding: "6px 14px", color: "#0A0A14", fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none" }}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
