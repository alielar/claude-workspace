"use client";

/**
 * ActiveWorkoutLogger — the gym-mode session logging UI.
 *
 * Features:
 * - Scrollable exercise list with collapsible sets
 * - Per-set inputs: weight (kg), reps, RIR (tap to set 0–4)
 * - Warm-up set shown first, styled differently
 * - Drop sets shown inline (no rest)
 * - Rest timer: auto-starts after completing a set (countdown ring)
 * - Timed sets: countdown timer for Core holds
 * - Exercise demo GIF on tap
 * - Total workout timer in header
 * - Finish button → saves log → shows progression suggestions
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Square, Check, ChevronDown, ChevronUp,
  Info, SkipForward, Trophy
} from "lucide-react";
import { cn, formatDuration, formatWorkoutDuration } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type SetTemplate = {
  id: number;
  setNumber: number;
  setType: "standard" | "drop" | "warmup";
  repRangeMin?: number | null;
  repRangeMax?: number | null;
  durationSeconds?: number | null;
  rirTarget?: number | null;
  restSeconds: number;
};

type Exercise = {
  id: number;
  name: string;
  muscleGroup?: string | null;
  demoGifUrl?: string | null;
  sets: SetTemplate[];
  // Injected by session page from progressive overload engine
  suggestedWeightKg?: number | null;
  suggestionMessage?: string | null;
};

type LoggedSet = {
  setNumber: number;
  setType: "standard" | "drop" | "warmup";
  weightKg: number | null;
  repsLogged: number | null;
  durationSeconds: number | null;
  rirLogged: number | null;
  restSeconds: number;
  completed: boolean;
};

type ExerciseLog = {
  exerciseId: number;
  sets: LoggedSet[];
};

// ── Rest Timer Component ───────────────────────────────────────────────────────

function RestTimer({
  seconds,
  onDone,
  onSkip,
}: {
  seconds: number;
  onDone: () => void;
  onSkip: () => void;
}) {
  const [remaining, setRemaining] = useState(seconds);
  const total = seconds;

  useEffect(() => {
    if (remaining <= 0) { onDone(); return; }
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining, onDone]);

  const pct = remaining / total;
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = circ * pct;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className="flex flex-col items-center gap-3 py-4"
    >
      <div className="relative w-20 h-20">
        <svg width="80" height="80" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={r} fill="none" stroke="var(--bg-elevated)" strokeWidth="4" />
          <circle
            cx="40" cy="40" r={r}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="4"
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
            className="timer-ring"
            style={{ transition: "stroke-dasharray 0.9s linear" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
            {remaining}s
          </span>
        </div>
      </div>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>Rest</p>
      <button
        onClick={onSkip}
        className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg"
        style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}
      >
        <SkipForward size={12} /> Skip rest
      </button>
    </motion.div>
  );
}

// ── RIR Picker ────────────────────────────────────────────────────────────────

function RirPicker({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[null, 0, 1, 2, 3, 4].map((v) => (
        <button
          key={v ?? "none"}
          onClick={() => onChange(v === value ? null : v)}
          className="w-8 h-7 rounded-lg text-xs font-medium transition-all set-row"
          style={{
            background: value === v ? "var(--accent)" : "var(--bg-elevated)",
            color: value === v ? "#fff" : "var(--text-muted)",
            minHeight: "unset",
          }}
        >
          {v === null ? "-" : v}
        </button>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ActiveWorkoutLogger({
  sessionId,
  sessionName,
  exercises: exList,
  onFinish,
}: {
  sessionId: number;
  sessionName: string;
  exercises: Exercise[];
  onFinish: (log: { sessionId: number; startedAt: number; finishedAt: number; exerciseLogs: ExerciseLog[] }) => void;
}) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [startedAt] = useState<number>(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [expandedEx, setExpandedEx] = useState<number>(exList[0]?.id ?? -1);
  const [logs, setLogs] = useState<Record<number, LoggedSet[]>>(() =>
    Object.fromEntries(
      exList.map((ex) => [
        ex.id,
        ex.sets.map((s) => ({
          setNumber: s.setNumber,
          setType: s.setType,
          weightKg: null,
          repsLogged: null,
          durationSeconds: s.durationSeconds ?? null,
          rirLogged: null,
          restSeconds: s.restSeconds,
          completed: false,
        })),
      ])
    )
  );
  const [restTimer, setRestTimer] = useState<{ seconds: number } | null>(null);
  const [showGif, setShowGif] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  // ── Workout timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Set completion ─────────────────────────────────────────────────────────
  const completeSet = useCallback(
    (exerciseId: number, setIdx: number) => {
      setLogs((prev) => {
        const updated = { ...prev };
        const sets = [...updated[exerciseId]];
        sets[setIdx] = { ...sets[setIdx], completed: true };
        updated[exerciseId] = sets;
        return updated;
      });
      // Start rest timer (skip for drop sets and Core holds with their own countdown)
      const ex = exList.find((e) => e.id === exerciseId);
      const tpl = ex?.sets[setIdx];
      if (tpl && tpl.setType !== "drop" && !tpl.durationSeconds) {
        setRestTimer({ seconds: tpl.restSeconds });
      }
    },
    [exList]
  );

  // ── Update set field ───────────────────────────────────────────────────────
  const updateSet = (exerciseId: number, setIdx: number, field: keyof LoggedSet, value: any) => {
    setLogs((prev) => {
      const updated = { ...prev };
      const sets = [...updated[exerciseId]];
      sets[setIdx] = { ...sets[setIdx], [field]: value };
      updated[exerciseId] = sets;
      return updated;
    });
  };

  // ── Finish workout ─────────────────────────────────────────────────────────
  const handleFinish = async () => {
    setFinishing(true);
    const finishedAt = Date.now();
    const exerciseLogs = exList.map((ex) => ({
      exerciseId: ex.id,
      sets: logs[ex.id],
    }));
    onFinish({ sessionId, startedAt, finishedAt, exerciseLogs });
  };

  // ── Completed sets count ───────────────────────────────────────────────────
  const totalSets = Object.values(logs).flat().length;
  const completedSets = Object.values(logs).flat().filter((s) => s.completed).length;

  return (
    <div className="flex flex-col h-full">
      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between"
        style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}
      >
        <div>
          <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: "var(--workout-color)" }}>
            {sessionName}
          </p>
          <p className="text-lg font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
            {formatWorkoutDuration(elapsed)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {completedSets}/{totalSets} sets
          </span>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleFinish}
            disabled={finishing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            <Check size={14} /> Finish
          </motion.button>
        </div>
      </div>

      {/* ── Rest timer overlay ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {restTimer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: "rgba(10,10,15,0.85)", backdropFilter: "blur(8px)" }}
          >
            <RestTimer
              seconds={restTimer.seconds}
              onDone={() => setRestTimer(null)}
              onSkip={() => setRestTimer(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Exercise list ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-24">
        {exList.map((ex, exIdx) => {
          const isExpanded = expandedEx === ex.id;
          const exSets = logs[ex.id] ?? [];
          const exCompleted = exSets.filter((s) => s.completed).length;
          const exTotal = exSets.length;

          return (
            <div key={ex.id} className="glass rounded-2xl overflow-hidden">
              {/* Exercise header */}
              <button
                onClick={() => setExpandedEx(isExpanded ? -1 : ex.id)}
                className="w-full flex items-center justify-between px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
                    style={{ background: "var(--accent-dim)", color: "var(--accent-bright)" }}
                  >
                    {exIdx + 1}
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>
                      {ex.name}
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {ex.muscleGroup} · {exCompleted}/{exTotal} sets
                    </p>
                    {ex.suggestionMessage && (
                      <p className="text-[10px] mt-0.5 font-medium" style={{ color: "var(--workout-color)" }}>
                        💡 {ex.suggestionMessage}
                        {ex.suggestedWeightKg ? ` → ${ex.suggestedWeightKg}kg` : ""}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {ex.demoGifUrl && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowGif(ex.demoGifUrl!); }}
                      className="p-1.5 rounded-lg"
                      style={{ background: "var(--accent-dim)" }}
                    >
                      <Info size={14} style={{ color: "var(--accent-bright)" }} />
                    </button>
                  )}
                  {isExpanded ? (
                    <ChevronUp size={16} style={{ color: "var(--text-muted)" }} />
                  ) : (
                    <ChevronDown size={16} style={{ color: "var(--text-muted)" }} />
                  )}
                </div>
              </button>

              {/* Sets */}
              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: "auto" }}
                    exit={{ height: 0 }}
                    style={{ overflow: "hidden" }}
                  >
                    <div
                      className="px-4 pb-4 space-y-2"
                      style={{ borderTop: "1px solid var(--border)" }}
                    >
                      {/* Column headers */}
                      <div className="grid grid-cols-[40px_1fr_1fr_auto_40px] gap-2 pt-3 pb-1 text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                        <span>Set</span>
                        <span>kg</span>
                        <span>{exSets[0]?.durationSeconds ? "sec" : "reps"}</span>
                        <span>RIR</span>
                        <span></span>
                      </div>

                      {exSets.map((s, sIdx) => {
                        const tpl = ex.sets[sIdx];
                        const isWarmup = s.setType === "warmup";
                        const isDrop = s.setType === "drop";
                        const isTimed = !!tpl?.durationSeconds;

                        return (
                          <div
                            key={sIdx}
                            className={cn(
                              "grid grid-cols-[40px_1fr_1fr_auto_40px] gap-2 items-center rounded-xl px-2 py-2 set-row",
                              s.completed
                                ? "opacity-60"
                                : isWarmup
                                ? "bg-amber-500/5 border border-amber-500/20"
                                : isDrop
                                ? "bg-purple-500/5 border border-purple-500/20"
                                : "bg-white/[0.02] border border-white/5"
                            )}
                          >
                            {/* Set label */}
                            <div className="flex items-center">
                              {s.completed ? (
                                <Check size={14} style={{ color: "var(--green)" }} />
                              ) : (
                                <span
                                  className="text-xs font-semibold"
                                  style={{
                                    color: isWarmup
                                      ? "var(--amber)"
                                      : isDrop
                                      ? "var(--library-color)"
                                      : "var(--text-muted)",
                                  }}
                                >
                                  {isWarmup ? "W" : isDrop ? "D" : s.setNumber - 1}
                                </span>
                              )}
                            </div>

                            {/* Weight input */}
                            <input
                              type="number"
                              min="0"
                              max="20"
                              step="0.5"
                              placeholder="kg"
                              value={s.weightKg ?? ""}
                              onChange={(e) =>
                                updateSet(ex.id, sIdx, "weightKg", e.target.value ? parseFloat(e.target.value) : null)
                              }
                              className="w-full rounded-lg px-2 py-1.5 text-sm text-center font-medium outline-none focus:ring-1"
                              style={{
                                background: "var(--bg-elevated)",
                                color: "var(--text-primary)",
                                border: "1px solid var(--border)",
                              }}
                            />

                            {/* Reps / Duration input */}
                            <input
                              type="number"
                              min="0"
                              placeholder={isTimed ? `${tpl!.durationSeconds}s` : tpl?.repRangeMin ? `${tpl.repRangeMin}–${tpl.repRangeMax}` : "reps"}
                              value={isTimed ? (s.durationSeconds ?? "") : (s.repsLogged ?? "")}
                              onChange={(e) => {
                                const v = e.target.value ? parseInt(e.target.value) : null;
                                updateSet(ex.id, sIdx, isTimed ? "durationSeconds" : "repsLogged", v);
                              }}
                              className="w-full rounded-lg px-2 py-1.5 text-sm text-center font-medium outline-none focus:ring-1"
                              style={{
                                background: "var(--bg-elevated)",
                                color: "var(--text-primary)",
                                border: "1px solid var(--border)",
                              }}
                            />

                            {/* RIR picker (compact: 0-4 buttons) */}
                            <div className="flex gap-0.5">
                              {[0, 1, 2, 3, 4].map((v) => (
                                <button
                                  key={v}
                                  onClick={() => updateSet(ex.id, sIdx, "rirLogged", s.rirLogged === v ? null : v)}
                                  className="w-6 h-6 rounded text-[10px] font-semibold transition-all"
                                  style={{
                                    background: s.rirLogged === v ? "var(--accent)" : "var(--bg-elevated)",
                                    color: s.rirLogged === v ? "#fff" : "var(--text-muted)",
                                  }}
                                >
                                  {v}
                                </button>
                              ))}
                            </div>

                            {/* Complete set button */}
                            <button
                              onClick={() => !s.completed && completeSet(ex.id, sIdx)}
                              disabled={s.completed}
                              className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                              style={{
                                background: s.completed ? "var(--green)20" : "var(--accent-dim)",
                                color: s.completed ? "var(--green)" : "var(--accent-bright)",
                              }}
                            >
                              <Check size={14} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* ── Demo GIF modal ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showGif && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowGif(null)}
            className="fixed inset-0 z-50 flex items-center justify-center p-8"
            style={{ background: "rgba(10,10,15,0.9)", backdropFilter: "blur(8px)" }}
          >
            <motion.img
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              src={showGif}
              alt="Exercise demo"
              className="max-w-sm w-full rounded-2xl"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
