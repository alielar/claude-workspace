"use client";

import { useEffect, useState, useMemo } from "react";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Plan {
  id: number;
  name: string;
  type: string;
  sortOrder: number;
  assignedDays: string[];
  targetMuscles: string[];
  exerciseCount: number;
}

interface LibExercise {
  id: number;
  name: string;
  primaryMuscle: string | null;
  equipment: string | null;
}

interface SelectedExercise {
  exerciseId: number;
  name: string;
  primaryMuscle: string | null;
  sets: number;
  reps: string;
  restS: number;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const ALL_MUSCLES = [
  "chest", "lats", "upper_back", "traps",
  "front_delts", "side_delts", "rear_delts",
  "biceps", "triceps", "forearms",
  "quads", "hamstrings", "glutes", "calves",
  "abs", "obliques",
];

const MUSCLE_LABELS: Record<string, string> = {
  chest: "Chest", lats: "Lats", upper_back: "Upper Back", traps: "Traps",
  front_delts: "Front Delts", side_delts: "Side Delts", rear_delts: "Rear Delts",
  biceps: "Biceps", triceps: "Triceps", forearms: "Forearms",
  quads: "Quads", hamstrings: "Hams", glutes: "Glutes", calves: "Calves",
  abs: "Abs", obliques: "Obliques",
};

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABELS: Record<string, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function WorkoutsPanel() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);

  // New workout form state
  const [newName, setNewName] = useState("");
  const [newMuscles, setNewMuscles] = useState<string[]>([]);
  const [newDays, setNewDays] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Exercise picker state
  const [showPicker, setShowPicker] = useState(false);
  const [exerciseLib, setExerciseLib] = useState<LibExercise[]>([]);
  const [libLoading, setLibLoading] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerMuscle, setPickerMuscle] = useState<string | null>(null);
  const [selectedExercises, setSelectedExercises] = useState<SelectedExercise[]>([]);

  // Inline exercise creation (inside picker)
  const [showInlineCreate, setShowInlineCreate] = useState(false);
  const [inlineName, setInlineName] = useState("");
  const [inlineMuscle, setInlineMuscle] = useState("");
  const [inlineEquipment, setInlineEquipment] = useState("");
  const [inlineSaving, setInlineSaving] = useState(false);
  const [inlineError, setInlineError] = useState("");

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editMuscles, setEditMuscles] = useState<string[]>([]);
  const [editDays, setEditDays] = useState<string[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // Edit exercises state
  interface EditPlanExercise {
    id: number; // plan_exercises.id
    exerciseId: number;
    name: string;
    primaryMuscle: string | null;
    sortOrder: number;
    setConfig: { type: string; repMin: number; repMax: number; restS?: number }[];
  }
  const [editExercises, setEditExercises] = useState<EditPlanExercise[]>([]);
  const [editExLoading, setEditExLoading] = useState(false);
  const [showEditPicker, setShowEditPicker] = useState(false);

  function loadPlans() {
    setLoadError(false);
    fetch("/api/workouts/plans")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data) => { setPlans(data); setLoading(false); })
      .catch(() => { setLoadError(true); setLoading(false); });
  }

  useEffect(() => { loadPlans(); }, []);

  function loadExerciseLib(forceRefresh = false) {
    if (exerciseLib.length > 0 && !forceRefresh) return;
    setLibLoading(true);
    fetch("/api/workouts/exercises")
      .then((r) => r.json())
      .then((data) => { setExerciseLib(data); setLibLoading(false); })
      .catch(() => setLibLoading(false));
  }

  const filteredLib = useMemo(() => {
    const selectedIds = new Set(selectedExercises.map((e) => e.exerciseId));
    return exerciseLib.filter((e) => {
      if (selectedIds.has(e.id)) return false;
      if (pickerSearch && !e.name.toLowerCase().includes(pickerSearch.toLowerCase())) return false;
      if (pickerMuscle && e.primaryMuscle !== pickerMuscle) return false;
      return true;
    });
  }, [exerciseLib, selectedExercises, pickerSearch, pickerMuscle]);

  function addExercise(ex: LibExercise) {
    setSelectedExercises((prev) => [...prev, {
      exerciseId: ex.id, name: ex.name, primaryMuscle: ex.primaryMuscle,
      sets: 3, reps: "8-12", restS: 90,
    }]);
    setShowPicker(false);
    setShowInlineCreate(false);
    setPickerSearch("");
    setPickerMuscle(null);
  }

  async function createInlineExercise() {
    if (!inlineName.trim()) return;
    // Check for duplicates (case-insensitive)
    const nameNorm = inlineName.trim().toLowerCase();
    const dup = exerciseLib.find((e) => e.name.toLowerCase() === nameNorm);
    if (dup) { setInlineError("An exercise with this name already exists"); return; }
    setInlineSaving(true);
    setInlineError("");
    try {
      const res = await fetch("/api/workouts/exercises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: inlineName.trim(),
          primaryMuscle: inlineMuscle || null,
          equipment: inlineEquipment || null,
          trackingType: "reps_weight",
          weightIncrement: 2.5,
        }),
      });
      if (!res.ok) throw new Error();
      const newEx = await res.json();
      // Add to library cache
      setExerciseLib((prev) => [...prev, newEx]);
      // Auto-select the new exercise
      addExercise({ id: newEx.id, name: newEx.name, primaryMuscle: newEx.primaryMuscle, equipment: newEx.equipment });
      // Reset inline form
      setInlineName(""); setInlineMuscle(""); setInlineEquipment("");
      setShowInlineCreate(false);
    } catch {
      setInlineError("Failed to create exercise");
    } finally {
      setInlineSaving(false);
    }
  }

  function removeExercise(exerciseId: number) {
    setSelectedExercises((prev) => prev.filter((e) => e.exerciseId !== exerciseId));
  }

  function updateExercise(exerciseId: number, field: "sets" | "reps" | "restS", value: string | number) {
    setSelectedExercises((prev) => prev.map((e) =>
      e.exerciseId === exerciseId ? { ...e, [field]: value } : e
    ));
  }

  async function createWorkout() {
    if (!newName.trim() || selectedExercises.length === 0) return;
    setSaving(true);
    const res = await fetch("/api/workouts/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
        targetMuscles: newMuscles,
        assignedDays: newDays,
      }),
    });
    if (res.ok) {
      const plan = await res.json();
      // Add exercises to the plan
      for (let i = 0; i < selectedExercises.length; i++) {
        const ex = selectedExercises[i];
        // Parse reps string like "8-12" into repMin/repMax
        const repParts = ex.reps.split("-").map((s) => parseInt(s.trim()));
        const repMin = repParts[0] || 8;
        const repMax = repParts[1] || repMin;
        const setConfig = Array.from({ length: ex.sets }, () => ({
          type: "standard", repMin, repMax, restS: ex.restS,
        }));
        await fetch(`/api/workouts/plans/${plan.id}/exercises`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ exerciseId: ex.exerciseId, sortOrder: i, setConfig }),
        });
      }
      setPlans((prev) => [...prev, { ...plan, exerciseCount: selectedExercises.length }]);
      setNewName("");
      setNewMuscles([]);
      setNewDays([]);
      setSelectedExercises([]);
      setShowNewForm(false);
      window.dispatchEvent(new Event("workouts-data-changed"));
    }
    setSaving(false);
  }

  function startEdit(plan: Plan) {
    setEditingId(plan.id);
    setEditName(plan.name);
    setEditMuscles([...plan.targetMuscles]);
    setEditDays([...plan.assignedDays]);
    setDeleteConfirm(null);
    setShowEditPicker(false);
    // Load plan exercises
    setEditExLoading(true);
    fetch(`/api/workouts/plans/${plan.id}/exercises`)
      .then(r => r.json())
      .then((data: { id: number; exerciseId: number; name: string; primaryMuscle: string | null; sortOrder: number; setConfig: { type: string; repMin: number; repMax: number; restS?: number }[] }[]) => {
        setEditExercises(data.map(e => ({
          id: e.id,
          exerciseId: e.exerciseId,
          name: e.name,
          primaryMuscle: e.primaryMuscle,
          sortOrder: e.sortOrder,
          setConfig: e.setConfig,
        })));
        setEditExLoading(false);
      })
      .catch(() => setEditExLoading(false));
  }

  async function saveEdit() {
    if (!editingId || !editName.trim()) return;
    setEditSaving(true);
    // Save plan details
    await fetch(`/api/workouts/plans/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName.trim(),
        targetMuscles: editMuscles,
        assignedDays: editDays,
      }),
    });
    // Save exercise sort orders
    for (let i = 0; i < editExercises.length; i++) {
      const ex = editExercises[i];
      if (ex.sortOrder !== i) {
        await fetch(`/api/workouts/plan-exercises/${ex.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sortOrder: i }),
        });
      }
    }
    setPlans((prev) =>
      prev.map((p) =>
        p.id === editingId
          ? { ...p, name: editName.trim(), targetMuscles: editMuscles, assignedDays: editDays, exerciseCount: editExercises.length }
          : p
      )
    );
    setEditingId(null);
    setEditSaving(false);
    window.dispatchEvent(new Event("workouts-data-changed"));
  }

  async function deleteWorkout(id: number) {
    await fetch(`/api/workouts/plans/${id}`, { method: "DELETE" });
    setPlans((prev) => prev.filter((p) => p.id !== id));
    setDeleteConfirm(null);
    if (editingId === id) setEditingId(null);
    window.dispatchEvent(new Event("workouts-data-changed"));
  }

  function moveExercise(idx: number, dir: -1 | 1) {
    setEditExercises(prev => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  async function removeEditExercise(peId: number) {
    await fetch(`/api/workouts/plan-exercises/${peId}`, { method: "DELETE" });
    setEditExercises(prev => prev.filter(e => e.id !== peId));
  }

  function updateSetCount(exIdx: number, count: number) {
    setEditExercises(prev => {
      const next = [...prev];
      const ex = { ...next[exIdx] };
      const current = ex.setConfig;
      if (count > current.length) {
        const template = current[current.length - 1] ?? { type: "working", repMin: 8, repMax: 12, restS: 90 };
        ex.setConfig = [...current, ...Array.from({ length: count - current.length }, () => ({ ...template }))];
      } else {
        ex.setConfig = current.slice(0, count);
      }
      next[exIdx] = ex;
      return next;
    });
  }

  function updateRepRange(exIdx: number, repMin: number, repMax: number) {
    setEditExercises(prev => {
      const next = [...prev];
      const ex = { ...next[exIdx] };
      ex.setConfig = ex.setConfig.map(s => ({ ...s, repMin, repMax }));
      next[exIdx] = ex;
      return next;
    });
  }

  async function addEditExercise(ex: LibExercise) {
    if (!editingId) return;
    const res = await fetch(`/api/workouts/plans/${editingId}/exercises`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        exerciseId: ex.id,
        sortOrder: editExercises.length,
        setConfig: [
          { type: "standard", repMin: 8, repMax: 12 },
          { type: "standard", repMin: 8, repMax: 12 },
          { type: "standard", repMin: 8, repMax: 12 },
        ],
      }),
    });
    if (res.ok) {
      const row = await res.json();
      setEditExercises(prev => [...prev, {
        id: row.id,
        exerciseId: ex.id,
        name: ex.name,
        primaryMuscle: ex.primaryMuscle,
        sortOrder: prev.length,
        setConfig: [
          { type: "standard", repMin: 8, repMax: 12 },
          { type: "standard", repMin: 8, repMax: 12 },
          { type: "standard", repMin: 8, repMax: 12 },
        ],
      }]);
    }
    setShowEditPicker(false);
  }

  function toggleChip(arr: string[], val: string, setter: (v: string[]) => void) {
    setter(arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "0 24px 40px" }}>

      {/* Panel header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>
            Workouts<span className="grad-text">.</span>
          </h2>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>{plans.length} workouts · assign days, pick exercises, go</div>
        </div>
        <button
          onClick={() => { setShowNewForm(true); setEditingId(null); }}
          className="cc-btn cc-btn-primary"
          style={{ fontSize: 12 }}
        >
          + New workout
        </button>
      </div>

      {/* ── New workout form ──────────────────────────────────────────── */}
      {showNewForm && (
        <div className="cc-card" style={{ marginBottom: 14 }}>
          <div className="cc-card-head">
            <div className="title">New workout</div>
            <button onClick={() => setShowNewForm(false)} style={{ background: "none", border: "none", color: "var(--ink-4)", cursor: "pointer", fontSize: 16 }}>×</button>
          </div>
          <div className="cc-card-body">
            {/* Name */}
            <label style={{ fontSize: 11, color: "var(--ink-3)", display: "block", marginBottom: 16 }}>
              Title
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Push, Pull, Legs, Upper…"
                style={{
                  display: "block", width: "100%", marginTop: 6,
                  background: "var(--bg-input)", border: "1px solid var(--line)",
                  borderRadius: 8, padding: "10px 14px", color: "var(--ink)", fontSize: 14,
                  outline: "none",
                }}
              />
            </label>

            {/* Target muscles */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 8 }}>Target muscle groups</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {ALL_MUSCLES.map((m) => (
                  <button
                    key={m}
                    onClick={() => toggleChip(newMuscles, m, setNewMuscles)}
                    style={{
                      padding: "5px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                      border: `1px solid ${newMuscles.includes(m) ? "var(--violet)" : "var(--line)"}`,
                      background: newMuscles.includes(m) ? "rgba(124,77,255,0.15)" : "transparent",
                      color: newMuscles.includes(m) ? "var(--violet)" : "var(--ink-3)",
                      transition: "all 0.12s",
                    }}
                  >
                    {MUSCLE_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>

            {/* Assigned days */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 8 }}>Days of week</div>
              <div style={{ display: "flex", gap: 6 }}>
                {DAYS.map((d) => (
                  <button
                    key={d}
                    onClick={() => toggleChip(newDays, d, setNewDays)}
                    style={{
                      width: 48, height: 40, borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer",
                      border: `1px solid ${newDays.includes(d) ? "var(--cyan)" : "var(--line)"}`,
                      background: newDays.includes(d) ? "rgba(100,255,218,0.12)" : "transparent",
                      color: newDays.includes(d) ? "var(--cyan)" : "var(--ink-3)",
                      transition: "all 0.12s",
                    }}
                  >
                    {DAY_LABELS[d]}
                  </button>
                ))}
              </div>
            </div>

            {/* Exercises */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
                  Exercises{selectedExercises.length === 0 && <span style={{ color: "var(--neg)", marginLeft: 6 }}>*required</span>}
                </div>
                <button
                  onClick={() => { setShowPicker(true); loadExerciseLib(); }}
                  style={{
                    padding: "4px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                    border: "1px solid var(--line)", background: "transparent", color: "var(--cyan)",
                  }}
                >
                  + Add exercise
                </button>
              </div>

              {/* Selected exercises list */}
              {selectedExercises.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {selectedExercises.map((ex, i) => (
                    <div key={ex.exerciseId} style={{
                      display: "grid", gridTemplateColumns: "24px 1fr auto",
                      alignItems: "center", gap: 10, padding: "10px 12px",
                      border: "1px solid var(--line)", borderRadius: 8,
                      background: "rgba(255,255,255,0.018)",
                    }}>
                      <span style={{ fontFamily: "var(--f-mono)", color: "var(--ink-4)", fontSize: 10 }}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <div style={{ fontSize: 13, color: "var(--ink)" }}>{ex.name}</div>
                        <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center" }}>
                          <label style={{ fontSize: 10, color: "var(--ink-4)", display: "flex", alignItems: "center", gap: 3 }}>
                            Sets
                            <input
                              type="number" min={1} max={10} value={ex.sets}
                              onChange={(e) => updateExercise(ex.exerciseId, "sets", parseInt(e.target.value) || 1)}
                              style={{
                                width: 36, padding: "2px 4px", borderRadius: 4, fontSize: 11,
                                background: "var(--bg-input)", border: "1px solid var(--line)",
                                color: "var(--ink)", textAlign: "center", outline: "none",
                              }}
                            />
                          </label>
                          <label style={{ fontSize: 10, color: "var(--ink-4)", display: "flex", alignItems: "center", gap: 3 }}>
                            Reps
                            <input
                              value={ex.reps}
                              onChange={(e) => updateExercise(ex.exerciseId, "reps", e.target.value)}
                              placeholder="8-12"
                              style={{
                                width: 48, padding: "2px 4px", borderRadius: 4, fontSize: 11,
                                background: "var(--bg-input)", border: "1px solid var(--line)",
                                color: "var(--ink)", textAlign: "center", outline: "none",
                              }}
                            />
                          </label>
                          <label style={{ fontSize: 10, color: "var(--ink-4)", display: "flex", alignItems: "center", gap: 3 }}>
                            Rest
                            <input
                              type="number" min={0} max={300} step={15} value={ex.restS}
                              onChange={(e) => updateExercise(ex.exerciseId, "restS", parseInt(e.target.value) || 60)}
                              style={{
                                width: 42, padding: "2px 4px", borderRadius: 4, fontSize: 11,
                                background: "var(--bg-input)", border: "1px solid var(--line)",
                                color: "var(--ink)", textAlign: "center", outline: "none",
                              }}
                            />
                            <span style={{ fontSize: 9, color: "var(--ink-5)" }}>s</span>
                          </label>
                        </div>
                      </div>
                      <button
                        onClick={() => removeExercise(ex.exerciseId)}
                        style={{
                          width: 24, height: 24, borderRadius: 6, border: "1px solid var(--line)",
                          background: "transparent", color: "var(--ink-4)", cursor: "pointer", fontSize: 14,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {selectedExercises.length === 0 && !showPicker && (
                <div style={{
                  padding: "20px 16px", textAlign: "center", border: "1px dashed var(--line)",
                  borderRadius: 8, color: "var(--ink-4)", fontSize: 12,
                }}>
                  No exercises added yet
                </div>
              )}

              {/* Exercise picker modal */}
              {showPicker && (
                <div style={{
                  marginTop: 8, border: "1px solid var(--line)", borderRadius: 10,
                  background: "var(--bg-card)", overflow: "hidden",
                }}>
                  <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--line)", display: "flex", gap: 8 }}>
                    <input
                      autoFocus
                      value={pickerSearch}
                      onChange={(e) => setPickerSearch(e.target.value)}
                      placeholder="Search exercises..."
                      style={{
                        flex: 1, padding: "6px 10px", borderRadius: 6, fontSize: 12,
                        background: "var(--bg-input)", border: "1px solid var(--line)",
                        color: "var(--ink)", outline: "none",
                      }}
                    />
                    <select
                      value={pickerMuscle ?? ""}
                      onChange={(e) => setPickerMuscle(e.target.value || null)}
                      style={{
                        padding: "6px 8px", borderRadius: 6, fontSize: 11,
                        background: "var(--bg-input)", border: "1px solid var(--line)",
                        color: "var(--ink-3)", outline: "none",
                      }}
                    >
                      <option value="">All muscles</option>
                      {ALL_MUSCLES.map((m) => (
                        <option key={m} value={m}>{MUSCLE_LABELS[m]}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => { setShowPicker(false); setShowInlineCreate(false); setPickerSearch(""); setPickerMuscle(null); }}
                      style={{
                        padding: "6px 10px", borderRadius: 6, fontSize: 11,
                        background: "transparent", border: "1px solid var(--line)",
                        color: "var(--ink-4)", cursor: "pointer",
                      }}
                    >
                      Close
                    </button>
                  </div>

                  {/* Create new exercise option (always shown at top) */}
                  {!showInlineCreate ? (
                    <button
                      onClick={() => setShowInlineCreate(true)}
                      style={{
                        display: "flex", width: "100%", alignItems: "center", gap: 8,
                        padding: "10px 12px", background: "rgba(100,255,218,0.04)", border: "none",
                        borderBottom: "1px solid var(--line)", cursor: "pointer", textAlign: "left",
                        color: "var(--cyan)", fontSize: 12, fontWeight: 500,
                      }}
                    >
                      + Create new exercise
                    </button>
                  ) : (
                    <div style={{ padding: "12px", borderBottom: "1px solid var(--line)", background: "rgba(100,255,218,0.04)" }}>
                      <div style={{ fontSize: 11, color: "var(--cyan)", fontWeight: 600, marginBottom: 8, letterSpacing: "0.04em" }}>
                        NEW EXERCISE
                      </div>
                      <input
                        autoFocus
                        value={inlineName}
                        onChange={(e) => { setInlineName(e.target.value); setInlineError(""); }}
                        placeholder="Exercise name"
                        style={{
                          display: "block", width: "100%", marginBottom: 8,
                          padding: "8px 10px", borderRadius: 6, fontSize: 12,
                          background: "var(--bg-input)", border: "1px solid var(--line)",
                          color: "var(--ink)", outline: "none", boxSizing: "border-box" as const,
                        }}
                      />
                      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                        <select
                          value={inlineMuscle}
                          onChange={(e) => setInlineMuscle(e.target.value)}
                          style={{
                            flex: 1, padding: "8px 10px", borderRadius: 6, fontSize: 11,
                            background: "var(--bg-input)", border: "1px solid var(--line)",
                            color: "var(--ink-3)", outline: "none",
                          }}
                        >
                          <option value="">Primary muscle...</option>
                          {ALL_MUSCLES.map((m) => (
                            <option key={m} value={m}>{MUSCLE_LABELS[m]}</option>
                          ))}
                        </select>
                        <select
                          value={inlineEquipment}
                          onChange={(e) => setInlineEquipment(e.target.value)}
                          style={{
                            flex: 1, padding: "8px 10px", borderRadius: 6, fontSize: 11,
                            background: "var(--bg-input)", border: "1px solid var(--line)",
                            color: "var(--ink-3)", outline: "none",
                          }}
                        >
                          <option value="">Equipment...</option>
                          {["barbell", "dumbbell", "cable", "machine", "bodyweight", "kettlebell", "band", "other"].map((eq) => (
                            <option key={eq} value={eq}>{eq.charAt(0).toUpperCase() + eq.slice(1)}</option>
                          ))}
                        </select>
                      </div>
                      {inlineError && (
                        <div style={{ fontSize: 11, color: "var(--neg)", marginBottom: 8 }}>{inlineError}</div>
                      )}
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={createInlineExercise}
                          disabled={inlineSaving || !inlineName.trim()}
                          style={{
                            padding: "6px 14px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                            background: inlineName.trim() ? "#E8E8F0" : "rgba(255,255,255,0.04)",
                            color: inlineName.trim() ? "#06060B" : "var(--ink-4)", border: "none",
                          }}
                        >
                          {inlineSaving ? "Creating..." : "Create and add"}
                        </button>
                        <button
                          onClick={() => { setShowInlineCreate(false); setInlineName(""); setInlineMuscle(""); setInlineEquipment(""); setInlineError(""); }}
                          style={{
                            padding: "6px 10px", borderRadius: 6, fontSize: 11,
                            background: "transparent", border: "1px solid var(--line)", color: "var(--ink-4)", cursor: "pointer",
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  <div style={{ maxHeight: 240, overflowY: "auto" }}>
                    {libLoading ? (
                      <div style={{ padding: 16, color: "var(--ink-4)", fontSize: 12 }}>Loading...</div>
                    ) : filteredLib.length === 0 ? (
                      <div style={{ padding: 16, color: "var(--ink-4)", fontSize: 12 }}>
                        {exerciseLib.length === 0 ? "No exercises in your library yet. Create one above." : "No exercises match your search."}
                      </div>
                    ) : (
                      filteredLib.map((ex) => (
                        <button
                          key={ex.id}
                          onClick={() => addExercise(ex)}
                          style={{
                            display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between",
                            padding: "8px 12px", background: "transparent", border: "none", borderBottom: "1px solid var(--line)",
                            cursor: "pointer", textAlign: "left", color: "var(--ink)", fontSize: 13,
                          }}
                        >
                          <span>{ex.name}</span>
                          <span style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "var(--f-mono)" }}>
                            {MUSCLE_LABELS[ex.primaryMuscle ?? ""] ?? ""}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => { setShowNewForm(false); setSelectedExercises([]); setShowPicker(false); }} className="cc-btn" style={{ fontSize: 12 }}>Cancel</button>
              <button
                onClick={createWorkout}
                disabled={saving || !newName.trim() || selectedExercises.length === 0}
                style={{
                  padding: "8px 20px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  background: newName.trim() && selectedExercises.length > 0 ? "#E8E8F0" : "rgba(255,255,255,0.04)",
                  color: newName.trim() && selectedExercises.length > 0 ? "#06060B" : "var(--ink-4)", border: "none",
                }}
              >
                {saving ? "Creating…" : `Create workout (${selectedExercises.length} ex)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Workout list ──────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 72, borderRadius: 12 }} />
          ))}
        </div>
      ) : loadError ? (
        <div className="cc-card" style={{ padding: "32px 24px", textAlign: "center" }}>
          <div style={{ color: "var(--neg)", fontSize: 13, marginBottom: 12 }}>Failed to load workouts.</div>
          <button onClick={loadPlans} className="cc-btn" style={{ fontSize: 12 }}>Retry</button>
        </div>
      ) : plans.length === 0 && !showNewForm ? (
        /* Empty state */
        <div className="cc-card" style={{ padding: "48px 40px", textAlign: "center" }}>
          <div style={{
            fontSize: 36, fontWeight: 200, letterSpacing: "-0.03em",
            background: "var(--grad)", WebkitBackgroundClip: "text", backgroundClip: "text",
            color: "transparent", marginBottom: 12,
          }}>
            No workouts yet
          </div>
          <p style={{ color: "var(--ink-3)", fontSize: 13, marginBottom: 20 }}>
            Create your first workout to get started.
          </p>
          <button
            onClick={() => setShowNewForm(true)}
            style={{
              padding: "12px 24px", borderRadius: 10, fontSize: 14, fontWeight: 600,
              background: "#E8E8F0", color: "#06060B", border: "none", cursor: "pointer",
            }}
          >
            + Create your first workout
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {plans.map((plan) => {
            const isEditing = editingId === plan.id;

            return (
              <div key={plan.id} className="cc-card" style={{ overflow: "hidden" }}>

                {/* ── Normal view ──────────────────────────────────────── */}
                {!isEditing ? (
                  <div style={{ padding: "18px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.01em" }}>{plan.name}</span>
                        <span style={{ fontSize: 10, fontFamily: "var(--f-mono)", color: "var(--ink-4)", letterSpacing: "0.06em" }}>
                          {plan.exerciseCount} exercises
                        </span>
                      </div>
                      {/* Muscles */}
                      {plan.targetMuscles.length > 0 && (
                        <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                          {plan.targetMuscles.map((m) => (
                            <span key={m} style={{
                              fontSize: 10, padding: "2px 7px", borderRadius: 4,
                              background: "rgba(124,77,255,0.10)", color: "var(--violet)",
                              fontFamily: "var(--f-mono)", letterSpacing: "0.04em",
                            }}>
                              {MUSCLE_LABELS[m] ?? m}
                            </span>
                          ))}
                        </div>
                      )}
                      {/* Days */}
                      {plan.assignedDays.length > 0 && (
                        <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 6, fontFamily: "var(--f-mono)" }}>
                          {plan.assignedDays.map((d) => DAY_LABELS[d] ?? d).join(", ")}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => startEdit(plan)}
                      style={{
                        fontSize: 11, color: "var(--ink-3)", background: "none", border: "1px solid var(--line)",
                        borderRadius: 6, padding: "5px 10px", cursor: "pointer",
                      }}
                    >
                      Edit
                    </button>
                  </div>
                ) : (
                  /* ── Edit view ──────────────────────────────────────── */
                  <div style={{ padding: "18px 20px" }}>
                    {/* Name */}
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      style={{
                        width: "100%", marginBottom: 14,
                        background: "var(--bg-input)", border: "1px solid var(--line)",
                        borderRadius: 8, padding: "10px 14px", color: "var(--ink)", fontSize: 16,
                        fontWeight: 500, outline: "none",
                      }}
                    />

                    {/* Target muscles */}
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 6 }}>Target muscles</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                        {ALL_MUSCLES.map((m) => (
                          <button
                            key={m}
                            onClick={() => toggleChip(editMuscles, m, setEditMuscles)}
                            style={{
                              padding: "4px 9px", borderRadius: 5, fontSize: 10.5, cursor: "pointer",
                              border: `1px solid ${editMuscles.includes(m) ? "var(--violet)" : "var(--line)"}`,
                              background: editMuscles.includes(m) ? "rgba(124,77,255,0.15)" : "transparent",
                              color: editMuscles.includes(m) ? "var(--violet)" : "var(--ink-3)",
                            }}
                          >
                            {MUSCLE_LABELS[m]}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Days */}
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 6 }}>Days</div>
                      <div style={{ display: "flex", gap: 5 }}>
                        {DAYS.map((d) => (
                          <button
                            key={d}
                            onClick={() => toggleChip(editDays, d, setEditDays)}
                            style={{
                              width: 44, height: 36, borderRadius: 7, fontSize: 11, fontWeight: 500, cursor: "pointer",
                              border: `1px solid ${editDays.includes(d) ? "var(--cyan)" : "var(--line)"}`,
                              background: editDays.includes(d) ? "rgba(100,255,218,0.12)" : "transparent",
                              color: editDays.includes(d) ? "var(--cyan)" : "var(--ink-3)",
                            }}
                          >
                            {DAY_LABELS[d]}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* ── Exercises in this workout ───────────────── */}
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <div style={{ fontSize: 11, color: "var(--ink-3)" }}>Exercises</div>
                        <button
                          onClick={() => { setShowEditPicker(true); loadExerciseLib(); }}
                          style={{
                            padding: "4px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                            border: "1px solid var(--line)", background: "transparent", color: "var(--cyan)",
                          }}
                        >
                          + Add
                        </button>
                      </div>

                      {editExLoading ? (
                        <div style={{ color: "var(--ink-4)", fontSize: 12 }}>Loading exercises...</div>
                      ) : editExercises.length === 0 ? (
                        <div style={{ padding: "14px", textAlign: "center", border: "1px dashed var(--line)", borderRadius: 8, color: "var(--ink-4)", fontSize: 12 }}>
                          No exercises added
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {editExercises.map((ex, i) => (
                            <div key={ex.id} style={{
                              padding: "10px 12px",
                              border: "1px solid var(--line)", borderRadius: 10, background: "rgba(255,255,255,0.018)",
                            }}>
                              {/* Top row: number, name, reorder/remove */}
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontFamily: "var(--f-mono)", color: "var(--ink-4)", fontSize: 10, minWidth: 20 }}>
                                  {String(i + 1).padStart(2, "0")}
                                </span>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 12.5, color: "var(--ink)" }}>{ex.name}</div>
                                  <div style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "var(--f-mono)" }}>
                                    {MUSCLE_LABELS[ex.primaryMuscle ?? ""] ?? ""}
                                  </div>
                                </div>
                                <div style={{ display: "flex", gap: 2 }}>
                                  <button
                                    onClick={() => moveExercise(i, -1)}
                                    disabled={i === 0}
                                    aria-label={`Move ${ex.name} up`}
                                    style={{
                                      width: 24, height: 24, borderRadius: 4, border: "1px solid var(--line)",
                                      background: "transparent", color: i === 0 ? "var(--ink-5)" : "var(--ink-3)",
                                      cursor: i === 0 ? "default" : "pointer", fontSize: 12,
                                      display: "flex", alignItems: "center", justifyContent: "center",
                                    }}
                                  >
                                    ↑
                                  </button>
                                  <button
                                    onClick={() => moveExercise(i, 1)}
                                    disabled={i === editExercises.length - 1}
                                    aria-label={`Move ${ex.name} down`}
                                    style={{
                                      width: 24, height: 24, borderRadius: 4, border: "1px solid var(--line)",
                                      background: "transparent", color: i === editExercises.length - 1 ? "var(--ink-5)" : "var(--ink-3)",
                                      cursor: i === editExercises.length - 1 ? "default" : "pointer", fontSize: 12,
                                      display: "flex", alignItems: "center", justifyContent: "center",
                                    }}
                                  >
                                    ↓
                                  </button>
                                  <button
                                    onClick={() => removeEditExercise(ex.id)}
                                    aria-label={`Remove ${ex.name}`}
                                    style={{
                                      width: 24, height: 24, borderRadius: 4, border: "1px solid var(--line)",
                                      background: "transparent", color: "var(--neg)", cursor: "pointer", fontSize: 14,
                                      display: "flex", alignItems: "center", justifyContent: "center",
                                    }}
                                  >
                                    ×
                                  </button>
                                </div>
                              </div>
                              {/* Bottom row: sets + rep range controls */}
                              <div style={{ display: "flex", gap: 12, marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--line)", alignItems: "center" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ fontSize: 10, color: "var(--ink-4)", minWidth: 28 }}>Sets</span>
                                  <div style={{ display: "flex", alignItems: "center", gap: 0, border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden" }}>
                                    <button
                                      onClick={() => updateSetCount(i, Math.max(1, ex.setConfig.length - 1))}
                                      style={{ width: 28, height: 28, background: "transparent", border: "none", borderRight: "1px solid var(--line)", color: "var(--ink-3)", cursor: "pointer", fontSize: 14 }}
                                    >
                                      −
                                    </button>
                                    <span style={{ width: 28, textAlign: "center", fontSize: 12, fontFamily: "var(--f-mono)", color: "var(--ink)" }}>
                                      {ex.setConfig.length}
                                    </span>
                                    <button
                                      onClick={() => updateSetCount(i, Math.min(10, ex.setConfig.length + 1))}
                                      style={{ width: 28, height: 28, background: "transparent", border: "none", borderLeft: "1px solid var(--line)", color: "var(--ink-3)", cursor: "pointer", fontSize: 14 }}
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ fontSize: 10, color: "var(--ink-4)", minWidth: 28 }}>Reps</span>
                                  <input
                                    type="number"
                                    value={ex.setConfig[0]?.repMin ?? 8}
                                    onChange={(e) => {
                                      const v = parseInt(e.target.value) || 1;
                                      const max = ex.setConfig[0]?.repMax ?? v;
                                      updateRepRange(i, v, Math.max(v, max));
                                    }}
                                    style={{
                                      width: 40, height: 28, textAlign: "center", fontSize: 12, fontFamily: "var(--f-mono)",
                                      background: "var(--bg-input)", border: "1px solid var(--line)", borderRadius: 6,
                                      color: "var(--ink)", outline: "none",
                                    }}
                                  />
                                  <span style={{ fontSize: 10, color: "var(--ink-4)" }}>–</span>
                                  <input
                                    type="number"
                                    value={ex.setConfig[0]?.repMax ?? 12}
                                    onChange={(e) => {
                                      const v = parseInt(e.target.value) || 1;
                                      const min = ex.setConfig[0]?.repMin ?? v;
                                      updateRepRange(i, Math.min(min, v), v);
                                    }}
                                    style={{
                                      width: 40, height: 28, textAlign: "center", fontSize: 12, fontFamily: "var(--f-mono)",
                                      background: "var(--bg-input)", border: "1px solid var(--line)", borderRadius: 6,
                                      color: "var(--ink)", outline: "none",
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Inline exercise picker for edit mode */}
                      {showEditPicker && (
                        <div style={{
                          marginTop: 8, border: "1px solid var(--line)", borderRadius: 10,
                          background: "var(--bg-card)", overflow: "hidden",
                        }}>
                          <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--line)", display: "flex", gap: 8 }}>
                            <input
                              autoFocus
                              value={pickerSearch}
                              onChange={(e) => setPickerSearch(e.target.value)}
                              placeholder="Search exercises..."
                              style={{
                                flex: 1, padding: "6px 10px", borderRadius: 6, fontSize: 12,
                                background: "var(--bg-input)", border: "1px solid var(--line)",
                                color: "var(--ink)", outline: "none",
                              }}
                            />
                            <button
                              onClick={() => { setShowEditPicker(false); setPickerSearch(""); }}
                              style={{
                                padding: "6px 10px", borderRadius: 6, fontSize: 11,
                                background: "transparent", border: "1px solid var(--line)",
                                color: "var(--ink-4)", cursor: "pointer",
                              }}
                            >
                              Close
                            </button>
                          </div>
                          <div style={{ maxHeight: 200, overflowY: "auto" }}>
                            {libLoading ? (
                              <div style={{ padding: 12, color: "var(--ink-4)", fontSize: 12 }}>Loading...</div>
                            ) : (
                              exerciseLib
                                .filter(e => {
                                  if (editExercises.some(ex => ex.exerciseId === e.id)) return false;
                                  if (pickerSearch && !e.name.toLowerCase().includes(pickerSearch.toLowerCase())) return false;
                                  return true;
                                })
                                .slice(0, 20)
                                .map(ex => (
                                  <button
                                    key={ex.id}
                                    onClick={() => addEditExercise(ex)}
                                    style={{
                                      display: "flex", width: "100%", justifyContent: "space-between",
                                      padding: "8px 12px", background: "transparent", border: "none",
                                      borderBottom: "1px solid var(--line)", cursor: "pointer",
                                      textAlign: "left", color: "var(--ink)", fontSize: 12,
                                    }}
                                  >
                                    <span>{ex.name}</span>
                                    <span style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "var(--f-mono)" }}>
                                      {MUSCLE_LABELS[ex.primaryMuscle ?? ""] ?? ""}
                                    </span>
                                  </button>
                                ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
                      <div>
                        {deleteConfirm === plan.id ? (
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => deleteWorkout(plan.id)} style={{
                              padding: "6px 14px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                              background: "rgba(255,80,80,0.12)", border: "1px solid var(--neg)", color: "var(--neg)",
                            }}>
                              Yes, delete
                            </button>
                            <button onClick={() => setDeleteConfirm(null)} style={{
                              padding: "6px 14px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                              background: "transparent", border: "1px solid var(--line)", color: "var(--ink-3)",
                            }}>
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteConfirm(plan.id)} style={{
                            padding: "6px 14px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                            background: "transparent", border: "1px solid var(--line)", color: "var(--neg)",
                          }}>
                            Delete workout
                          </button>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => setEditingId(null)} className="cc-btn" style={{ fontSize: 11 }}>Cancel</button>
                        <button
                          onClick={saveEdit}
                          disabled={editSaving || !editName.trim()}
                          style={{
                            padding: "6px 16px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                            background: "#E8E8F0", color: "#06060B", border: "none",
                          }}
                        >
                          {editSaving ? "Saving…" : "Save"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
