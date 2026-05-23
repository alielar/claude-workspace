"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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

export default function TemplatesPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);

  // New template form state
  const [newName, setNewName] = useState("");
  const [newMuscles, setNewMuscles] = useState<string[]>([]);
  const [newDays, setNewDays] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editMuscles, setEditMuscles] = useState<string[]>([]);
  const [editDays, setEditDays] = useState<string[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  function loadPlans() {
    fetch("/api/workouts/plans")
      .then((r) => r.json())
      .then((data) => { setPlans(data); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { loadPlans(); }, []);

  async function createTemplate() {
    if (!newName.trim()) return;
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
      setPlans((prev) => [...prev, plan]);
      setNewName("");
      setNewMuscles([]);
      setNewDays([]);
      setShowNewForm(false);
    }
    setSaving(false);
  }

  function startEdit(plan: Plan) {
    setEditingId(plan.id);
    setEditName(plan.name);
    setEditMuscles([...plan.targetMuscles]);
    setEditDays([...plan.assignedDays]);
    setDeleteConfirm(null);
  }

  async function saveEdit() {
    if (!editingId || !editName.trim()) return;
    setEditSaving(true);
    await fetch(`/api/workouts/plans/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName.trim(),
        targetMuscles: editMuscles,
        assignedDays: editDays,
      }),
    });
    setPlans((prev) =>
      prev.map((p) =>
        p.id === editingId
          ? { ...p, name: editName.trim(), targetMuscles: editMuscles, assignedDays: editDays }
          : p
      )
    );
    setEditingId(null);
    setEditSaving(false);
  }

  async function deleteTemplate(id: number) {
    await fetch(`/api/workouts/plans/${id}`, { method: "DELETE" });
    setPlans((prev) => prev.filter((p) => p.id !== id));
    setDeleteConfirm(null);
    if (editingId === id) setEditingId(null);
  }

  function toggleChip(arr: string[], val: string, setter: (v: string[]) => void) {
    setter(arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "28px 32px 64px", maxWidth: 900, margin: "0 auto" }}>

      {/* Page title */}
      <div className="cc-pagetitle" style={{ marginBottom: 26 }}>
        <div>
          <h1>Templates<span className="grad-text">.</span></h1>
          <div className="sub">{plans.length} templates · assign days, pick exercises, go</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/workouts" className="cc-btn" style={{ fontSize: 12 }}>← Workouts</Link>
          <button
            onClick={() => { setShowNewForm(true); setEditingId(null); }}
            className="cc-btn cc-btn-primary"
            style={{ fontSize: 12 }}
          >
            + New template
          </button>
        </div>
      </div>

      {/* ── New template form ──────────────────────────────────────────── */}
      {showNewForm && (
        <div className="cc-card" style={{ marginBottom: 14 }}>
          <div className="cc-card-head">
            <div className="title">New template</div>
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
                      background: newMuscles.includes(m) ? "rgba(179,136,255,0.15)" : "transparent",
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
                      background: newDays.includes(d) ? "rgba(126,231,255,0.12)" : "transparent",
                      color: newDays.includes(d) ? "var(--cyan)" : "var(--ink-3)",
                      transition: "all 0.12s",
                    }}
                  >
                    {DAY_LABELS[d]}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setShowNewForm(false)} className="cc-btn" style={{ fontSize: 12 }}>Cancel</button>
              <button
                onClick={createTemplate}
                disabled={saving || !newName.trim()}
                style={{
                  padding: "8px 20px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  background: newName.trim() ? "var(--grad)" : "rgba(255,255,255,0.04)",
                  color: newName.trim() ? "#0A0A14" : "var(--ink-4)", border: "none",
                }}
              >
                {saving ? "Creating…" : "Create template"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Template list ──────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ color: "var(--ink-4)", fontSize: 13 }}>—</div>
      ) : plans.length === 0 && !showNewForm ? (
        /* Empty state */
        <div className="cc-card" style={{ padding: "48px 40px", textAlign: "center" }}>
          <div style={{
            fontSize: 36, fontWeight: 200, letterSpacing: "-0.03em",
            background: "var(--grad)", WebkitBackgroundClip: "text", backgroundClip: "text",
            color: "transparent", marginBottom: 12,
          }}>
            No templates yet
          </div>
          <p style={{ color: "var(--ink-3)", fontSize: 13, marginBottom: 20 }}>
            Create your first workout template to get started.
          </p>
          <button
            onClick={() => setShowNewForm(true)}
            style={{
              padding: "12px 24px", borderRadius: 10, fontSize: 14, fontWeight: 600,
              background: "var(--grad)", color: "#0A0A14", border: "none", cursor: "pointer",
              boxShadow: "0 0 24px rgba(179,136,255,0.30)",
            }}
          >
            + Create your first template
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
                              background: "rgba(179,136,255,0.10)", color: "var(--violet)",
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

                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <Link href={`/workouts/templates/${plan.id}`} style={{
                        fontSize: 11, color: "var(--cyan)", textDecoration: "none", padding: "5px 10px",
                        borderRadius: 6, border: "1px solid rgba(126,231,255,0.20)",
                      }}>
                        Exercises →
                      </Link>
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
                              background: editMuscles.includes(m) ? "rgba(179,136,255,0.15)" : "transparent",
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
                              background: editDays.includes(d) ? "rgba(126,231,255,0.12)" : "transparent",
                              color: editDays.includes(d) ? "var(--cyan)" : "var(--ink-3)",
                            }}
                          >
                            {DAY_LABELS[d]}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
                      <div>
                        {deleteConfirm === plan.id ? (
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => deleteTemplate(plan.id)} style={{
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
                            Delete template
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
                            background: "var(--grad)", color: "#0A0A14", border: "none",
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
