"use client";

/**
 * /checklist — Daily recurring checklist.
 *
 * Features:
 * - Virtual workout item at top (auto from workout rotation)
 * - Per-item flame streak
 * - Tap to check with spring animation
 * - Completion % in header
 * - Settings drawer: add / rename / delete items
 * - Seeds 4 default items on first use
 */

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Flame, Plus, X, Check, Settings, GripVertical,
  Dumbbell, Pencil, ChevronRight,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Item = {
  id: number;
  title: string;
  emoji: string | null;
  sortOrder: number;
  completedToday: boolean;
  streak: number;
  source: "manual" | "workout";
  href?: string;
};

// ─── Default seeds (shown on first-use empty state) ──────────────────────────

const SUGGESTED = [
  { emoji: "📚", title: "Read 30 min" },
  { emoji: "🧠", title: "Study / coursework" },
  { emoji: "💧", title: "Drink 2L water" },
  { emoji: "🌙", title: "Journal reflection" },
];

// ─── CheckItem component ─────────────────────────────────────────────────────

function CheckItem({
  item,
  onToggle,
  onEdit,
  onDelete,
  editMode,
}: {
  item: Item;
  onToggle: (id: number, source: Item["source"]) => void;
  onEdit?: (id: number, title: string, emoji: string | null) => void;
  onDelete?: (id: number) => void;
  editMode: boolean;
}) {
  const [animating, setAnimating] = useState(false);

  const handleToggle = () => {
    if (item.source === "workout") return; // virtual — not togglable
    setAnimating(true);
    onToggle(item.id, item.source);
    setTimeout(() => setAnimating(false), 400);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      className="flex items-center gap-3"
      style={{
        padding: "11px 14px",
        borderRadius: 10,
        background: item.completedToday
          ? "var(--success-glow)"
          : "var(--bg-elevated)",
        border: `1px solid ${item.completedToday
          ? "rgba(16,185,129,0.2)"
          : "var(--border-subtle)"}`,
        marginBottom: 6,
        transition: "background 200ms, border-color 200ms",
        minHeight: 48,
      }}
    >
      {/* Edit mode drag handle */}
      {editMode && item.source === "manual" && (
        <GripVertical size={14} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
      )}

      {/* Checkbox */}
      {item.source !== "workout" && (
        <button
          onClick={handleToggle}
          className="flex items-center justify-center shrink-0 transition-all"
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            border: `1.5px solid ${item.completedToday ? "var(--success)" : "var(--border-default)"}`,
            background: item.completedToday ? "var(--success)" : "transparent",
            flexShrink: 0,
          }}
        >
          <AnimatePresence>
            {item.completedToday && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 28 }}
              >
                <Check size={12} color="#fff" strokeWidth={2.5} />
              </motion.div>
            )}
          </AnimatePresence>
        </button>
      )}

      {/* Workout icon (virtual) */}
      {item.source === "workout" && (
        <div
          className="flex items-center justify-center shrink-0"
          style={{
            width: 22, height: 22, borderRadius: 6,
            background: item.completedToday ? "var(--module-workout)" : "rgba(249,115,22,0.12)",
          }}
        >
          <Dumbbell size={11} style={{ color: item.completedToday ? "#fff" : "var(--module-workout)" }} />
        </div>
      )}

      {/* Label */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        {item.emoji && (
          <span style={{ fontSize: 15 }}>{item.emoji}</span>
        )}
        <span
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: item.completedToday ? "var(--text-secondary)" : "var(--text-primary)",
            textDecoration: item.completedToday ? "line-through" : "none",
            transition: "color 200ms",
          }}
          className="truncate"
        >
          {item.title}
        </span>
        {item.source === "workout" && (
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
            style={{ background: "rgba(249,115,22,0.12)", color: "var(--module-workout)", flexShrink: 0 }}
          >
            auto
          </span>
        )}
      </div>

      {/* Streak badge */}
      {item.streak >= 2 && !editMode && (
        <div className="flex items-center gap-1 shrink-0">
          <Flame size={12} style={{ color: "#F97316" }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: "#F97316" }}>{item.streak}</span>
        </div>
      )}

      {/* Edit mode actions */}
      {editMode && item.source === "manual" && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onEdit?.(item.id, item.title, item.emoji)}
            className="p-1.5 rounded-lg transition-colors"
            style={{ background: "var(--bg-elevated-2)" }}
          >
            <Pencil size={11} style={{ color: "var(--text-secondary)" }} />
          </button>
          <button
            onClick={() => onDelete?.(item.id)}
            className="p-1.5 rounded-lg transition-colors"
            style={{ background: "var(--danger-glow)" }}
          >
            <X size={11} style={{ color: "var(--danger)" }} />
          </button>
        </div>
      )}

      {/* Workout item → link to workout */}
      {item.source === "workout" && !editMode && !item.completedToday && (
        <ChevronRight size={13} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
      )}
    </motion.div>
  );
}

// ─── Add / Edit item form ─────────────────────────────────────────────────────

function ItemForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: { title: string; emoji: string | null };
  onSave: (title: string, emoji: string | null) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? "");

  return (
    <div
      className="rounded-xl p-3 space-y-2"
      style={{ background: "var(--bg-elevated-2)", border: "1px solid var(--border-default)" }}
    >
      <div className="flex gap-2">
        <input
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          placeholder="✨"
          maxLength={2}
          className="input text-center"
          style={{ width: 44, flexShrink: 0, padding: "8px 4px" }}
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Item title…"
          className="input flex-1"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && title.trim()) onSave(title, emoji.trim() || null);
            if (e.key === "Escape") onCancel();
          }}
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => title.trim() && onSave(title, emoji.trim() || null)}
          disabled={!title.trim()}
          className="btn btn-primary flex-1"
          style={{ fontSize: 13, padding: "7px 0" }}
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="btn btn-ghost"
          style={{ fontSize: 13, padding: "7px 14px" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ChecklistPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<{ id: number; title: string; emoji: string | null } | null>(null);
  const [migrated, setMigrated] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/checklist");
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  // Run migration on first load (creates tables if needed), then load items
  useEffect(() => {
    (async () => {
      if (!migrated) {
        await fetch("/api/admin/migrate", { method: "POST" });
        setMigrated(true);
      }
      await load();
    })();
  }, [load, migrated]);

  const toggle = async (id: number, source: Item["source"]) => {
    if (source === "workout") return;
    // Optimistic update
    setItems((prev) =>
      prev.map((it) =>
        it.id === id ? { ...it, completedToday: !it.completedToday } : it
      )
    );
    await fetch("/api/checklist/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: id }),
    });
    // Re-fetch to get accurate streak
    await load();
  };

  const addItem = async (title: string, emoji: string | null) => {
    const res = await fetch("/api/checklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, emoji }),
    });
    if (res.ok) {
      setAddOpen(false);
      await load();
    }
  };

  const seedItem = async (emoji: string, title: string) => {
    await fetch("/api/checklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, emoji }),
    });
    await load();
  };

  const editItem = async (id: number, title: string, emoji: string | null) => {
    await fetch(`/api/checklist/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, emoji }),
    });
    setEditTarget(null);
    await load();
  };

  const deleteItem = async (id: number) => {
    // Optimistic
    setItems((prev) => prev.filter((it) => it.id !== id));
    await fetch(`/api/checklist/${id}`, { method: "DELETE" });
  };

  // Stats
  const manualItems  = items.filter((i) => i.source === "manual");
  const allCheckable = items.filter((i) => i.source !== "workout" || true); // include workout virtual
  const completed    = items.filter((i) => i.completedToday).length;
  const total        = items.length;
  const pct          = total > 0 ? Math.round((completed / total) * 100) : 0;
  const hasManual    = manualItems.length > 0;

  return (
    <div className="page-enter" style={{ padding: "20px 20px 40px", maxWidth: 640, margin: "0 auto" }}>

      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
            Daily Checklist
          </h1>
          {!loading && total > 0 && (
            <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 3 }}>
              {completed}/{total} completed
              {pct === 100 && " · 🎉 All done!"}
            </p>
          )}
        </div>
        <button
          onClick={() => { setEditMode((e) => !e); setAddOpen(false); setEditTarget(null); }}
          className="btn btn-ghost"
          style={{ fontSize: 12, padding: "6px 12px", gap: 5 }}
        >
          <Settings size={13} />
          {editMode ? "Done" : "Manage"}
        </button>
      </div>

      {/* Progress bar */}
      {!loading && total > 0 && (
        <div className="progress-track mb-4" style={{ height: 4 }}>
          <div
            className="progress-fill"
            style={{
              width: `${pct}%`,
              background: pct === 100
                ? "var(--success)"
                : "var(--accent-primary)",
            }}
          />
        </div>
      )}

      {/* Skeleton */}
      {loading && (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton" style={{ height: 48, borderRadius: 10 }} />
          ))}
        </div>
      )}

      {/* Items */}
      {!loading && (
        <AnimatePresence initial={false}>
          {items.map((item) => (
            editTarget?.id === item.id
              ? (
                <motion.div
                  key={`edit-${item.id}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  style={{ marginBottom: 6 }}
                >
                  <ItemForm
                    initial={{ title: editTarget.title, emoji: editTarget.emoji }}
                    onSave={(t, e) => editItem(item.id, t, e)}
                    onCancel={() => setEditTarget(null)}
                  />
                </motion.div>
              )
              : (
                <CheckItem
                  key={item.id}
                  item={item}
                  onToggle={toggle}
                  onEdit={(id, title, emoji) => setEditTarget({ id, title, emoji })}
                  onDelete={deleteItem}
                  editMode={editMode}
                />
              )
          ))}
        </AnimatePresence>
      )}

      {/* Empty state — no user items yet */}
      {!loading && !hasManual && (
        <div
          className="rounded-xl p-5 mt-2"
          style={{ background: "var(--bg-elevated-2)", border: "1px solid var(--border-subtle)" }}
        >
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
            Add your daily habits
          </p>
          <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 14 }}>
            What do you want to do every single day? Start with a few items.
          </p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED.map((s) => (
              <button
                key={s.title}
                onClick={() => seedItem(s.emoji, s.title)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                style={{
                  background: "var(--bg-elevated-3)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-secondary)",
                  fontSize: 12,
                }}
              >
                <span>{s.emoji}</span> {s.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add item form */}
      <AnimatePresence>
        {addOpen && !editMode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mt-2"
          >
            <ItemForm onSave={addItem} onCancel={() => setAddOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add button */}
      {!editMode && !addOpen && (
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-2 w-full mt-3 rounded-xl"
          style={{
            padding: "11px 14px",
            background: "transparent",
            border: "1px dashed var(--border-default)",
            color: "var(--text-tertiary)",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          <Plus size={14} />
          Add item
        </button>
      )}

      {/* Streak info footer */}
      {!loading && items.some((i) => i.streak >= 2) && !editMode && (
        <div
          className="mt-5 rounded-xl p-3 flex items-center gap-2"
          style={{ background: "var(--bg-elevated-2)", border: "1px solid var(--border-subtle)" }}
        >
          <Flame size={14} style={{ color: "#F97316" }} />
          <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Keep going — streaks reset if you miss a day.
          </p>
        </div>
      )}
    </div>
  );
}
