"use client";

import { use, useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SetConfig {
  type: "standard" | "warmup" | "drop" | "failure";
  repMin: number;
  repMax: number;
  restS: number;
}

type TrackingType = "reps_weight" | "reps_only" | "time_weight" | "time_only" | "distance";

interface WorkoutExercise {
  planExerciseId: number;
  exerciseId: number;
  name: string;
  primaryMuscle: string | null;
  equipment: string | null;
  weightIncrement: number;
  trackingType: TrackingType;
  videoUrl: string | null;
  videoType: string | null;
  sortOrder: number;
  setConfig: SetConfig[];
}

interface LoggedSet {
  id: number;
  exerciseId: number | null;
  exerciseName: string;
  setNumber: number;
  setType: string;
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
}

interface PrefillSet {
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  setType: string;
}

interface SessionData {
  session: {
    id: number;
    workoutName: string;
    date: string;
    durationSeconds: number | null;
    planId: number | null;
  };
  exercises: WorkoutExercise[];
  loggedSets: LoggedSet[];
  prefillMap: Record<number, PrefillSet[]>;
  prMap: Record<number, number>;
}

// ─── Set type colors ──────────────────────────────────────────────────────────

const SET_TYPE_COLOR: Record<string, string> = {
  standard: "var(--violet)",
  warmup:   "var(--warn)",
  drop:     "var(--cyan)",
  failure:  "var(--neg)",
};

const SET_TYPE_LABEL: Record<string, string> = {
  standard: "Working",
  warmup:   "Warm-up",
  drop:     "Drop",
  failure:  "Failure",
};

// ─── Rest Timer ───────────────────────────────────────────────────────────────

function RestTimer({ seconds, onDone }: { seconds: number; onDone: () => void }) {
  const [remaining, setRemaining] = useState(seconds);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (remaining <= 0) {
      // Vibrate + audio ping on timer end
      try { navigator?.vibrate?.([200, 100, 200]); } catch {}
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 800;
        gain.gain.value = 0.3;
        osc.start();
        setTimeout(() => { osc.stop(); ctx.close(); }, 200);
      } catch {}
      onDoneRef.current();
      return;
    }
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining]);

  const pct = ((seconds - remaining) / seconds) * 100;
  const min = Math.floor(remaining / 60);
  const sec = remaining % 60;
  const urgent = remaining <= 10;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Rest timer: ${min} minutes ${sec} seconds remaining`}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
      }}
    >
      <div className="cc-card" style={{ width: "min(300px, 100vw - 32px)", padding: "32px 28px", textAlign: "center" }}>
        <div style={{ fontSize: 10, color: "var(--ink-5)", fontFamily: "var(--f-mono)", letterSpacing: "0.16em", marginBottom: 22 }}>
          REST TIMER
        </div>
        <div style={{
          fontSize: 68, fontWeight: 200, fontFamily: "var(--f-mono)", lineHeight: 1,
          color: urgent ? "var(--warn)" : "var(--ink)",
          transition: "color 0.3s var(--easeOut)",
        }}>
          {min}:{sec.toString().padStart(2, "0")}
        </div>
        <div style={{ marginTop: 24, height: 3, background: "var(--line)", borderRadius: 99, overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${pct}%`,
            background: urgent ? "var(--warn)" : "var(--violet)",
            borderRadius: 99, transition: "width 1s linear, background 0.3s var(--easeOut)",
          }} />
        </div>
        <button
          onClick={() => onDoneRef.current()}
          className="cc-btn"
          style={{ marginTop: 24, width: "100%", padding: "10px 0", letterSpacing: "0.04em" }}
        >
          Skip rest →
        </button>
      </div>
    </div>
  );
}

// ─── Number Pad (bottom sheet) ────────────────────────────────────────────────

function NumberPad({
  value, onChange, onClose, label, unit, allowDecimal = true,
}: {
  value: string; onChange: (v: string) => void; onClose: () => void;
  label: string; unit?: string; allowDecimal?: boolean;
}) {
  const [input, setInput] = useState(value || "");
  const padRef = useRef<HTMLDivElement>(null);

  // Focus trap + Escape to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    // Focus the pad container on mount
    padRef.current?.focus();
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handleKey(key: string) {
    if (key === "back") setInput((v) => v.slice(0, -1));
    else if (key === ".") { if (allowDecimal) setInput((v) => v.includes(".") ? v : v + "."); }
    else setInput((v) => v + key);
  }

  function handleDone() { onChange(input); onClose(); }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", allowDecimal ? "." : "", "0", "back"];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 250, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div style={{ flex: 1, background: "rgba(0,0,0,0.5)" }} onClick={onClose} />
      <div
        ref={padRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Enter ${label}`}
        tabIndex={-1}
        style={{
          background: "var(--bg-card)", borderTop: "1px solid var(--line)",
          borderRadius: "20px 20px 0 0", padding: "20px 16px 28px",
          outline: "none",
        }}
      >
        {/* Display */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: "var(--ink-4)", letterSpacing: "0.14em", textTransform: "uppercase" as const, marginBottom: 8 }}>
            {label}
          </div>
          <div style={{ fontSize: 42, fontFamily: "var(--f-mono)", fontWeight: 300, color: "var(--ink)", minHeight: 50 }}>
            {input || "0"}
            {unit && <span style={{ fontSize: 18, color: "var(--ink-4)", marginLeft: 4 }}>{unit}</span>}
          </div>
        </div>
        {/* Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
          {keys.map((k, i) => (
            <button
              key={i}
              className="numpad-key"
              onClick={() => k && handleKey(k)}
              aria-label={k === "back" ? "Delete last digit" : k === "." ? "Decimal point" : k || undefined}
              style={{
                height: 56, minWidth: 56, borderRadius: 12, border: "1px solid var(--line)",
                background: k === "back" ? "rgba(255,100,100,0.06)" : "rgba(255,255,255,0.03)",
                color: k === "back" ? "var(--neg)" : "var(--ink)",
                fontSize: k === "back" ? 20 : 22, fontFamily: "var(--f-mono)", fontWeight: 400,
                cursor: k ? "pointer" : "default", opacity: k ? 1 : 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background 0.12s var(--easeOut), transform 0.1s var(--easeOut)",
              }}
            >
              {k === "back" ? "⌫" : k}
            </button>
          ))}
        </div>
        <button onClick={handleDone} className="cc-btn-primary" style={{
          width: "100%", padding: "16px 0", borderRadius: 12,
          fontSize: 16, fontWeight: 700, cursor: "pointer",
        }}>
          Done
        </button>
      </div>
    </div>
  );
}

// ─── Number stepper (mobile-optimized) ────────────────────────────────────────

function Stepper({
  label, value, onChange, step = 1, min = 0, unit = "", disabled = false, hint,
  allowDecimal = true,
}: {
  label: string; value: string; onChange: (v: string) => void;
  step?: number; min?: number; unit?: string; disabled?: boolean; hint?: string;
  allowDecimal?: boolean;
}) {
  const [showPad, setShowPad] = useState(false);

  function nudge(delta: number) {
    const cur = parseFloat(value) || 0;
    const next = Math.max(min, Math.round((cur + delta * step) * 100) / 100);
    onChange(next.toString());
  }

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: "var(--ink-4)", fontWeight: 500 }}>
          {label}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={() => nudge(-1)}
            disabled={disabled}
            aria-label={`Decrease ${label}`}
            style={{
              width: 48, height: 48, borderRadius: 10, border: "1px solid var(--line)",
              background: disabled ? "transparent" : "var(--bg-input)", color: "var(--ink-2)",
              cursor: disabled ? "default" : "pointer", fontSize: 22, flexShrink: 0,
              opacity: disabled ? 0.35 : 1, display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >−</button>
          <button
            onClick={() => !disabled && setShowPad(true)}
            disabled={disabled}
            aria-label={`Edit ${label} value`}
            style={{
              minWidth: 80, padding: "8px 12px", borderRadius: 10,
              background: disabled ? "transparent" : "var(--bg-input)",
              border: `1px solid ${disabled ? "transparent" : "var(--line)"}`,
              cursor: disabled ? "default" : "pointer", textAlign: "center",
            }}
          >
            <div style={{
              fontSize: 24, fontFamily: "var(--f-mono)", fontWeight: 400,
              color: disabled ? "var(--ink-3)" : "var(--ink)",
            }}>
              {value || "0"}
            </div>
            {unit && <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 2, letterSpacing: "0.06em" }}>{unit}</div>}
          </button>
          <button
            onClick={() => nudge(1)}
            disabled={disabled}
            aria-label={`Increase ${label}`}
            style={{
              width: 48, height: 48, borderRadius: 10, border: "1px solid var(--line)",
              background: disabled ? "transparent" : "var(--bg-input)", color: "var(--ink-2)",
              cursor: disabled ? "default" : "pointer", fontSize: 22, flexShrink: 0,
              opacity: disabled ? 0.35 : 1, display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >+</button>
        </div>
        {hint && <div style={{ fontSize: 10, color: "var(--ink-5)", letterSpacing: "0.04em" }}>{hint}</div>}
      </div>
      {showPad && (
        <NumberPad value={value} onChange={onChange} onClose={() => setShowPad(false)}
          label={label} unit={unit} allowDecimal={allowDecimal} />
      )}
    </>
  );
}

// ─── Set Card ─────────────────────────────────────────────────────────────────

interface SetCardProps {
  setIndex: number;
  config: SetConfig;
  prefill: PrefillSet | null;
  logged: LoggedSet | null;
  currentPr1rm: number;
  weightIncrement: number;
  trackingType: TrackingType;
  onLog: (data: { setType: string; weightKg: number | null; reps: number | null; durationSeconds?: number | null }) => void;
  onUndo: () => void;
}

function SetCard({ setIndex, config, prefill, logged, currentPr1rm, weightIncrement, trackingType, onLog, onUndo }: SetCardProps) {
  const initialWeight   = logged?.weightKg?.toString()       ?? prefill?.weightKg?.toString() ?? "";
  const initialReps     = logged?.reps?.toString()           ?? prefill?.reps?.toString()     ?? config.repMax.toString();
  const initialDuration = logged?.durationSeconds?.toString() ?? "";

  const [weight,   setWeight]   = useState(initialWeight);
  const [reps,     setReps]     = useState(initialReps);
  const [duration, setDuration] = useState(initialDuration); // seconds for time types; km for distance
  const [setType,  setSetType]  = useState<string>(logged?.setType ?? config.type);

  const needsWeight   = trackingType === "reps_weight" || trackingType === "time_weight";
  const needsReps     = trackingType === "reps_weight" || trackingType === "reps_only";
  const needsDuration = trackingType === "time_weight" || trackingType === "time_only";
  const needsDist     = trackingType === "distance";

  // Reset inputs when "undo" clears the logged prop
  const prevLogged = useRef(logged);
  useEffect(() => {
    if (prevLogged.current !== null && logged === null) {
      // Set was undone — restore to prefill
      setWeight(prefill?.weightKg?.toString() ?? initialWeight);
      setReps(prefill?.reps?.toString() ?? initialReps);
    }
    prevLogged.current = logged;
  }, [logged, prefill?.weightKg, prefill?.reps, initialWeight, initialReps]);

  const isDone = !!logged;

  const w = parseFloat(weight);
  const r = parseInt(reps);
  const estimated1rm = !isNaN(w) && !isNaN(r) && r > 0 ? w * (1 + r / 30) : null;
  const isPr = estimated1rm !== null && estimated1rm > currentPr1rm && currentPr1rm > 0;

  function handleLog() {
    const weightKg  = needsWeight  ? (parseFloat(weight) || null)    : null;
    const repsVal   = parseInt(reps, 10);
    const durVal    = needsDuration ? (parseInt(duration, 10) || null) : null;
    const distVal   = needsDist     ? (parseFloat(duration) || null)   : null;
    onLog({
      setType,
      weightKg,
      reps:            needsReps ? (!isNaN(repsVal) ? repsVal : null) : null,
      durationSeconds: durVal ?? (distVal ? Math.round(distVal * 1000) : null), // encode km as metres for distance
    });
  }

  const typeColor = SET_TYPE_COLOR[setType] ?? "var(--ink-4)";

  return (
    <div style={{
      borderRadius: 12, border: `1px solid ${isDone ? "rgba(111,212,154,0.25)" : "var(--line)"}`,
      background: isDone ? "rgba(111,212,154,0.03)" : "rgba(255,255,255,0.015)",
      padding: "16px 20px", marginBottom: 10, transition: "all 0.2s var(--easeOut)",
    }}>
      {/* Set header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: isDone ? "rgba(111,212,154,0.20)" : `${typeColor}22`,
            border: `1px solid ${isDone ? "rgba(111,212,154,0.50)" : `${typeColor}55`}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 700, fontFamily: "var(--f-mono)",
            color: isDone ? "var(--pos)" : typeColor,
          }}>
            {isDone ? "✓" : setIndex + 1}
          </div>
          {/* Set type selector */}
          <select
            value={setType}
            onChange={(e) => setSetType(e.target.value)}
            disabled={isDone}
            style={{
              background: "transparent", border: "none", color: typeColor,
              fontSize: 11, fontFamily: "var(--f-mono)", fontWeight: 600, letterSpacing: "0.08em",
              cursor: isDone ? "default" : "pointer", textTransform: "uppercase" as const, outline: "none",
            }}
          >
            {Object.entries(SET_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Target range hint */}
          <span style={{ fontSize: 10.5, color: "var(--ink-4)", fontFamily: "var(--f-mono)" }}>
            target {config.repMin}–{config.repMax} reps
          </span>
          {isPr && !isDone && (
            <span style={{
              fontSize: 9.5, fontFamily: "var(--f-mono)", fontWeight: 700, letterSpacing: "0.10em",
              color: "var(--warn)", background: "rgba(255,193,92,0.15)", padding: "2px 6px", borderRadius: 4,
            }}>
              ↑ PR
            </span>
          )}
          {isDone && (
            <span style={{ fontSize: 9.5, fontFamily: "var(--f-mono)", color: "var(--pos)", letterSpacing: "0.10em" }}>
              ✓ DONE
            </span>
          )}
        </div>
      </div>

      {/* Last session hint with progression indicator */}
      {prefill && !isDone && (
        <div style={{ fontSize: 11, color: "var(--ink-5)", marginBottom: 14, letterSpacing: "0.02em", display: "flex", alignItems: "center", gap: 8 }}>
          <span>
            Last: <span style={{ color: "var(--ink-3)", fontFamily: "var(--f-mono)" }}>
              {prefill.weightKg ?? "-"}kg × {prefill.reps ?? "-"}
            </span>
          </span>
          {w > (prefill.weightKg ?? 0) && (
            <span style={{ fontSize: 10, fontFamily: "var(--f-mono)", color: "var(--pos)", fontWeight: 600 }}>
              +{(w - (prefill.weightKg ?? 0)).toFixed(1)}kg
            </span>
          )}
        </div>
      )}

      {/* Adaptive steppers */}
      <div style={{
        display: "grid",
        gridTemplateColumns: [needsWeight, needsReps || needsDuration || needsDist]
          .filter(Boolean).length === 2 ? "1fr 1fr" : "1fr",
        gap: 12, marginBottom: 16,
      }}>
        {needsWeight && (
          <Stepper label="Weight" value={weight} onChange={setWeight}
            step={weightIncrement} unit="kg" disabled={isDone}
            hint={prefill?.weightKg ? `last: ${prefill.weightKg}kg` : undefined}
            allowDecimal />
        )}
        {needsDuration && (
          <Stepper label="Duration" value={duration} onChange={setDuration}
            step={5} unit="sec" disabled={isDone} min={0}
            hint="seconds" allowDecimal={false} />
        )}
        {needsDist && (
          <Stepper label="Distance" value={duration} onChange={setDuration}
            step={0.1} unit="km" disabled={isDone} min={0}
            allowDecimal />
        )}
        {needsReps && (
          <Stepper label="Reps" value={reps} onChange={setReps}
            step={1} unit="reps" disabled={isDone}
            hint={`${config.repMin}–${config.repMax}`} allowDecimal={false} />
        )}
      </div>

      {/* Action button */}
      {isDone ? (
        <button
          onClick={onUndo}
          className="set-undo-btn"
          style={{
            width: "100%", padding: "12px 0", borderRadius: 10,
            background: "rgba(255,255,255,0.03)", border: "1px solid var(--line)",
            color: "var(--ink-4)", fontSize: 12, fontFamily: "var(--f-mono)", cursor: "pointer",
            letterSpacing: "0.06em", transition: "background 0.15s var(--easeOut), color 0.15s var(--easeOut)",
          }}
        >
          undo set
        </button>
      ) : (
        <button
          onClick={handleLog}
          className="set-log-btn"
          style={{
            width: "100%", padding: "14px 0", borderRadius: 10,
            background: isPr ? "linear-gradient(135deg, var(--warn), #FF8800)" : "var(--violet)", border: "none",
            color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer",
            letterSpacing: "0.01em",
            boxShadow: isPr ? "0 0 18px rgba(255,193,92,0.25)" : "0 0 12px rgba(124,77,255,0.20)",
            transition: "transform 0.1s var(--easeOut), box-shadow 0.15s var(--easeOut)",
          }}
        >
          {isPr ? "⚡ Log PR set " : "✓ Log set "}{setIndex + 1}
        </button>
      )}
    </div>
  );
}

// ─── Exercise block ───────────────────────────────────────────────────────────

interface ExerciseBlockProps {
  exercise: WorkoutExercise;
  loggedSets: LoggedSet[];
  prefill: PrefillSet[];
  prMap: Record<number, number>;
  onLogSet: (exerciseId: number, exerciseName: string, data: {
    setType: string; weightKg: number | null; reps: number | null; durationSeconds?: number | null;
  }, restS: number) => void;
  onUndoSet: (setId: number) => void;
  id?: string;
}

function ExerciseBlock({ exercise, loggedSets, prefill, prMap, onLogSet, onUndoSet, id }: ExerciseBlockProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const currentPr = prMap[exercise.exerciseId] ?? 0;
  const mySets = loggedSets.filter((s) => s.exerciseId === exercise.exerciseId);
  const totalSets = exercise.setConfig.length;
  const doneSets = mySets.length;
  const allDone = doneSets >= totalSets && doneSets > 0;

  return (
    <div id={id} className="cc-card" style={{ marginBottom: 14, scrollMarginTop: 140 }}>
      {/* Exercise header — clickable to collapse */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        aria-label={`${exercise.name}: ${doneSets} of ${totalSets} sets done`}
        style={{
          width: "100%", background: "none", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 16px", borderBottom: collapsed ? "none" : "1px solid var(--line)",
        }}
      >
        <div style={{ textAlign: "left" }}>
          <div style={{
            fontSize: 15, fontWeight: 600, color: allDone ? "var(--pos)" : "var(--ink)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
          }} title={exercise.name}>
            {allDone && <span style={{ marginRight: 6 }}>✓</span>}
            {exercise.name}
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2 }}>
            {[exercise.primaryMuscle, exercise.equipment].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {exercise.videoUrl && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowVideo(true); }}
              aria-label={`Watch ${exercise.name} demo video`}
              style={{
                width: 32, height: 32, borderRadius: 8, border: "1px solid var(--line)",
                background: "rgba(100,255,218,0.06)", color: "var(--cyan)",
                fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}
            >▶</button>
          )}
          <span style={{
            fontSize: 11, fontFamily: "var(--f-mono)",
            color: allDone ? "var(--pos)" : doneSets > 0 ? "var(--violet)" : "var(--ink-4)",
          }}>
            {doneSets}/{totalSets}
          </span>
          <span style={{ fontSize: 16, color: "var(--ink-4)", transition: "transform 0.15s", transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>
            ↓
          </span>
        </div>
      </button>

      {!collapsed && (
        <div style={{ padding: "14px 16px" }}>
          {/* PR context */}
          {currentPr > 0 && (
            <div style={{ fontSize: 11, color: "var(--ink-4)", marginBottom: 14, padding: "8px 12px", background: "rgba(124,77,255,0.05)", borderRadius: 8, border: "1px solid rgba(124,77,255,0.12)" }}>
              Current PR: <span style={{ color: "var(--violet)", fontFamily: "var(--f-mono)" }}>est. {currentPr.toFixed(1)} kg 1RM</span>
            </div>
          )}

          {exercise.setConfig.map((cfg, idx) => {
            const loggedSet = mySets.find((s) => s.setNumber === idx + 1) ?? null;
            const prefillSet = prefill[idx] ?? null;
            return (
              <SetCard
                key={idx}
                setIndex={idx}
                config={cfg}
                prefill={prefillSet}
                logged={loggedSet}
                currentPr1rm={currentPr}
                weightIncrement={exercise.weightIncrement}
                trackingType={exercise.trackingType}
                onLog={(data) => onLogSet(exercise.exerciseId, exercise.name, data, cfg.restS)}
                onUndo={() => loggedSet && onUndoSet(loggedSet.id)}
              />
            );
          })}
        </div>
      )}

      {/* Video modal */}
      {showVideo && exercise.videoUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${exercise.name} demo video`}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 150,
            padding: 16,
          }}
          onClick={() => setShowVideo(false)}
        >
          <div
            className="cc-card"
            style={{ width: "min(560px, 100vw - 32px)", overflow: "hidden" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cc-card-head">
              <div className="title">{exercise.name}</div>
              <button
                onClick={() => setShowVideo(false)}
                style={{ background: "none", border: "none", color: "var(--ink-4)", cursor: "pointer", fontSize: 20, lineHeight: 1 }}
              >×</button>
            </div>
            <div style={{ padding: 0 }}>
              {exercise.videoType === "youtube" ? (
                <iframe
                  src={exercise.videoUrl}
                  style={{ width: "100%", aspectRatio: "16/9", border: "none", display: "block" }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
                  allowFullScreen
                />
              ) : (
                <video
                  src={exercise.videoUrl}
                  controls
                  autoPlay
                  style={{ width: "100%", display: "block" }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Progression suggestion colors ───────────────────────────────────────────

const SUGGESTION_COLOR: Record<string, string> = {
  increase: "var(--pos)",
  maintain: "var(--ink-3)",
  deload:   "var(--warn)",
};

// ─── Session Summary ──────────────────────────────────────────────────────────

function SessionSummary({
  data,
  elapsedSeconds,
  onClose,
}: {
  data: SessionData;
  elapsedSeconds: number;
  onClose: () => void;
}) {
  const [suggestions, setSuggestions] = useState<Record<string, { action: string; suggestedWeightKg: number | null; message: string }>>({});

  useEffect(() => {
    if (data.session.planId) {
      fetch(`/api/workouts/suggestions?planId=${data.session.planId}`)
        .then((r) => r.json())
        .then((d) => setSuggestions(d ?? {}))
        .catch(() => {});
    }
  }, [data.session.planId]);

  const totalSets = data.loggedSets.length;
  const totalVolume = data.loggedSets.reduce((sum, s) => sum + (s.weightKg ?? 0) * (s.reps ?? 0), 0);
  const min = Math.floor(elapsedSeconds / 60);
  const sec = elapsedSeconds % 60;
  const suggestionEntries = Object.entries(suggestions);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Session complete"
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300,
        padding: "0 16px",
      }}
    >
      <div className="cc-card" style={{ width: "min(440px, 100vw - 32px)", maxHeight: "88vh", overflow: "auto" }}>
        <div className="cc-card-head">
          <div className="title">Session complete 🎉</div>
        </div>
        <div className="cc-card-body">
          {/* Stats hero */}
          <div className="session-summary-grid" style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0,
            background: "rgba(124,77,255,0.06)", borderRadius: 12, overflow: "hidden",
            border: "1px solid rgba(124,77,255,0.15)", marginBottom: 20,
          }}>
            {[
              { value: totalSets, label: "sets" },
              { value: `${Math.round(totalVolume).toLocaleString()} kg`, label: "volume" },
              { value: `${min}:${sec.toString().padStart(2, "0")}`, label: "time" },
            ].map((stat, i) => (
              <div key={stat.label} style={{
                padding: "18px 12px", textAlign: "center",
                borderRight: i < 2 ? "1px solid rgba(124,77,255,0.15)" : "none",
              }}>
                <div style={{ fontSize: 26, fontWeight: 300, fontFamily: "var(--f-mono)", color: "var(--ink)", letterSpacing: "-0.02em" }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: 10, color: "var(--ink-4)", letterSpacing: "0.10em", textTransform: "uppercase" as const, marginTop: 4 }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 20 }}>
            {data.session.workoutName} · {data.session.date}
          </div>

          {/* Progression suggestions */}
          {suggestionEntries.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase" as const, color: "var(--ink-4)", fontWeight: 600, marginBottom: 12 }}>
                Next session
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {suggestionEntries.map(([name, s]) => (
                  <div key={name} style={{
                    display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px",
                    background: "rgba(255,255,255,0.025)", borderRadius: 8,
                    border: `1px solid ${(SUGGESTION_COLOR[s.action] ?? "var(--line)") + "33"}`,
                  }}>
                    <span style={{
                      fontSize: 9, fontFamily: "var(--f-mono)", fontWeight: 700,
                      letterSpacing: "0.1em", flexShrink: 0, marginTop: 3,
                      color: SUGGESTION_COLOR[s.action] ?? "var(--ink-3)",
                    }}>
                      {s.action === "increase" ? "↑ UP" : s.action === "deload" ? "↓ DELOAD" : "= HOLD"}
                    </span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ink)" }}>{name}</div>
                      <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 1, lineHeight: 1.4 }}>{s.message}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button onClick={onClose} className="cc-btn-primary" style={{
            width: "100%", padding: "13px 0", borderRadius: 10,
            fontWeight: 700, fontSize: 15, cursor: "pointer", letterSpacing: "-0.01em",
          }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ActiveSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId: sid } = use(params);
  const router = useRouter();

  const [data, setData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loggedSets, setLoggedSets] = useState<LoggedSet[]>([]);
  const [restTimer, setRestTimer] = useState<{ seconds: number } | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [abandonConfirm, setAbandonConfirm] = useState(false);
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

  // Auto-clear log error after 3 seconds
  useEffect(() => {
    if (!logError) return;
    const t = setTimeout(() => setLogError(null), 3000);
    return () => clearTimeout(t);
  }, [logError]);

  // Elapsed timer
  const startTimeRef = useRef<number>(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Load session data
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/workouts/session/${sid}`);
        if (!r.ok) throw new Error("Session not found");
        const d: SessionData = await r.json();
        setData(d);
        setLoggedSets(d.loggedSets ?? []);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load session");
      } finally {
        setLoading(false);
      }
    })();
  }, [sid]);

  const handleLogSet = useCallback(async (
    exerciseId: number,
    exerciseName: string,
    setData: { setType: string; weightKg: number | null; reps: number | null; durationSeconds?: number | null },
    restS: number,
    setNumber: number,
  ) => {
    const res = await fetch(`/api/workouts/session/${sid}/sets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exerciseId, exerciseName, setNumber, ...setData }),
    });
    if (!res.ok) { setLogError("Failed to save set — tap to retry"); return; }
    const json = await res.json();
    if (json.setId) {
      setLoggedSets((prev) => [...prev, {
        id: json.setId, exerciseId, exerciseName, setNumber,
        setType: setData.setType, weightKg: setData.weightKg,
        reps: setData.reps, durationSeconds: setData.durationSeconds ?? null,
      }]);
      if (restS > 0 && setData.setType !== "warmup") {
        setRestTimer({ seconds: restS });
      }
    }
  }, [sid]);

  const handleUndoSet = useCallback(async (setId: number) => {
    const res = await fetch(`/api/workouts/session/${sid}/sets?setId=${setId}`, { method: "DELETE" });
    if (res.ok) {
      setLoggedSets((prev) => prev.filter((s) => s.id !== setId));
    }
  }, [sid]);

  const handleFinish = useCallback(async () => {
    setFinishing(true);
    try {
      const res = await fetch(`/api/workouts/session/${sid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durationSeconds: elapsed, finished: true }),
      });
      if (!res.ok) throw new Error("Save failed");
      setShowSummary(true);
    } catch {
      alert("Failed to save session. Please try again.");
    } finally {
      setFinishing(false);
    }
  }, [sid, elapsed]);

  const handleAbandon = useCallback(async () => {
    const res = await fetch(`/api/workouts/session/${sid}`, { method: "DELETE" });
    if (res.ok) router.push("/workouts");
  }, [sid, router]);

  const elapsedMin = Math.floor(elapsed / 60);
  const elapsedSec = elapsed % 60;

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
        <div style={{ color: "var(--ink-4)", fontSize: 13, fontFamily: "var(--f-mono)" }}>Loading session…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: 32, maxWidth: 720, margin: "0 auto" }}>
        <div className="cc-card" style={{ padding: "32px", textAlign: "center" }}>
          <div style={{ color: "var(--neg)", marginBottom: 16 }}>{error ?? "Session not found"}</div>
          <Link href="/workouts" className="cc-btn">← Back to Workouts</Link>
        </div>
      </div>
    );
  }

  const totalConfigSets = data.exercises.reduce((sum, ex) => sum + ex.setConfig.length, 0);
  const doneSets = loggedSets.length;
  const progressPct = totalConfigSets > 0 ? (doneSets / totalConfigSets) * 100 : 0;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>

      {/* ── Sticky top bar ───────────────────────────────────────────────── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "var(--bg)", padding: "16px 24px 0",
        borderBottom: "1px solid var(--line)",
      }}>
        <div className="active-session-header" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
              {data.session.workoutName}<span className="grad-text">.</span>
            </h1>
            <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2, fontFamily: "var(--f-mono)" }}>
              {data.session.date}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              padding: "6px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid var(--line)",
              fontFamily: "var(--f-mono)", fontSize: 18, fontWeight: 500,
              color: elapsed > 5400 ? "var(--warn)" : "var(--ink-2)",
            }}>
              {elapsedMin}:{elapsedSec.toString().padStart(2, "0")}
            </div>
            {doneSets > 0 ? (
              <button onClick={handleFinish} disabled={finishing} className="cc-btn-primary" style={{
                padding: "10px 20px", borderRadius: 10,
                fontSize: 14, fontWeight: 700, cursor: finishing ? "wait" : "pointer", letterSpacing: "-0.01em",
              }}>
                {finishing ? "Saving…" : "Finish"}
              </button>
            ) : (
              <button
                onClick={() => setDiscardConfirm(true)}
                style={{
                  padding: "10px 20px", borderRadius: 10,
                  background: "transparent", border: "1px solid var(--neg)",
                  color: "var(--neg)", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                Discard
              </button>
            )}
          </div>
        </div>

        {/* Progress bar in sticky header */}
        <div style={{ paddingBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "var(--f-mono)" }}>
              {doneSets} / {totalConfigSets} sets
            </span>
            <span style={{ fontSize: 11, color: "var(--ink-4)" }}>
              {Math.round(progressPct)}%
            </span>
          </div>
          <div style={{ height: 4, background: "var(--line)", borderRadius: 99, overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${progressPct}%`,
              background: progressPct === 100 ? "var(--pos)" : "var(--grad)",
              borderRadius: 99, transition: "width 0.3s, background 0.3s",
            }} />
          </div>
        </div>
      </div>

      {/* ── Log error toast ─────────────────────────────────────────────── */}
      {logError && (
        <div style={{
          position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", zIndex: 100,
          padding: "10px 20px", borderRadius: 10,
          background: "rgba(255,100,100,0.15)", border: "1px solid var(--neg)",
          color: "var(--neg)", fontSize: 12, fontWeight: 600,
          boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
        }}>
          {logError}
        </div>
      )}

      {/* ── Exercise jump nav strip ──────────────────────────────────────── */}
      {data.exercises.length > 3 && (
        <div style={{
          position: "sticky", top: 120, zIndex: 40,
          padding: "8px 24px", background: "var(--bg)",
          display: "flex", gap: 6, overflowX: "auto",
          borderBottom: "1px solid var(--line)",
        }}>
          {data.exercises.map((ex) => {
            const exDone = loggedSets.filter(s => s.exerciseId === ex.exerciseId).length;
            const exTotal = ex.setConfig.length;
            const isDone = exDone >= exTotal;
            return (
              <button
                key={ex.exerciseId}
                className="jump-pill"
                onClick={() => {
                  document.getElementById(`ex-${ex.exerciseId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                style={{
                  flexShrink: 0, padding: "5px 10px", borderRadius: 6,
                  fontSize: 11, fontFamily: "var(--f-mono)", letterSpacing: "0.02em",
                  border: `1px solid ${isDone ? "rgba(111,212,154,0.25)" : "var(--line)"}`,
                  background: isDone ? "rgba(111,212,154,0.06)" : "rgba(255,255,255,0.03)",
                  color: isDone ? "var(--pos)" : "var(--ink-3)",
                  cursor: "pointer", whiteSpace: "nowrap",
                  transition: "background 0.15s var(--easeOut), border-color 0.15s var(--easeOut)",
                }}
              >
                {isDone ? "✓ " : ""}{ex.name.length > 12 ? ex.name.slice(0, 12) + "…" : ex.name}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Scrollable content ───────────────────────────────────────────── */}
      <div style={{ padding: "20px 24px 100px" }}>

      {/* ── Exercise blocks ───────────────────────────────────────────────── */}
      {data.exercises.map((ex) => (
        <ExerciseBlock
          key={ex.exerciseId}
          id={`ex-${ex.exerciseId}`}
          exercise={ex}
          loggedSets={loggedSets.filter((s) => s.exerciseId === ex.exerciseId)}
          prefill={data.prefillMap[ex.exerciseId] ?? []}
          prMap={data.prMap}
          onLogSet={(exerciseId, exerciseName, setData, restS) => {
            const myLogged = loggedSets.filter((s) => s.exerciseId === exerciseId);
            handleLogSet(exerciseId, exerciseName, setData, restS, myLogged.length + 1);
          }}
          onUndoSet={handleUndoSet}
        />
      ))}

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div style={{ marginTop: 32, display: "flex", gap: 10, justifyContent: "center" }}>
        <Link href="/workouts" className="cc-btn" style={{ fontSize: 13, padding: "10px 16px" }}>
          ← Back
        </Link>
        {!abandonConfirm ? (
          <button onClick={() => setAbandonConfirm(true)} className="cc-btn" style={{ fontSize: 13, color: "var(--neg)", padding: "10px 16px" }}>
            Abandon session
          </button>
        ) : (
          <>
            <button onClick={() => setAbandonConfirm(false)} className="cc-btn" style={{ fontSize: 13, padding: "10px 16px" }}>
              Cancel
            </button>
            <button onClick={handleAbandon} style={{
              padding: "10px 16px", borderRadius: 10, border: "1px solid var(--neg)",
              background: "rgba(255,100,100,0.08)", color: "var(--neg)",
              fontSize: 13, cursor: "pointer",
            }}>
              Yes, abandon
            </button>
          </>
        )}
      </div>
      </div>{/* end scrollable content */}

      {/* Discard confirmation dialog */}
      {discardConfirm && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Discard session confirmation"
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.80)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
          }}
        >
          <div className="cc-card" style={{ width: 340, padding: "32px 28px", textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)", marginBottom: 8 }}>
              Discard this session?
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 24, lineHeight: 1.5 }}>
              Nothing will be saved.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button
                onClick={() => setDiscardConfirm(false)}
                className="cc-btn"
                style={{ padding: "10px 20px", fontSize: 13 }}
              >
                Cancel
              </button>
              <button
                onClick={handleAbandon}
                style={{
                  padding: "10px 20px", borderRadius: 10,
                  background: "rgba(255,100,100,0.12)", border: "1px solid var(--neg)",
                  color: "var(--neg)", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overlays */}
      {restTimer && (
        <RestTimer seconds={restTimer.seconds} onDone={() => setRestTimer(null)} />
      )}

      {showSummary && (
        <SessionSummary
          data={{ ...data, loggedSets }}
          elapsedSeconds={elapsed}
          onClose={() => { setShowSummary(false); router.push("/workouts"); }}
        />
      )}

      <style>{`
        .numpad-key:active { transform: scale(0.95); background: rgba(255,255,255,0.06) !important; }
        .set-log-btn:active { transform: scale(0.97); }
        .set-undo-btn:hover { background: rgba(255,255,255,0.05) !important; color: var(--ink-3) !important; }
        .jump-pill:hover { background: rgba(255,255,255,0.06) !important; border-color: var(--line-hi) !important; }
        @media (max-width: 480px) {
          .active-session-header { flex-wrap: wrap; gap: 8px; }
          .active-session-header > div:last-child { width: 100%; justify-content: flex-end; }
        }
      `}</style>
    </div>
  );
}
