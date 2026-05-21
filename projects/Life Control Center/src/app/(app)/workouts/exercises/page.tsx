"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

interface Exercise {
  id: number;
  name: string;
  primaryMuscle: string | null;
  secondaryMuscles: string[];
  equipment: string | null;
  weightIncrement: number;
  videoUrl: string | null;
  videoType: string | null;
  notes: string | null;
}

const MUSCLE_GROUPS = [
  { key: "all", label: "All" },
  { key: "chest", label: "Chest" },
  { key: "lats", label: "Back" },
  { key: "upper_back", label: "Upper Back" },
  { key: "quads", label: "Legs" },
  { key: "front_delts", label: "Shoulders" },
  { key: "biceps", label: "Arms" },
  { key: "triceps", label: "Triceps" },
  { key: "abs", label: "Core" },
];

const MUSCLE_LABELS: Record<string, string> = {
  chest: "Chest", front_delts: "Front Delts", side_delts: "Side Delts",
  rear_delts: "Rear Delts", triceps: "Triceps", biceps: "Biceps",
  lats: "Lats", upper_back: "Upper Back", upper_traps: "Traps",
  quads: "Quads", hamstrings: "Hams", glutes: "Glutes",
  calves: "Calves", abs: "Abs", obliques: "Obliques",
  forearms: "Forearms", serratus: "Serratus", unknown: "—",
};

const EQUIPMENT_OPTIONS = ["dumbbell", "cable", "barbell", "bodyweight", "machine", "other"];

function ExerciseLibraryInner() {
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [muscleFilter, setMuscleFilter] = useState("all");
  const [selected, setSelected] = useState<Exercise | null>(null);
  const [editForm, setEditForm] = useState<Partial<Exercise> | null>(null);
  const [saving, setSaving] = useState(false);
  const [youtubeInput, setYoutubeInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/workouts/exercises")
      .then((r) => r.json())
      .then((data: Exercise[]) => {
        setExercises(data);
        setLoading(false);
        if (editId) {
          const ex = data.find((e) => e.id === parseInt(editId));
          if (ex) openDetail(ex);
        }
      });
  }, [editId]);

  function openDetail(ex: Exercise) {
    setSelected(ex);
    setEditForm({ ...ex });
    setYoutubeInput(ex.videoType === "youtube" ? (ex.videoUrl ?? "") : "");
  }

  function closeDetail() {
    setSelected(null);
    setEditForm(null);
  }

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

  async function createExercise() {
    const name = prompt("Exercise name:");
    if (!name?.trim()) return;
    const res = await fetch("/api/workouts/exercises", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const newEx = await res.json();
    setExercises((prev) => [...prev, newEx].sort((a, b) => a.name.localeCompare(b.name)));
    openDetail(newEx);
  }

  const filtered = exercises.filter((ex) => {
    const matchesSearch = ex.name.toLowerCase().includes(search.toLowerCase());
    const matchesMuscle =
      muscleFilter === "all" ||
      ex.primaryMuscle === muscleFilter ||
      (muscleFilter === "lats" && (ex.primaryMuscle === "lats" || ex.primaryMuscle === "upper_back")) ||
      (muscleFilter === "quads" && ["quads", "hamstrings", "glutes", "calves"].includes(ex.primaryMuscle ?? "")) ||
      (muscleFilter === "front_delts" && ["front_delts", "side_delts", "rear_delts"].includes(ex.primaryMuscle ?? "")) ||
      (muscleFilter === "biceps" && ["biceps", "forearms"].includes(ex.primaryMuscle ?? "")) ||
      (muscleFilter === "abs" && ["abs", "obliques"].includes(ex.primaryMuscle ?? ""));
    return matchesSearch && matchesMuscle;
  });

  return (
    <div style={{ padding: "28px 32px 64px", maxWidth: 1100, margin: "0 auto" }}>

      {/* Page title */}
      <div className="cc-pagetitle" style={{ marginBottom: 26 }}>
        <div>
          <h1>Exercise Library<span className="grad-text">.</span></h1>
          <div className="sub">{exercises.length} exercises · tap to edit</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/workouts/templates" className="cc-btn">← Templates</Link>
          <button className="cc-btn cc-btn-primary" onClick={createExercise}>+ New exercise</button>
        </div>
      </div>

      {/* Search + filter */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" as const, alignItems: "center" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search exercises…"
          style={{
            flex: "1 1 240px", background: "var(--bg-input)", border: "1px solid var(--line)",
            borderRadius: 8, padding: "10px 14px", color: "var(--ink)", fontSize: 13, outline: "none",
          }}
        />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
          {MUSCLE_GROUPS.map((mg) => (
            <button
              key={mg.key}
              onClick={() => setMuscleFilter(mg.key)}
              style={{
                padding: "6px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer", transition: "all 0.1s",
                border: `1px solid ${muscleFilter === mg.key ? "var(--violet)" : "var(--line)"}`,
                background: muscleFilter === mg.key ? "rgba(179,136,255,0.15)" : "transparent",
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
                    {ex.primaryMuscle ? (MUSCLE_LABELS[ex.primaryMuscle] ?? ex.primaryMuscle) : "—"}
                    {ex.equipment ? ` · ${ex.equipment}` : ""}
                  </div>
                </div>
                {ex.videoUrl && (
                  <span style={{ fontSize: 10, color: "var(--cyan)", fontFamily: "var(--f-mono)", letterSpacing: "0.06em" }}>▶ VIDEO</span>
                )}
                <span style={{ fontSize: 10.5, color: "var(--ink-4)", fontFamily: "var(--f-mono)" }}>+{ex.weightIncrement}kg</span>
                <span style={{ color: "var(--ink-4)", fontSize: 14 }}>→</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--ink-4)", fontSize: 13 }}>
                No exercises match your filter.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Exercise detail modal */}
      {selected && editForm && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={(e) => { if (e.target === e.currentTarget) closeDetail(); }}
        >
          <div className="cc-card" style={{ width: 600, maxHeight: "85vh", overflow: "auto" }}>
            <div className="cc-card-head">
              <div className="title">{selected.name}</div>
              <button onClick={closeDetail} style={{ background: "none", border: "none", color: "var(--ink-4)", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>×</button>
            </div>
            <div className="cc-card-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Name */}
              <label style={{ fontSize: 11, color: "var(--ink-3)" }}>
                Name
                <input
                  value={editForm.name ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  style={{ display: "block", marginTop: 6, width: "100%", background: "var(--bg-input)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 14px", color: "var(--ink)", fontSize: 13 }}
                />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {/* Primary muscle */}
                <label style={{ fontSize: 11, color: "var(--ink-3)" }}>
                  Primary Muscle
                  <select
                    value={editForm.primaryMuscle ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, primaryMuscle: e.target.value }))}
                    style={{ display: "block", marginTop: 6, width: "100%", background: "var(--bg-input)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 14px", color: "var(--ink)", fontSize: 13 }}
                  >
                    <option value="">— Select —</option>
                    {Object.entries(MUSCLE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </label>

                {/* Equipment */}
                <label style={{ fontSize: 11, color: "var(--ink-3)" }}>
                  Equipment
                  <select
                    value={editForm.equipment ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, equipment: e.target.value }))}
                    style={{ display: "block", marginTop: 6, width: "100%", background: "var(--bg-input)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 14px", color: "var(--ink)", fontSize: 13 }}
                  >
                    <option value="">— Select —</option>
                    {EQUIPMENT_OPTIONS.map((eq) => <option key={eq} value={eq}>{eq}</option>)}
                  </select>
                </label>
              </div>

              {/* Weight increment */}
              <label style={{ fontSize: 11, color: "var(--ink-3)" }}>
                Weight increment (kg)
                <input
                  type="number" step="0.5" min="0.5"
                  value={editForm.weightIncrement ?? 2.5}
                  onChange={(e) => setEditForm((f) => ({ ...f, weightIncrement: parseFloat(e.target.value) }))}
                  style={{ display: "block", marginTop: 6, width: 120, background: "var(--bg-input)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 14px", color: "var(--ink)", fontSize: 13 }}
                />
              </label>

              {/* Notes */}
              <label style={{ fontSize: 11, color: "var(--ink-3)" }}>
                Notes
                <textarea
                  value={editForm.notes ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  style={{ display: "block", marginTop: 6, width: "100%", background: "var(--bg-input)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 14px", color: "var(--ink)", fontSize: 13, resize: "vertical" as const }}
                />
              </label>

              {/* Save button */}
              <button
                onClick={saveEdit}
                disabled={saving}
                className="cc-btn cc-btn-primary"
                style={{ alignSelf: "flex-start" }}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>

              {/* Video section */}
              <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-2)", marginBottom: 12 }}>Demo video</div>

                {/* Show existing video */}
                {selected.videoUrl && selected.videoType === "youtube" && (
                  <div style={{ marginBottom: 12 }}>
                    <iframe
                      src={selected.videoUrl}
                      style={{ width: "100%", height: 260, borderRadius: 8, border: "1px solid var(--line)" }}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
                      allowFullScreen
                    />
                  </div>
                )}
                {selected.videoUrl && selected.videoType === "upload" && (
                  <video
                    src={selected.videoUrl}
                    controls
                    style={{ width: "100%", borderRadius: 8, border: "1px solid var(--line)", marginBottom: 12 }}
                  />
                )}

                {/* YouTube input */}
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <input
                    value={youtubeInput}
                    onChange={(e) => setYoutubeInput(e.target.value)}
                    placeholder="Paste YouTube URL…"
                    style={{ flex: 1, background: "var(--bg-input)", border: "1px solid var(--line)", borderRadius: 8, padding: "9px 14px", color: "var(--ink)", fontSize: 13, outline: "none" }}
                  />
                  <button onClick={saveYouTube} className="cc-btn" style={{ flexShrink: 0 }}>
                    Add YouTube
                  </button>
                </div>

                {/* Upload button */}
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    style={{ display: "none" }}
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
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="cc-btn"
                    style={{ fontSize: 12 }}
                  >
                    ↑ Upload video (max 50MB)
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ExercisesPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: "var(--ink-4)" }}>Loading…</div>}>
      <ExerciseLibraryInner />
    </Suspense>
  );
}
