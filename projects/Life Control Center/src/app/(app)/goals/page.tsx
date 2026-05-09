"use client";

/**
 * /goals — Personal goals tracker.
 *
 * Features:
 * - Create goals with optional numeric target + unit
 * - Categories: Fitness, Reading, Work, Other
 * - Manual progress updates (slider / input)
 * - Mark complete, archive
 * - Pre-populated with two seed goals (seeded on first visit if none exist)
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Target, Plus, Check, X, Archive, TrendingUp, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";

type Goal = {
  id: number;
  title: string;
  description: string | null;
  category: string;
  targetValue: number | null;
  currentValue: number;
  unit: string | null;
  targetDate: number | null;
  status: string;
  completedAt: number | null;
};

const CATEGORY_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  fitness: { color: "var(--workout-color)", bg: "rgba(245,158,11,0.12)", label: "Fitness" },
  reading: { color: "var(--library-color)", bg: "rgba(167,139,250,0.12)", label: "Reading" },
  work:    { color: "var(--accent-bright)", bg: "rgba(99,102,241,0.12)",  label: "Work" },
  other:   { color: "var(--text-muted)",    bg: "var(--bg-elevated)",     label: "Other" },
};

// ── Goal card ─────────────────────────────────────────────────────────────────

function GoalCard({
  goal,
  onUpdate,
  onComplete,
  onArchive,
  onDelete,
}: {
  goal: Goal;
  onUpdate: (id: number, currentValue: number) => void;
  onComplete: (id: number) => void;
  onArchive: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editValue, setEditValue] = useState(String(goal.currentValue));
  const cat = CATEGORY_CONFIG[goal.category] ?? CATEGORY_CONFIG.other;

  const pct =
    goal.targetValue && goal.targetValue > 0
      ? Math.min(100, Math.round((goal.currentValue / goal.targetValue) * 100))
      : null;

  const save = async () => {
    const v = parseFloat(editValue);
    if (!isNaN(v)) onUpdate(goal.id, v);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className="glass rounded-2xl p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* Category dot */}
          <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: cat.color }} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                {goal.title}
              </p>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                style={{ background: cat.bg, color: cat.color }}
              >
                {cat.label}
              </span>
              {goal.status === "completed" && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                  style={{ background: "rgba(74,222,128,0.1)", color: "var(--green)" }}>
                  Done
                </span>
              )}
            </div>

            {goal.description && (
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                {goal.description}
              </p>
            )}

            {/* Progress bar */}
            {pct !== null && (
              <div className="mt-2">
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: cat.color }}
                  />
                </div>
                <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                  {goal.currentValue} / {goal.targetValue} {goal.unit ?? ""} · {pct}%
                </p>
              </div>
            )}

            {goal.targetDate && (
              <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                Target: {format(new Date(goal.targetDate), "MMM d, yyyy")}
              </p>
            )}
          </div>
        </div>

        {/* Expand/collapse */}
        <button onClick={() => setExpanded((e) => !e)} className="p-1 shrink-0">
          {expanded
            ? <ChevronUp size={14} style={{ color: "var(--text-muted)" }} />
            : <ChevronDown size={14} style={{ color: "var(--text-muted)" }} />}
        </button>
      </div>

      {/* Expanded actions */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 flex items-center gap-2 flex-wrap" style={{ borderTop: "1px solid var(--glass-border)" }}>
              {/* Update progress */}
              {goal.targetValue && goal.status === "active" && (
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="w-20 rounded-lg px-2 py-1 text-sm outline-none text-center"
                    style={{
                      background: "var(--bg-elevated)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--glass-border)",
                    }}
                  />
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>{goal.unit}</span>
                  <button
                    onClick={save}
                    className="px-2 py-1 rounded-lg text-xs font-semibold"
                    style={{ background: "rgba(74,222,128,0.15)", color: "var(--green)" }}
                  >
                    Save
                  </button>
                </div>
              )}

              {goal.status === "active" && (
                <button
                  onClick={() => onComplete(goal.id)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold"
                  style={{ background: "rgba(74,222,128,0.15)", color: "var(--green)" }}
                >
                  <Check size={12} /> Complete
                </button>
              )}

              <button
                onClick={() => onArchive(goal.id)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold"
                style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
              >
                <Archive size={12} /> Archive
              </button>

              <button
                onClick={() => onDelete(goal.id)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold"
                style={{ background: "rgba(248,113,113,0.1)", color: "var(--red)" }}
              >
                <X size={12} /> Delete
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── New goal form ──────────────────────────────────────────────────────────────

function NewGoalForm({ onCreated }: { onCreated: (g: Goal) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [targetValue, setTargetValue] = useState("");
  const [unit, setUnit] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    const res = await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description: description || null,
        category,
        targetValue: targetValue ? parseFloat(targetValue) : null,
        unit: unit || null,
        targetDate: targetDate || null,
      }),
    });
    const goal = await res.json();
    onCreated(goal);
    setTitle(""); setDescription(""); setCategory("other");
    setTargetValue(""); setUnit(""); setTargetDate("");
    setLoading(false);
    setOpen(false);
  };

  return (
    <div>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full glass rounded-2xl p-4 flex items-center gap-2 text-sm font-medium transition-all hover:scale-[1.005]"
          style={{ color: "var(--goals-color)" }}
        >
          <Plus size={16} /> New Goal
        </button>
      ) : (
        <form onSubmit={submit} className="glass rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>New Goal</p>
            <button type="button" onClick={() => setOpen(false)}>
              <X size={16} style={{ color: "var(--text-muted)" }} />
            </button>
          </div>

          <input
            required
            placeholder="Goal title…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-xl px-3 py-2 text-sm outline-none"
            style={{ background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--glass-border)" }}
          />
          <input
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-xl px-3 py-2 text-sm outline-none"
            style={{ background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--glass-border)" }}
          />

          <div className="grid grid-cols-2 gap-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-xl px-3 py-2 text-sm outline-none"
              style={{ background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--glass-border)" }}
            >
              <option value="fitness">Fitness</option>
              <option value="reading">Reading</option>
              <option value="work">Work</option>
              <option value="other">Other</option>
            </select>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="rounded-xl px-3 py-2 text-sm outline-none"
              style={{ background: "var(--bg-elevated)", color: "var(--text-muted)", border: "1px solid var(--glass-border)" }}
            />
          </div>

          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Target (e.g. 5)"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              className="flex-1 rounded-xl px-3 py-2 text-sm outline-none"
              style={{ background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--glass-border)" }}
            />
            <input
              placeholder="Unit (km, books…)"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="flex-1 rounded-xl px-3 py-2 text-sm outline-none"
              style={{ background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--glass-border)" }}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !title.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
            style={{ background: "var(--goals-color)", color: "#fff" }}
          >
            <Plus size={14} /> {loading ? "Saving…" : "Create Goal"}
          </button>
        </form>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/goals")
      .then((r) => r.json())
      .then((data) => { setGoals(data); setLoading(false); });
  }, []);

  const updateProgress = async (id: number, currentValue: number) => {
    await fetch(`/api/goals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentValue }),
    });
    setGoals((prev) => prev.map((g) => g.id === id ? { ...g, currentValue } : g));
  };

  const completeGoal = async (id: number) => {
    await fetch(`/api/goals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });
    setGoals((prev) => prev.map((g) => g.id === id ? { ...g, status: "completed" } : g));
  };

  const archiveGoal = async (id: number) => {
    await fetch(`/api/goals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });
    setGoals((prev) => prev.filter((g) => g.id !== id));
  };

  const deleteGoal = async (id: number) => {
    await fetch(`/api/goals/${id}`, { method: "DELETE" });
    setGoals((prev) => prev.filter((g) => g.id !== id));
  };

  const active = goals.filter((g) => g.status === "active");
  const completed = goals.filter((g) => g.status === "completed");

  return (
    <div className="page-enter p-5 md:p-10 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>Goals</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
          {active.length} active · {completed.length} completed
        </p>
      </div>

      {/* New goal form */}
      <NewGoalForm onCreated={(g) => setGoals((prev) => [...prev, g])} />

      {/* Active goals */}
      {loading && <div className="glass rounded-2xl h-32 animate-pulse" />}

      {!loading && active.length === 0 && (
        <div className="glass rounded-2xl p-10 flex flex-col items-center gap-3">
          <Target size={36} style={{ color: "var(--goals-color)" }} />
          <p className="font-medium" style={{ color: "var(--text-primary)" }}>No active goals</p>
          <p className="text-sm text-center" style={{ color: "var(--text-muted)" }}>
            Set goals to track your progress across fitness, reading, and more.
          </p>
        </div>
      )}

      <AnimatePresence>
        {active.map((goal) => (
          <GoalCard
            key={goal.id}
            goal={goal}
            onUpdate={updateProgress}
            onComplete={completeGoal}
            onArchive={archiveGoal}
            onDelete={deleteGoal}
          />
        ))}
      </AnimatePresence>

      {/* Completed goals */}
      {completed.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>
            Completed
          </p>
          <div className="space-y-3">
            {completed.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onUpdate={updateProgress}
                onComplete={completeGoal}
                onArchive={archiveGoal}
                onDelete={deleteGoal}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
