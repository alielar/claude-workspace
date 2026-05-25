"use client";

import { use, useEffect, useRef, useState, useCallback, useMemo } from "react";
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

// ─── Flat set for step-by-step navigation ─────────────────────────────────────

interface FlatSet {
  globalIndex: number;
  exerciseIndex: number;
  setIndex: number;
  exercise: WorkoutExercise;
  config: SetConfig;
  prefill: PrefillSet | null;
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

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
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
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: "var(--ink-4)", letterSpacing: "0.14em", textTransform: "uppercase" as const, marginBottom: 8 }}>
            {label}
          </div>
          <div style={{ fontSize: 42, fontFamily: "var(--f-mono)", fontWeight: 300, color: "var(--ink)", minHeight: 50 }}>
            {input || "0"}
            {unit && <span style={{ fontSize: 18, color: "var(--ink-4)", marginLeft: 4 }}>{unit}</span>}
          </div>
        </div>
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
            className="stepper-btn"
            style={{
              width: 50, height: 50, borderRadius: 12, border: "1.5px solid var(--line-hi)",
              background: disabled ? "transparent" : "rgba(255,255,255,0.05)", color: "var(--ink)",
              cursor: disabled ? "default" : "pointer", fontSize: 24, fontWeight: 300, flexShrink: 0,
              opacity: disabled ? 0.35 : 1, display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >−</button>
          <button
            onClick={() => !disabled && setShowPad(true)}
            disabled={disabled}
            aria-label={`Edit ${label} value`}
            style={{
              minWidth: 90, padding: "10px 14px", borderRadius: 12,
              background: disabled ? "transparent" : "rgba(255,255,255,0.06)",
              border: `1.5px solid ${disabled ? "transparent" : "rgba(124,77,255,0.30)"}`,
              cursor: disabled ? "default" : "pointer", textAlign: "center",
              boxShadow: disabled ? "none" : "0 0 8px rgba(124,77,255,0.08)",
            }}
          >
            <div style={{
              fontSize: 28, fontFamily: "var(--f-mono)", fontWeight: 500,
              color: disabled ? "var(--ink-3)" : "#fff",
            }}>
              {value || "0"}
            </div>
            {unit && <div style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 2, letterSpacing: "0.06em" }}>{unit}</div>}
          </button>
          <button
            onClick={() => nudge(1)}
            disabled={disabled}
            aria-label={`Increase ${label}`}
            className="stepper-btn"
            style={{
              width: 50, height: 50, borderRadius: 12, border: "1.5px solid var(--line-hi)",
              background: disabled ? "transparent" : "rgba(255,255,255,0.05)", color: "var(--ink)",
              cursor: disabled ? "default" : "pointer", fontSize: 24, fontWeight: 300, flexShrink: 0,
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
          <div className="title">Session complete</div>
        </div>
        <div className="cc-card-body">
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

// ─── Current Set View ────────────────────────────────────────────────────────

interface CurrentSetViewProps {
  flatSet: FlatSet;
  logged: LoggedSet | null;
  prMap: Record<number, number>;
  onLog: (data: { setType: string; weightKg: number | null; reps: number | null; durationSeconds?: number | null }) => void;
  onUndo: () => void;
}

function CurrentSetView({ flatSet, logged, prMap, onLog, onUndo }: CurrentSetViewProps) {
  const { exercise, config, prefill, setIndex } = flatSet;

  const initialWeight   = logged?.weightKg?.toString()       ?? prefill?.weightKg?.toString() ?? "";
  const initialReps     = logged?.reps?.toString()           ?? prefill?.reps?.toString()     ?? config.repMax.toString();
  const initialDuration = logged?.durationSeconds?.toString() ?? "";

  const [weight,   setWeight]   = useState(initialWeight);
  const [reps,     setReps]     = useState(initialReps);
  const [duration, setDuration] = useState(initialDuration);
  const [setType,  setSetType]  = useState<string>(logged?.setType ?? config.type);

  // Reset inputs when navigating to a different set
  const prevGlobalIndex = useRef(flatSet.globalIndex);
  useEffect(() => {
    if (prevGlobalIndex.current !== flatSet.globalIndex) {
      prevGlobalIndex.current = flatSet.globalIndex;
      setWeight(logged?.weightKg?.toString() ?? prefill?.weightKg?.toString() ?? "");
      setReps(logged?.reps?.toString() ?? prefill?.reps?.toString() ?? config.repMax.toString());
      setDuration(logged?.durationSeconds?.toString() ?? "");
      setSetType(logged?.setType ?? config.type);
    }
  }, [flatSet.globalIndex, logged, prefill, config]);

  // Reset on undo
  const prevLogged = useRef(logged);
  useEffect(() => {
    if (prevLogged.current !== null && logged === null) {
      setWeight(prefill?.weightKg?.toString() ?? "");
      setReps(prefill?.reps?.toString() ?? config.repMax.toString());
    }
    prevLogged.current = logged;
  }, [logged, prefill, config]);

  const needsWeight   = exercise.trackingType === "reps_weight" || exercise.trackingType === "time_weight";
  const needsReps     = exercise.trackingType === "reps_weight" || exercise.trackingType === "reps_only";
  const needsDuration = exercise.trackingType === "time_weight" || exercise.trackingType === "time_only";
  const needsDist     = exercise.trackingType === "distance";

  const isDone = !!logged;
  const currentPr = prMap[exercise.exerciseId] ?? 0;
  const w = parseFloat(weight);
  const r = parseInt(reps);
  const estimated1rm = !isNaN(w) && !isNaN(r) && r > 0 ? w * (1 + r / 30) : null;
  const isPr = estimated1rm !== null && estimated1rm > currentPr && currentPr > 0;

  const typeColor = SET_TYPE_COLOR[setType] ?? "var(--ink-4)";

  function handleLog() {
    const weightKg  = needsWeight  ? (parseFloat(weight) || null)    : null;
    const repsVal   = parseInt(reps, 10);
    const durVal    = needsDuration ? (parseInt(duration, 10) || null) : null;
    const distVal   = needsDist     ? (parseFloat(duration) || null)   : null;
    onLog({
      setType,
      weightKg,
      reps:            needsReps ? (!isNaN(repsVal) ? repsVal : null) : null,
      durationSeconds: durVal ?? (distVal ? Math.round(distVal * 1000) : null),
    });
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "0 16px", flex: 1, justifyContent: "center", minHeight: 0,
    }}>
      {/* Exercise name */}
      <div style={{ textAlign: "center", marginBottom: 6 }}>
        <div style={{
          fontSize: 18, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.02em",
          lineHeight: 1.25, maxWidth: "85vw",
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}>
          {exercise.name}
        </div>
        <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 3 }}>
          {[exercise.primaryMuscle, exercise.equipment].filter(Boolean).join(" · ")}
        </div>
      </div>

      {/* Set badge */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, marginBottom: 16,
      }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "5px 12px", borderRadius: 8,
          background: isDone ? "rgba(111,212,154,0.08)" : `${typeColor}11`,
          border: `1px solid ${isDone ? "rgba(111,212,154,0.25)" : `${typeColor}33`}`,
        }}>
          <span style={{
            fontSize: 11, fontFamily: "var(--f-mono)", fontWeight: 600,
            color: isDone ? "var(--pos)" : typeColor,
            letterSpacing: "0.06em",
          }}>
            {isDone ? "✓ " : ""}SET {setIndex + 1} / {exercise.setConfig.length}
          </span>
        </div>
        <select
          value={setType}
          onChange={(e) => setSetType(e.target.value)}
          disabled={isDone}
          style={{
            background: "transparent", border: "none", color: typeColor,
            fontSize: 10, fontFamily: "var(--f-mono)", fontWeight: 600, letterSpacing: "0.08em",
            cursor: isDone ? "default" : "pointer", textTransform: "uppercase" as const, outline: "none",
          }}
        >
          {Object.entries(SET_TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        {isPr && !isDone && (
          <span style={{
            fontSize: 9.5, fontFamily: "var(--f-mono)", fontWeight: 700, letterSpacing: "0.10em",
            color: "var(--warn)", background: "rgba(255,193,92,0.15)", padding: "3px 8px", borderRadius: 4,
          }}>
            PR
          </span>
        )}
      </div>

      {/* PR context */}
      {currentPr > 0 && (
        <div style={{
          fontSize: 10, color: "var(--ink-4)", marginBottom: 10, padding: "4px 12px",
          background: "rgba(124,77,255,0.05)", borderRadius: 6, border: "1px solid rgba(124,77,255,0.12)",
        }}>
          PR: <span style={{ color: "var(--violet)", fontFamily: "var(--f-mono)" }}>est. {currentPr.toFixed(1)} kg 1RM</span>
        </div>
      )}

      {/* Target + last session hint */}
      <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
        <span style={{ fontSize: 11, color: "var(--ink-5)", fontFamily: "var(--f-mono)" }}>
          Target: {config.repMin}–{config.repMax} reps
        </span>
        {prefill && (
          <span style={{ fontSize: 11, color: "var(--ink-5)" }}>
            Last: <span style={{ color: "var(--ink-3)", fontFamily: "var(--f-mono)" }}>
              {prefill.weightKg ?? "–"}kg × {prefill.reps ?? "–"}
            </span>
          </span>
        )}
      </div>

      {/* Steppers */}
      <div style={{
        display: "flex", gap: 20, justifyContent: "center", marginBottom: 20,
        flexWrap: "wrap",
      }}>
        {needsWeight && (
          <Stepper label="Weight" value={weight} onChange={setWeight}
            step={exercise.weightIncrement || 2.5} unit="kg" disabled={isDone} allowDecimal />
        )}
        {needsDuration && (
          <Stepper label="Duration" value={duration} onChange={setDuration}
            step={5} unit="sec" disabled={isDone} min={0} hint="seconds" allowDecimal={false} />
        )}
        {needsDist && (
          <Stepper label="Distance" value={duration} onChange={setDuration}
            step={0.1} unit="km" disabled={isDone} min={0} allowDecimal />
        )}
        {needsReps && (
          <Stepper label="Reps" value={reps} onChange={setReps}
            step={1} unit="reps" disabled={isDone}
            hint={`${config.repMin}–${config.repMax}`} allowDecimal={false} />
        )}
      </div>

      {/* Progression indicator */}
      {prefill && !isDone && w > (prefill.weightKg ?? 0) && (
        <div style={{
          fontSize: 12, fontFamily: "var(--f-mono)", color: "var(--pos)", fontWeight: 600,
          marginBottom: 16,
        }}>
          +{(w - (prefill.weightKg ?? 0)).toFixed(1)}kg from last session
        </div>
      )}

      {/* Action button */}
      {isDone ? (
        <button
          onClick={onUndo}
          className="set-undo-btn"
          style={{
            width: "100%", maxWidth: 360, padding: "14px 0", borderRadius: 12,
            background: "rgba(255,255,255,0.03)", border: "1px solid var(--line)",
            color: "var(--ink-4)", fontSize: 13, fontFamily: "var(--f-mono)", cursor: "pointer",
            letterSpacing: "0.06em", transition: "background 0.15s var(--easeOut), color 0.15s var(--easeOut)",
          }}
        >
          Undo this set
        </button>
      ) : (
        <button
          onClick={handleLog}
          className="set-log-btn"
          style={{
            width: "100%", maxWidth: 360, padding: "16px 0", borderRadius: 12,
            background: isPr ? "linear-gradient(135deg, var(--warn), #FF8800)" : "var(--violet)", border: "none",
            color: "#fff", fontSize: 17, fontWeight: 700, cursor: "pointer",
            letterSpacing: "0.01em",
            boxShadow: isPr ? "0 0 24px rgba(255,193,92,0.30)" : "0 0 18px rgba(124,77,255,0.25)",
            transition: "transform 0.1s var(--easeOut), box-shadow 0.15s var(--easeOut)",
          }}
        >
          {isPr ? "Log PR Set" : `Log Set ${setIndex + 1}`}
        </button>
      )}
    </div>
  );
}

// ─── Reorder Modal ───────────────────────────────────────────────────────────

function ReorderModal({
  exercises,
  order,
  onReorder,
  onClose,
}: {
  exercises: WorkoutExercise[];
  order: number[];
  onReorder: (newOrder: number[]) => void;
  onClose: () => void;
}) {
  const [localOrder, setLocalOrder] = useState(order);

  function moveUp(idx: number) {
    if (idx === 0) return;
    setLocalOrder((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }

  function moveDown(idx: number) {
    if (idx >= localOrder.length - 1) return;
    setLocalOrder((prev) => {
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Reorder exercises"
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 250,
        padding: "0 16px",
      }}
    >
      <div className="cc-card" style={{ width: "min(380px, 100vw - 32px)", maxHeight: "80vh", overflow: "auto" }}>
        <div className="cc-card-head">
          <div className="title">Reorder exercises</div>
        </div>
        <div className="cc-card-body" style={{ padding: "12px 16px" }}>
          {localOrder.map((exIdx, pos) => {
            const ex = exercises[exIdx];
            return (
              <div
                key={ex.exerciseId}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 8px",
                  borderBottom: pos < localOrder.length - 1 ? "1px solid var(--line)" : "none",
                }}
              >
                <span style={{
                  width: 22, height: 22, borderRadius: 6,
                  background: "rgba(124,77,255,0.10)", border: "1px solid rgba(124,77,255,0.25)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontFamily: "var(--f-mono)", color: "var(--violet)", fontWeight: 600, flexShrink: 0,
                }}>
                  {pos + 1}
                </span>
                <span style={{ flex: 1, fontSize: 13, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {ex.name}
                </span>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button
                    onClick={() => moveUp(pos)}
                    disabled={pos === 0}
                    style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: pos === 0 ? "transparent" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${pos === 0 ? "transparent" : "var(--line)"}`,
                      color: pos === 0 ? "var(--ink-5)" : "var(--ink-2)",
                      fontSize: 16, cursor: pos === 0 ? "default" : "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >↑</button>
                  <button
                    onClick={() => moveDown(pos)}
                    disabled={pos >= localOrder.length - 1}
                    style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: pos >= localOrder.length - 1 ? "transparent" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${pos >= localOrder.length - 1 ? "transparent" : "var(--line)"}`,
                      color: pos >= localOrder.length - 1 ? "var(--ink-5)" : "var(--ink-2)",
                      fontSize: 16, cursor: pos >= localOrder.length - 1 ? "default" : "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >↓</button>
                </div>
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button onClick={onClose} className="cc-btn" style={{ flex: 1, padding: "10px 0", fontSize: 13 }}>
              Cancel
            </button>
            <button
              onClick={() => { onReorder(localOrder); onClose(); }}
              className="cc-btn-primary"
              style={{ flex: 1, padding: "10px 0", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            >
              Apply
            </button>
          </div>
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
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [viewIndex, setViewIndex] = useState(0); // which flat set we're viewing
  const [exerciseOrder, setExerciseOrder] = useState<number[]>([]); // exercise reorder
  const [showReorder, setShowReorder] = useState(false);

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
        setExerciseOrder(d.exercises.map((_, i) => i));
        // Start at first unlogged set
        const allSets = d.exercises.flatMap((ex) =>
          ex.setConfig.map((_, si) => ({ exerciseId: ex.exerciseId, setIndex: si }))
        );
        const firstUnlogged = allSets.findIndex((s) =>
          !(d.loggedSets ?? []).find((l) => l.exerciseId === s.exerciseId && l.setNumber === s.setIndex + 1)
        );
        if (firstUnlogged >= 0) setViewIndex(firstUnlogged);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load session");
      } finally {
        setLoading(false);
      }
    })();
  }, [sid]);

  // Flatten all sets into a linear sequence (respecting exercise reorder)
  const allSets: FlatSet[] = useMemo(() => {
    if (!data || exerciseOrder.length === 0) return [];
    let idx = 0;
    const orderedExercises = exerciseOrder.map((oi) => ({ ex: data.exercises[oi], originalIndex: oi }));
    return orderedExercises.flatMap(({ ex, originalIndex }) =>
      ex.setConfig.map((cfg, si) => ({
        globalIndex: idx++,
        exerciseIndex: originalIndex,
        setIndex: si,
        exercise: ex,
        config: cfg,
        prefill: (data.prefillMap[ex.exerciseId] ?? [])[si] ?? null,
      }))
    );
  }, [data, exerciseOrder]);

  // Find first unlogged set index
  const firstUnloggedIdx = useMemo(() => {
    return allSets.findIndex((s) =>
      !loggedSets.find((l) => l.exerciseId === s.exercise.exerciseId && l.setNumber === s.setIndex + 1)
    );
  }, [allSets, loggedSets]);

  const currentFlat = allSets[viewIndex] ?? null;

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
      // Auto-advance to next set after logging
      if (viewIndex < allSets.length - 1) {
        // Find next unlogged set from current position
        const nextUnlogged = allSets.findIndex((s, i) =>
          i > viewIndex &&
          !loggedSets.find((l) => l.exerciseId === s.exercise.exerciseId && l.setNumber === s.setIndex + 1) &&
          !(s.exercise.exerciseId === exerciseId && s.setIndex + 1 === setNumber) // exclude just-logged
        );
        if (nextUnlogged >= 0) {
          setTimeout(() => setViewIndex(nextUnlogged), 100);
        }
      }
      if (restS > 0 && setData.setType !== "warmup") {
        setRestTimer({ seconds: restS });
      }
    }
  }, [sid, viewIndex, allSets, loggedSets]);

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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "80vh" }}>
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

  const totalConfigSets = allSets.length;
  const doneSets = loggedSets.length;
  const progressPct = totalConfigSets > 0 ? (doneSets / totalConfigSets) * 100 : 0;
  const allDone = doneSets >= totalConfigSets && totalConfigSets > 0;

  // Current logged set for the viewed flat set
  const currentLogged = currentFlat
    ? loggedSets.find((l) => l.exerciseId === currentFlat.exercise.exerciseId && l.setNumber === currentFlat.setIndex + 1) ?? null
    : null;

  // Build exercise-level progress for the dot navigator (respecting order)
  const exerciseProgress = exerciseOrder.map((oi) => {
    const ex = data.exercises[oi];
    const sets = ex.setConfig.length;
    const done = loggedSets.filter((l) => l.exerciseId === ex.exerciseId).length;
    return { name: ex.name, exerciseId: ex.exerciseId, sets, done, allDone: done >= sets, originalIndex: oi };
  });

  return (
    <div style={{
      maxWidth: 480, margin: "0 auto",
      display: "flex", flexDirection: "column",
      height: "100dvh", overflow: "hidden",
    }}>

      {/* ── Sticky top bar ───────────────────────────────────────────────── */}
      <div style={{
        padding: "12px 16px 0", flexShrink: 0,
        borderBottom: "1px solid var(--line)",
        background: "var(--bg)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0, letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {data.session.workoutName}<span className="grad-text">.</span>
            </h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <div style={{
              padding: "4px 10px", borderRadius: 6, background: "rgba(255,255,255,0.04)", border: "1px solid var(--line)",
              fontFamily: "var(--f-mono)", fontSize: 15, fontWeight: 500,
              color: elapsed > 5400 ? "var(--warn)" : "var(--ink-2)",
            }}>
              {elapsedMin}:{elapsedSec.toString().padStart(2, "0")}
            </div>
            {doneSets > 0 ? (
              <button onClick={handleFinish} disabled={finishing} className="cc-btn-primary" style={{
                padding: "8px 16px", borderRadius: 8,
                fontSize: 13, fontWeight: 700, cursor: finishing ? "wait" : "pointer",
              }}>
                {finishing ? "…" : "Finish"}
              </button>
            ) : (
              <button
                onClick={() => setDiscardConfirm(true)}
                style={{
                  padding: "8px 16px", borderRadius: 8,
                  background: "transparent", border: "1px solid var(--neg)",
                  color: "var(--neg)", fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >
                Discard
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ paddingBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "var(--f-mono)" }}>
              {doneSets} / {totalConfigSets} sets
            </span>
            <span style={{ fontSize: 10, color: allDone ? "var(--pos)" : "var(--ink-4)" }}>
              {Math.round(progressPct)}%
            </span>
          </div>
          <div style={{ height: 3, background: "var(--line)", borderRadius: 99, overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${progressPct}%`,
              background: allDone ? "var(--pos)" : "var(--grad)",
              borderRadius: 99, transition: "width 0.3s, background 0.3s",
            }} />
          </div>
        </div>
      </div>

      {/* ── Exercise dot navigator ─────────────────────────────────────── */}
      <div style={{
        padding: "8px 16px", flexShrink: 0,
        display: "flex", gap: 4, overflowX: "auto", alignItems: "center",
        borderBottom: "1px solid var(--line)",
        background: "var(--bg)",
      }}>
        <button
          onClick={() => setShowReorder(true)}
          title="Reorder exercises"
          style={{
            width: 28, height: 28, borderRadius: 7, flexShrink: 0,
            background: "rgba(255,255,255,0.04)", border: "1px solid var(--line)",
            color: "var(--ink-4)", fontSize: 13, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            marginRight: 4,
          }}
        >⇅</button>
        {exerciseProgress.map((ep) => {
          const firstIdx = allSets.findIndex((s) => s.exerciseIndex === ep.originalIndex);
          const isActive = currentFlat?.exerciseIndex === ep.originalIndex;
          return (
            <button
              key={ep.exerciseId}
              onClick={() => firstIdx >= 0 && setViewIndex(firstIdx)}
              className="ex-nav-pill"
              style={{
                flexShrink: 0, padding: "4px 10px", borderRadius: 6,
                fontSize: 10, fontFamily: "var(--f-mono)", letterSpacing: "0.02em",
                border: `1px solid ${ep.allDone ? "rgba(111,212,154,0.30)" : isActive ? "var(--violet)" : "var(--line)"}`,
                background: ep.allDone ? "rgba(111,212,154,0.06)" : isActive ? "rgba(124,77,255,0.10)" : "transparent",
                color: ep.allDone ? "var(--pos)" : isActive ? "var(--violet)" : "var(--ink-4)",
                cursor: "pointer", whiteSpace: "nowrap",
                transition: "all 0.15s var(--easeOut)",
              }}
            >
              {ep.allDone ? "✓ " : ""}{ep.name.length > 12 ? ep.name.slice(0, 12) + "…" : ep.name}
              <span style={{ marginLeft: 4, opacity: 0.6 }}>{ep.done}/{ep.sets}</span>
            </button>
          );
        })}
      </div>

      {/* ── Main set view ──────────────────────────────────────────────── */}
      {currentFlat ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", overflow: "hidden", padding: "8px 0" }}>
            <CurrentSetView
              flatSet={currentFlat}
              logged={currentLogged}
              prMap={data.prMap}
              onLog={(setData) => {
                const myLogged = loggedSets.filter((s) => s.exerciseId === currentFlat.exercise.exerciseId);
                handleLogSet(
                  currentFlat.exercise.exerciseId,
                  currentFlat.exercise.name,
                  setData,
                  currentFlat.config.restS,
                  currentFlat.setIndex + 1,
                );
              }}
              onUndo={() => currentLogged && handleUndoSet(currentLogged.id)}
            />
          </div>

          {/* ── Bottom navigation ────────────────────────────────────────── */}
          <div style={{
            padding: "10px 16px", flexShrink: 0,
            borderTop: "1px solid var(--line)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "var(--bg)",
          }}>
            <button
              onClick={() => setViewIndex((i) => Math.max(0, i - 1))}
              disabled={viewIndex === 0}
              className="nav-arrow"
              style={{
                padding: "10px 20px", borderRadius: 10,
                background: viewIndex === 0 ? "transparent" : "rgba(255,255,255,0.03)",
                border: `1px solid ${viewIndex === 0 ? "transparent" : "var(--line)"}`,
                color: viewIndex === 0 ? "var(--ink-5)" : "var(--ink-2)",
                fontSize: 14, cursor: viewIndex === 0 ? "default" : "pointer",
                transition: "all 0.15s var(--easeOut)",
              }}
            >
              ← Prev
            </button>

            {/* Set dots for current exercise */}
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {currentFlat.exercise.setConfig.map((_, si) => {
                const globalIdx = allSets.findIndex(
                  (s) => s.exerciseIndex === currentFlat.exerciseIndex && s.setIndex === si
                );
                const isLogged = !!loggedSets.find(
                  (l) => l.exerciseId === currentFlat.exercise.exerciseId && l.setNumber === si + 1
                );
                const isCurrent = globalIdx === viewIndex;
                return (
                  <button
                    key={si}
                    onClick={() => globalIdx >= 0 && setViewIndex(globalIdx)}
                    style={{
                      width: isCurrent ? 20 : 8,
                      height: 8,
                      borderRadius: 99,
                      background: isLogged ? "var(--pos)" : isCurrent ? "var(--violet)" : "var(--line-hi)",
                      border: "none",
                      cursor: "pointer",
                      transition: "all 0.2s var(--easeOut)",
                      padding: 0,
                    }}
                    aria-label={`Set ${si + 1}`}
                  />
                );
              })}
            </div>

            <button
              onClick={() => setViewIndex((i) => Math.min(allSets.length - 1, i + 1))}
              disabled={viewIndex >= allSets.length - 1}
              className="nav-arrow"
              style={{
                padding: "10px 20px", borderRadius: 10,
                background: viewIndex >= allSets.length - 1 ? "transparent" : "rgba(255,255,255,0.03)",
                border: `1px solid ${viewIndex >= allSets.length - 1 ? "transparent" : "var(--line)"}`,
                color: viewIndex >= allSets.length - 1 ? "var(--ink-5)" : "var(--ink-2)",
                fontSize: 14, cursor: viewIndex >= allSets.length - 1 ? "default" : "pointer",
                transition: "all 0.15s var(--easeOut)",
              }}
            >
              Next →
            </button>
          </div>

          {/* Safe bottom spacing */}
          <div style={{ height: "env(safe-area-inset-bottom, 8px)", flexShrink: 0 }} />
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 14, color: "var(--ink-3)", marginBottom: 16 }}>No exercises in this session</div>
            <Link href="/workouts" className="cc-btn">← Back</Link>
          </div>
        </div>
      )}

      {/* ── Reorder modal ──────────────────────────────────────────────── */}
      {showReorder && data && (
        <ReorderModal
          exercises={data.exercises}
          order={exerciseOrder}
          onReorder={(newOrder) => {
            setExerciseOrder(newOrder);
            setViewIndex(0); // Reset to first set of new order
          }}
          onClose={() => setShowReorder(false)}
        />
      )}

      {/* ── Log error toast ─────────────────────────────────────────────── */}
      {logError && (
        <div style={{
          position: "fixed", bottom: 100, left: "50%", transform: "translateX(-50%)", zIndex: 100,
          padding: "10px 20px", borderRadius: 10,
          background: "rgba(255,100,100,0.15)", border: "1px solid var(--neg)",
          color: "var(--neg)", fontSize: 12, fontWeight: 600,
          boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
        }}>
          {logError}
        </div>
      )}

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
        .ex-nav-pill:hover { background: rgba(255,255,255,0.06) !important; }
        .nav-arrow:hover:not(:disabled) { background: rgba(255,255,255,0.06) !important; border-color: var(--line-hi) !important; }
        .stepper-btn:active:not(:disabled) { transform: scale(0.94); background: rgba(124,77,255,0.12) !important; }
      `}</style>
    </div>
  );
}
