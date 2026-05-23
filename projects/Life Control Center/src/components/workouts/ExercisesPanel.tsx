"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { Suspense } from "react";
import { ensureMigrate } from "@/lib/ensureMigrate";

// ── Types ─────────────────────────────────────────────────────────────────────

type TrackingType = "reps_weight" | "reps_only" | "time_weight" | "time_only" | "distance";

interface Exercise {
  id: number;
  name: string;
  primaryMuscle: string | null;
  secondaryMuscles: string[];
  equipment: string | null;
  weightIncrement: number;
  trackingType: TrackingType;
  videoUrl: string | null;
  videoType: string | null;
  notes: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MUSCLE_GROUPS = [
  { key: "all",        label: "All" },
  { key: "chest",      label: "Chest" },
  { key: "lats",       label: "Back" },
  { key: "upper_back", label: "Upper Back" },
  { key: "quads",      label: "Legs" },
  { key: "front_delts",label: "Shoulders" },
  { key: "biceps",     label: "Arms" },
  { key: "triceps",    label: "Triceps" },
  { key: "abs",        label: "Core" },
];

const ALL_MUSCLES: { key: string; label: string }[] = [
  { key: "chest",       label: "Chest" },
  { key: "front_delts", label: "Front Delts" },
  { key: "side_delts",  label: "Side Delts" },
  { key: "rear_delts",  label: "Rear Delts" },
  { key: "triceps",     label: "Triceps" },
  { key: "lats",        label: "Lats" },
  { key: "upper_back",  label: "Upper Back" },
  { key: "upper_traps", label: "Traps" },
  { key: "biceps",      label: "Biceps" },
  { key: "forearms",    label: "Forearms" },
  { key: "quads",       label: "Quads" },
  { key: "hamstrings",  label: "Hamstrings" },
  { key: "glutes",      label: "Glutes" },
  { key: "calves",      label: "Calves" },
  { key: "abs",         label: "Abs" },
  { key: "obliques",    label: "Obliques" },
  { key: "serratus",    label: "Serratus" },
];

const EQUIPMENT_OPTIONS = [
  { key: "barbell",    label: "Barbell" },
  { key: "dumbbell",   label: "Dumbbell" },
  { key: "cable",      label: "Cable" },
  { key: "machine",    label: "Machine" },
  { key: "bodyweight", label: "Bodyweight" },
  { key: "kettlebell", label: "Kettlebell" },
  { key: "band",       label: "Band" },
  { key: "other",      label: "Other" },
];

const TRACKING_TYPES: { key: TrackingType; label: string; desc: string }[] = [
  { key: "reps_weight", label: "Reps + Weight",  desc: "Standard lifts: log weight and reps" },
  { key: "reps_only",   label: "Reps only",       desc: "Bodyweight: pull-ups, dips, push-ups" },
  { key: "time_weight", label: "Time + Weight",   desc: "Loaded carries, weighted planks" },
  { key: "time_only",   label: "Time only",        desc: "Plank, dead hang, L-sit" },
  { key: "distance",    label: "Distance",         desc: "Running, rowing, cycling" },
];

const DEFAULT_INCREMENT: Record<string, number> = {
  barbell: 5, dumbbell: 2.5, cable: 2.5, machine: 2.5,
  bodyweight: 0, kettlebell: 4, band: 0, other: 2.5,
};

const MUSCLE_LABELS: Record<string, string> = Object.fromEntries(ALL_MUSCLES.map(({ key, label }) => [key, label]));

// ── Input helper ──────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.04em", textTransform: "uppercase" as const }}>
      {label}
      <div style={{ marginTop: 6 }}>{children}</div>
    </label>
  );
}

const INPUT_STYLE: React.CSSProperties = {
  width: "100%", background: "var(--bg-input)", border: "1px solid var(--line)",
  borderRadius: 8, padding: "10px 14px", color: "var(--ink)", fontSize: 13, outline: "none",
  boxSizing: "border-box" as const,
};

// ── New Exercise Modal ────────────────────────────────────────────────────────

interface NewExerciseModalProps {
  onClose: () => void;
  onCreated: (ex: Exercise) => void;
  existingNames?: string[];
}

function NewExerciseModal({ onClose, onCreated, existingNames = [] }: NewExerciseModalProps) {
  const nameRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [videoTab, setVideoTab] = useState<"upload" | "youtube">("youtube");
  const [nameError, setNameError] = useState("");

  const [form, setForm] = useState({
    name: "",
    primaryMuscle: "",
    secondaryMuscles: [] as string[],
    equipment: "",
    trackingType: "reps_weight" as TrackingType,
    weightIncrement: 2.5,
    notes: "",
    youtubeUrl: "",
    videoFile: null as File | null,
  });

  useEffect(() => { setTimeout(() => nameRef.current?.focus(), 60); }, []);

  function toggleSecondary(muscle: string) {
    setForm((f) => ({
      ...f,
      secondaryMuscles: f.secondaryMuscles.includes(muscle)
        ? f.secondaryMuscles.filter((m) => m !== muscle)
        : [...f.secondaryMuscles, muscle],
    }));
  }

  function handleEquipmentChange(eq: string) {
    setForm((f) => ({
      ...f,
      equipment: eq,
      weightIncrement: DEFAULT_INCREMENT[eq] ?? 2.5,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    // Duplicate check
    const dup = existingNames.some((n) => n.toLowerCase() === form.name.trim().toLowerCase());
    if (dup) { setNameError("An exercise with this name already exists"); return; }
    setSaving(true);
    setNameError("");

    try {
      // Create exercise
      const res = await fetch("/api/workouts/exercises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:             form.name.trim(),
          primaryMuscle:    form.primaryMuscle || null,
          secondaryMuscles: form.secondaryMuscles,
          equipment:        form.equipment || null,
          trackingType:     form.trackingType,
          weightIncrement:  form.weightIncrement,
          notes:            form.notes || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to create");
      const newEx: Exercise & { secondaryMuscles: string[] } = await res.json();

      // Handle video after creation
      if (form.youtubeUrl.trim()) {
        const match = form.youtubeUrl.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
        const videoId = match?.[1];
        if (videoId) {
          const videoUrl = `https://www.youtube.com/embed/${videoId}`;
          await fetch(`/api/workouts/exercises/${newEx.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ videoUrl, videoType: "youtube" }),
          });
          newEx.videoUrl = videoUrl;
          newEx.videoType = "youtube";
        }
      } else if (form.videoFile) {
        const fd = new FormData();
        fd.append("file", form.videoFile);
        fd.append("exerciseId", String(newEx.id));
        const vres = await fetch("/api/workouts/exercises/upload-video", { method: "POST", body: fd });
        if (vres.ok) {
          const { videoUrl } = await vres.json();
          newEx.videoUrl = videoUrl;
          newEx.videoType = "upload";
        }
      }

      onCreated({ ...newEx, secondaryMuscles: newEx.secondaryMuscles ?? [] });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="cc-card" style={{ width: "min(620px, 100vw - 32px)", maxHeight: "90vh", overflow: "auto" }}>
        <div className="cc-card-head">
          <div className="title">New Exercise</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--ink-4)", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="cc-card-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Name */}
            <Field label="Name *">
              <input
                ref={nameRef}
                value={form.name}
                onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setNameError(""); }}
                placeholder="e.g. Incline Dumbbell Press"
                required
                style={{ ...INPUT_STYLE, borderColor: nameError ? "var(--neg)" : undefined }}
              />
              {nameError && <div style={{ fontSize: 11, color: "var(--neg)", marginTop: 4 }}>{nameError}</div>}
            </Field>

            {/* Primary muscle + Equipment */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Primary Muscle *">
                <select
                  value={form.primaryMuscle}
                  onChange={(e) => setForm((f) => ({ ...f, primaryMuscle: e.target.value }))}
                  required
                  style={INPUT_STYLE}
                >
                  <option value="">Select...</option>
                  {ALL_MUSCLES.map(({ key, label }) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Equipment *">
                <select
                  value={form.equipment}
                  onChange={(e) => handleEquipmentChange(e.target.value)}
                  required
                  style={INPUT_STYLE}
                >
                  <option value="">Select...</option>
                  {EQUIPMENT_OPTIONS.map(({ key, label }) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </Field>
            </div>

            {/* Secondary muscles */}
            <Field label="Secondary Muscles">
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6, marginTop: 2 }}>
                {ALL_MUSCLES
                  .filter((m) => m.key !== form.primaryMuscle)
                  .map(({ key, label }) => {
                    const active = form.secondaryMuscles.includes(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleSecondary(key)}
                        style={{
                          padding: "4px 10px", borderRadius: 12, fontSize: 11, cursor: "pointer",
                          border: `1px solid ${active ? "var(--cyan)" : "var(--line)"}`,
                          background: active ? "rgba(100,255,218,0.12)" : "transparent",
                          color: active ? "var(--cyan)" : "var(--ink-4)",
                          transition: "all 0.1s",
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
              </div>
            </Field>

            {/* Tracking type */}
            <Field label="Tracking Type *">
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {TRACKING_TYPES.map(({ key, label, desc }) => {
                  const active = form.trackingType === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, trackingType: key }))}
                      style={{
                        textAlign: "left", padding: "10px 14px", borderRadius: 8, cursor: "pointer",
                        border: `1px solid ${active ? "var(--violet)" : "var(--line)"}`,
                        background: active ? "rgba(124,77,255,0.12)" : "rgba(255,255,255,0.018)",
                        transition: "all 0.1s",
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 500, color: active ? "var(--violet)" : "var(--ink)" }}>{label}</div>
                      <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2 }}>{desc}</div>
                    </button>
                  );
                })}
              </div>
            </Field>

            {/* Weight increment (hidden for bodyweight/time/distance) */}
            {!["reps_only", "time_only", "distance"].includes(form.trackingType) && (
              <Field label="Default weight increment (kg)">
                <input
                  type="number" step="0.5" min="0" max="20"
                  value={form.weightIncrement}
                  onChange={(e) => setForm((f) => ({ ...f, weightIncrement: parseFloat(e.target.value) || 0 }))}
                  style={{ ...INPUT_STYLE, width: 120 }}
                />
              </Field>
            )}

            {/* Video */}
            <Field label="Demo Video (optional)">
              <div style={{ display: "flex", gap: 0, marginBottom: 10 }}>
                {(["youtube", "upload"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setVideoTab(tab)}
                    style={{
                      flex: 1, padding: "8px 0", fontSize: 12, cursor: "pointer",
                      background: videoTab === tab ? "rgba(255,255,255,0.06)" : "transparent",
                      border: "1px solid var(--line)",
                      borderRadius: tab === "youtube" ? "8px 0 0 8px" : "0 8px 8px 0",
                      color: videoTab === tab ? "var(--ink)" : "var(--ink-4)",
                    }}
                  >
                    {tab === "youtube" ? "YouTube" : "Upload"}
                  </button>
                ))}
              </div>
              {videoTab === "youtube" ? (
                <input
                  value={form.youtubeUrl}
                  onChange={(e) => setForm((f) => ({ ...f, youtubeUrl: e.target.value }))}
                  placeholder="https://www.youtube.com/watch?v=…"
                  style={INPUT_STYLE}
                />
              ) : (
                <div>
                  <input
                    type="file"
                    accept="video/*"
                    id="new-ex-video"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      if (file && file.size > 50 * 1024 * 1024) { alert("Max 50MB"); return; }
                      setForm((f) => ({ ...f, videoFile: file }));
                    }}
                  />
                  <label htmlFor="new-ex-video" style={{
                    display: "inline-block", padding: "9px 16px", borderRadius: 8, cursor: "pointer",
                    border: "1px solid var(--line)", fontSize: 12, color: "var(--ink-3)",
                  }}>
                    {form.videoFile ? `✓ ${form.videoFile.name}` : "↑ Choose video (max 50MB)"}
                  </label>
                </div>
              )}
            </Field>

            {/* Notes */}
            <Field label="Notes (optional)">
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Cues, setup notes, form tips…"
                rows={2}
                style={{ ...INPUT_STYLE, resize: "vertical" as const }}
              />
            </Field>

            {/* Actions */}
            <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
              <button
                type="submit"
                disabled={saving || !form.name.trim()}
                className="cc-btn cc-btn-primary"
              >
                {saving ? "Creating…" : "Create exercise"}
              </button>
              <button type="button" onClick={onClose} className="cc-btn">Cancel</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function ExerciseLibraryInner() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [exercises, setExercises]     = useState<Exercise[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState("");
  const [muscleFilter, setMuscleFilter] = useState("all");
  const [selected, setSelected]       = useState<Exercise | null>(null);
  const [editForm, setEditForm]       = useState<Partial<Exercise> | null>(null);
  const [saving, setSaving]           = useState(false);
  const [youtubeInput, setYoutubeInput] = useState("");
  const [showNewModal, setShowNewModal] = useState(false);

  useEffect(() => {
    ensureMigrate();
    fetch("/api/workouts/exercises")
        .then((r) => { if (!r.ok) throw new Error("fetch failed"); return r.json(); })
        .then((data: Exercise[]) => {
          if (Array.isArray(data)) setExercises(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
  }, []);

  const openDetail = useCallback((ex: Exercise) => {
    setSelected(ex);
    setEditForm({ ...ex });
    setYoutubeInput(ex.videoType === "youtube" ? (ex.videoUrl ?? "") : "");
  }, []);

  function closeDetail() { setSelected(null); setEditForm(null); }

  async function saveEdit() {
    if (!selected || !editForm) return;
    setSaving(true);
    await fetch(`/api/workouts/exercises/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    const updated = { ...selected, ...editForm } as Exercise;
    setExercises((prev) => prev.map((e) => (e.id === selected.id ? updated : e)));
    setSelected(updated);
    setSaving(false);
  }

  async function saveYouTube() {
    if (!selected || !youtubeInput.trim()) return;
    const match = youtubeInput.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    const videoId = match?.[1];
    if (!videoId) { alert("Invalid YouTube URL"); return; }
    const videoUrl = `https://www.youtube.com/embed/${videoId}`;
    await fetch(`/api/workouts/exercises/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoUrl, videoType: "youtube" }),
    });
    const updated = { ...selected, videoUrl, videoType: "youtube" };
    setExercises((prev) => prev.map((e) => (e.id === selected.id ? updated : e)));
    setSelected(updated);
    setEditForm((prev) => prev ? { ...prev, videoUrl, videoType: "youtube" } : prev);
  }

  function handleCreated(ex: Exercise) {
    setExercises((prev) => [...prev, ex].sort((a, b) => a.name.localeCompare(b.name)));
    setShowNewModal(false);
    openDetail(ex);
  }

  const filtered = useMemo(() => exercises.filter((ex) => {
    const matchesSearch = ex.name.toLowerCase().includes(search.toLowerCase());
    const m = ex.primaryMuscle ?? "";
    const matchesMuscle =
      muscleFilter === "all" ||
      m === muscleFilter ||
      (muscleFilter === "lats"        && ["lats", "upper_back"].includes(m)) ||
      (muscleFilter === "quads"       && ["quads", "hamstrings", "glutes", "calves"].includes(m)) ||
      (muscleFilter === "front_delts" && ["front_delts", "side_delts", "rear_delts"].includes(m)) ||
      (muscleFilter === "biceps"      && ["biceps", "forearms"].includes(m)) ||
      (muscleFilter === "abs"         && ["abs", "obliques"].includes(m));
    return matchesSearch && matchesMuscle;
  }), [exercises, search, muscleFilter]);

  const trackingLabel = (t: TrackingType) =>
    TRACKING_TYPES.find((x) => x.key === t)?.label ?? t;

  return (
    <div style={{ padding: "0 24px 40px" }}>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>
            Exercise Library<span className="grad-text">.</span>
          </h2>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>{exercises.length} exercises · tap to edit</div>
        </div>
        <button className="cc-btn cc-btn-primary" onClick={() => setShowNewModal(true)}>
          + New exercise
        </button>
      </div>

      {/* Search + filter */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" as const, alignItems: "center" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search exercises…"
          style={{ flex: "1 1 240px", background: "var(--bg-input)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 14px", color: "var(--ink)", fontSize: 13, outline: "none" }}
        />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
          {MUSCLE_GROUPS.map((mg) => (
            <button
              key={mg.key}
              onClick={() => setMuscleFilter(mg.key)}
              style={{
                padding: "6px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer", transition: "all 0.1s",
                border: `1px solid ${muscleFilter === mg.key ? "var(--violet)" : "var(--line)"}`,
                background: muscleFilter === mg.key ? "rgba(124,77,255,0.15)" : "transparent",
                color: muscleFilter === mg.key ? "var(--violet)" : "var(--ink-3)",
                fontWeight: muscleFilter === mg.key ? 500 : 400,
              }}
            >
              {mg.label}
            </button>
          ))}
        </div>
      </div>

      {/* Exercise list */}
      {loading ? (
        <div style={{ color: "var(--ink-4)", fontSize: 13 }}>Loading…</div>
      ) : (
        <div className="cc-card">
          <div className="cc-card-head">
            <div className="title">Exercises</div>
            <div className="tail">{filtered.length} shown</div>
          </div>
          <div style={{ padding: 0 }}>
            {filtered.map((ex, idx) => (
              <button
                key={ex.id}
                onClick={() => openDetail(ex)}
                style={{
                  width: "100%", textAlign: "left", background: "transparent", border: "none", cursor: "pointer",
                  display: "grid", gridTemplateColumns: "1fr auto auto auto",
                  alignItems: "center", gap: 16, padding: "13px 20px",
                  borderBottom: idx < filtered.length - 1 ? "1px solid var(--line)" : "none",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{ex.name}</div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
                    {ex.primaryMuscle ? (MUSCLE_LABELS[ex.primaryMuscle] ?? ex.primaryMuscle) : "-"}
                    {ex.equipment ? ` · ${ex.equipment}` : ""}
                    {ex.trackingType !== "reps_weight" ? ` · ${trackingLabel(ex.trackingType)}` : ""}
                  </div>
                </div>
                {ex.videoUrl && (
                  <span style={{ fontSize: 10, color: "var(--cyan)", fontFamily: "var(--f-mono)", letterSpacing: "0.06em" }}>▶ VIDEO</span>
                )}
                {ex.trackingType !== "reps_weight" && (
                  <span style={{ fontSize: 10, color: "var(--warn)", fontFamily: "var(--f-mono)", letterSpacing: "0.04em" }}>
                    {ex.trackingType.replace("_", " ").toUpperCase()}
                  </span>
                )}
                <span style={{ fontSize: 10.5, color: "var(--ink-4)", fontFamily: "var(--f-mono)" }}>
                  {ex.trackingType.includes("weight") ? `+${ex.weightIncrement}kg` : ""}
                </span>
                <span style={{ color: "var(--ink-4)", fontSize: 14 }}>→</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--ink-4)", fontSize: 13 }}>
                No exercises match your filter.
                {!loading && exercises.length === 0 && (
                  <div style={{ marginTop: 8 }}>
                    <button className="cc-btn cc-btn-primary" onClick={() => setShowNewModal(true)} style={{ marginTop: 8 }}>
                      + Create your first exercise
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* New exercise modal */}
      {showNewModal && <NewExerciseModal onClose={() => setShowNewModal(false)} onCreated={handleCreated} existingNames={exercises.map((e) => e.name)} />}

      {/* Exercise detail / edit modal */}
      {selected && editForm && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={(e) => { if (e.target === e.currentTarget) closeDetail(); }}
        >
          <div className="cc-card" style={{ width: "min(600px, 100vw - 32px)", maxHeight: "88vh", overflow: "auto" }}>
            <div className="cc-card-head">
              <div className="title">{selected.name}</div>
              <button onClick={closeDetail} style={{ background: "none", border: "none", color: "var(--ink-4)", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>×</button>
            </div>
            <div className="cc-card-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              <label style={{ fontSize: 11, color: "var(--ink-3)" }}>
                Name
                <input value={editForm.name ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} style={{ display: "block", marginTop: 6, ...INPUT_STYLE }} />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={{ fontSize: 11, color: "var(--ink-3)" }}>
                  Primary Muscle
                  <select value={editForm.primaryMuscle ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, primaryMuscle: e.target.value }))} style={{ display: "block", marginTop: 6, ...INPUT_STYLE }}>
                    <option value="">Select...</option>
                    {ALL_MUSCLES.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 11, color: "var(--ink-3)" }}>
                  Equipment
                  <select value={editForm.equipment ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, equipment: e.target.value }))} style={{ display: "block", marginTop: 6, ...INPUT_STYLE }}>
                    <option value="">Select...</option>
                    {EQUIPMENT_OPTIONS.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
                  </select>
                </label>
              </div>

              <label style={{ fontSize: 11, color: "var(--ink-3)" }}>
                Tracking Type
                <select value={editForm.trackingType ?? "reps_weight"} onChange={(e) => setEditForm((f) => ({ ...f, trackingType: e.target.value as TrackingType }))} style={{ display: "block", marginTop: 6, ...INPUT_STYLE }}>
                  {TRACKING_TYPES.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>

              <label style={{ fontSize: 11, color: "var(--ink-3)" }}>
                Weight increment (kg)
                <input type="number" step="0.5" min="0" max="20" value={editForm.weightIncrement ?? 2.5} onChange={(e) => setEditForm((f) => ({ ...f, weightIncrement: parseFloat(e.target.value) || 0 }))} style={{ display: "block", marginTop: 6, ...INPUT_STYLE, width: 120 }} />
              </label>

              <label style={{ fontSize: 11, color: "var(--ink-3)" }}>
                Notes
                <textarea value={editForm.notes ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} rows={2} style={{ display: "block", marginTop: 6, ...INPUT_STYLE, resize: "vertical" as const }} />
              </label>

              <button onClick={saveEdit} disabled={saving} className="cc-btn cc-btn-primary" style={{ alignSelf: "flex-start" }}>
                {saving ? "Saving…" : "Save changes"}
              </button>

              {/* Video */}
              <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-2)", marginBottom: 12 }}>Demo video</div>
                {selected.videoUrl && selected.videoType === "youtube" && (
                  <iframe src={selected.videoUrl} style={{ width: "100%", height: 260, borderRadius: 8, border: "1px solid var(--line)", marginBottom: 12 }} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope" allowFullScreen />
                )}
                {selected.videoUrl && selected.videoType === "upload" && (
                  <video src={selected.videoUrl} controls style={{ width: "100%", borderRadius: 8, border: "1px solid var(--line)", marginBottom: 12 }} />
                )}
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <input value={youtubeInput} onChange={(e) => setYoutubeInput(e.target.value)} placeholder="Paste YouTube URL…" style={{ flex: 1, background: "var(--bg-input)", border: "1px solid var(--line)", borderRadius: 8, padding: "9px 14px", color: "var(--ink)", fontSize: 13, outline: "none" }} />
                  <button onClick={saveYouTube} className="cc-btn" style={{ flexShrink: 0 }}>Add YouTube</button>
                </div>
                <div>
                  <input ref={fileInputRef} type="file" accept="video/*" style={{ display: "none" }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !selected) return;
                      if (file.size > 50 * 1024 * 1024) { alert("Max 50MB"); return; }
                      const formData = new FormData();
                      formData.append("file", file);
                      formData.append("exerciseId", String(selected.id));
                      const res = await fetch("/api/workouts/exercises/upload-video", { method: "POST", body: formData });
                      if (res.ok) {
                        const { videoUrl } = await res.json();
                        const updated = { ...selected, videoUrl, videoType: "upload" };
                        setExercises((prev) => prev.map((ex) => (ex.id === selected.id ? updated : ex)));
                        setSelected(updated);
                      }
                    }}
                  />
                  <button onClick={() => fileInputRef.current?.click()} className="cc-btn" style={{ fontSize: 12 }}>↑ Upload video (max 50MB)</button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ExercisesPanel() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: "var(--ink-4)" }}>Loading…</div>}>
      <ExerciseLibraryInner />
    </Suspense>
  );
}
