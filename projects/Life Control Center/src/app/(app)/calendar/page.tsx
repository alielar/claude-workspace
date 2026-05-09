"use client";

/**
 * /calendar — Unified calendar + tasks view.
 *
 * Two tabs:
 * 1. Upcoming — Google Calendar events + app tasks with due date, grouped by day
 * 2. Tasks    — Full task list (To Do / Done), create + complete + delete
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarDays, CheckSquare, Plus, Trash2, Check, Calendar } from "lucide-react";
import { format, isToday, isTomorrow, parseISO } from "date-fns";

type CalEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  isAllDay: boolean;
  source: "google" | "task";
  isDone?: boolean;
  taskId?: number;
};

type Task = {
  id: number;
  title: string;
  notes: string | null;
  dueDate: number | null;
  status: string;
  completedAt: number | null;
};

// ── helpers ───────────────────────────────────────────────────────────────────

function dayLabel(dateStr: string): string {
  const d = parseISO(dateStr);
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  return format(d, "EEEE, MMMM d");
}

function groupByDay(events: CalEvent[]): [string, CalEvent[]][] {
  const map = new Map<string, CalEvent[]>();
  for (const ev of events) {
    const key = ev.start.slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(ev);
  }
  return Array.from(map.entries());
}

// ── Task form ─────────────────────────────────────────────────────────────────

function NewTaskForm({ onCreated }: { onCreated: (task: Task) => void }) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, notes: notes || null, dueDate: dueDate || null }),
    });
    const task = await res.json();
    onCreated(task);
    setTitle("");
    setNotes("");
    setDueDate("");
    setLoading(false);
  };

  return (
    <form onSubmit={submit} className="glass rounded-2xl p-4 space-y-3">
      <input
        required
        placeholder="New task…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full rounded-xl px-3 py-2 text-sm outline-none"
        style={{
          background: "var(--bg-elevated)",
          color: "var(--text-primary)",
          border: "1px solid var(--glass-border)",
        }}
      />
      <div className="flex gap-2">
        <input
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="flex-1 rounded-xl px-3 py-2 text-sm outline-none"
          style={{
            background: "var(--bg-elevated)",
            color: "var(--text-primary)",
            border: "1px solid var(--glass-border)",
          }}
        />
        <input
          type="datetime-local"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="rounded-xl px-3 py-2 text-sm outline-none"
          style={{
            background: "var(--bg-elevated)",
            color: "var(--text-muted)",
            border: "1px solid var(--glass-border)",
          }}
        />
      </div>
      <button
        type="submit"
        disabled={loading || !title.trim()}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
        style={{ background: "var(--calendar-color)", color: "#fff" }}
      >
        <Plus size={14} />
        {loading ? "Saving…" : "Add Task"}
      </button>
    </form>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const [tab, setTab] = useState<"upcoming" | "tasks">("upcoming");
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/calendar/events").then((r) => r.json()),
      fetch("/api/tasks").then((r) => r.json()),
    ]).then(([evs, tks]) => {
      setEvents(evs);
      setTasks(tks);
      setLoading(false);
    });
  }, []);

  const completeTask = async (id: number) => {
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: "done", completedAt: Date.now() } : t))
    );
  };

  const deleteTask = async (id: number) => {
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setEvents((prev) => prev.filter((e) => e.taskId !== id));
  };

  const todoTasks = tasks.filter((t) => t.status === "todo");
  const doneTasks = tasks.filter((t) => t.status === "done");
  const grouped = groupByDay(events);

  return (
    <div className="page-enter p-5 md:p-10 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>Calendar</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
          {todoTasks.length} tasks · {events.filter((e) => e.source === "google").length} Google events
        </p>
      </div>

      {/* Tab toggle */}
      <div className="flex rounded-xl p-1 gap-1" style={{ background: "var(--bg-elevated)" }}>
        {(["upcoming", "tasks"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5"
            style={{
              background: tab === t ? "var(--calendar-color)" : "transparent",
              color: tab === t ? "#fff" : "var(--text-muted)",
            }}
          >
            {t === "upcoming" ? <CalendarDays size={13} /> : <CheckSquare size={13} />}
            {t === "upcoming" ? "Upcoming" : `Tasks (${todoTasks.length})`}
          </button>
        ))}
      </div>

      {/* ── Upcoming view ── */}
      {tab === "upcoming" && (
        <div className="space-y-5">
          {loading && <div className="glass rounded-2xl h-40 animate-pulse" />}

          {!loading && grouped.length === 0 && (
            <div className="glass rounded-2xl p-10 text-center">
              <Calendar size={32} className="mx-auto mb-3" style={{ color: "var(--text-muted)" }} />
              <p style={{ color: "var(--text-secondary)" }}>No upcoming events.</p>
              <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Add a task with a due date to see it here.</p>
            </div>
          )}

          {grouped.map(([dateKey, dayEvents]) => (
            <div key={dateKey}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--text-muted)" }}>
                {dayLabel(dateKey + "T00:00:00")}
              </p>
              <div className="space-y-2">
                {dayEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="glass rounded-xl p-3 flex items-center gap-3"
                    style={{ opacity: ev.isDone ? 0.5 : 1 }}
                  >
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        background: ev.source === "google" ? "var(--calendar-color)" : "var(--accent-bright)",
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm font-medium truncate"
                        style={{
                          color: "var(--text-primary)",
                          textDecoration: ev.isDone ? "line-through" : "none",
                        }}
                      >
                        {ev.title}
                      </p>
                      {!ev.isAllDay && (
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                          {format(parseISO(ev.start), "h:mm a")}
                        </p>
                      )}
                    </div>
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                      style={{
                        background: ev.source === "google" ? "rgba(52,211,153,0.1)" : "rgba(99,102,241,0.1)",
                        color: ev.source === "google" ? "var(--calendar-color)" : "var(--accent-bright)",
                      }}
                    >
                      {ev.source === "google" ? "Google" : "Task"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tasks view ── */}
      {tab === "tasks" && (
        <div className="space-y-4">
          <NewTaskForm
            onCreated={(task) => setTasks((prev) => [task as Task, ...prev])}
          />

          {todoTasks.length === 0 && (
            <div className="glass rounded-2xl p-8 text-center">
              <CheckSquare size={32} className="mx-auto mb-2" style={{ color: "var(--calendar-color)" }} />
              <p style={{ color: "var(--text-secondary)" }}>All done!</p>
            </div>
          )}

          <AnimatePresence>
            {todoTasks.map((task) => (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className="glass rounded-xl p-4 flex items-start gap-3"
              >
                <button
                  onClick={() => completeTask(task.id)}
                  className="mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all hover:border-green-400"
                  style={{ borderColor: "var(--glass-border)" }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {task.title}
                  </p>
                  {task.notes && (
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {task.notes}
                    </p>
                  )}
                  {task.dueDate && (
                    <p className="text-xs mt-1 font-medium" style={{ color: "var(--calendar-color)" }}>
                      Due: {format(new Date(task.dueDate), "MMM d, h:mm a")}
                    </p>
                  )}
                </div>
                <button onClick={() => deleteTask(task.id)} className="shrink-0 p-1">
                  <Trash2 size={14} style={{ color: "var(--text-muted)" }} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Completed tasks */}
          {doneTasks.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--text-muted)" }}>
                Completed ({doneTasks.length})
              </p>
              <div className="space-y-2">
                {doneTasks.slice(0, 10).map((task) => (
                  <div
                    key={task.id}
                    className="glass rounded-xl p-3 flex items-center gap-3 opacity-50"
                  >
                    <Check size={14} style={{ color: "var(--green)" }} />
                    <p
                      className="text-sm flex-1 truncate"
                      style={{ color: "var(--text-muted)", textDecoration: "line-through" }}
                    >
                      {task.title}
                    </p>
                    <button onClick={() => deleteTask(task.id)}>
                      <Trash2 size={12} style={{ color: "var(--text-muted)" }} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
