"use client";

import { use, useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SetConfig {
  type: "standard" | "warmup" | "drop" | "failure";
  repMin: number;
  repMax: number;
  rir: number;
  restS: number;
}

interface TemplateExercise {
  planExerciseId: number;
  exerciseId: number;
  name: string;
  primaryMuscle: string | null;
  equipment: string | null;
  weightIncrement: number;
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
  rir: number | null;
  durationSeconds: number | null;
}

interface PrefillSet {
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
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
  exercises: TemplateExercise[];
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
    if (remaining <= 0) { onDoneRef.current(); return; }
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining]);

  const pct = ((seconds - remaining) / seconds) * 100;
  const min = Math.floor(remaining / 60);
  const sec = remaining % 60;
  const urgent = remaining <= 10;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.80)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
    }}>
      <div className="cc-card" style={{ width: 300, padding: "36px 32px", textAlign: "center" }}>
        <div style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "var(--f-mono)", letterSpacing: "0.14em", marginBottom: 20 }}>
          REST TIMER
        </div>
        <div style={{
          fontSize: 72, fontWeight: 200, fontFamily: "var(--f-mono)", lineHeight: 1,
          color: urgent ? "var(--warn)" : "var(--ink)",
          transition: "color 0.3s",
        }}>
          {min}:{sec.toString().padStart(2, "0")}
        </div>
        <div style={{ marginTop: 24, height: 3, background: "var(--line)", borderRadius: 99, overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${pct}%`,
            background: urgent ? "var(--warn)" : "var(--violet)",
            borderRadius: 99, transition: "width 1s linear, background 0.3s",
          }} />
        </div>
        <button
          onClick={() => onDoneRef.current()}
          className="cc-btn"
          style={{ marginTop: 24, width: "100%", padding: "10px 0" }}
        >
          Skip rest →
        </button>
      </div>
    </div>
  );
}

// ─── Number stepper ───────────────────────────────────────────────────────────

function Stepper({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  unit = "",
  disabled = false,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step?: number;
  min?: number;
  unit?: string;
  disabled?: boolean;
  hint?: string;
}) {
  function nudge(delta: number) {
    const cur = parseFloat(value) || 0;
    const next = Math.max(min, Math.round((cur + delta * step) * 100) / 100);
    onChange(next.toString());
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: "var(--ink-4)", fontWeight: 500 }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={() => nudge(-1)}
          disabled={disabled}
          style={{
            width: 40, height: 40, borderRadius: 8, border: "1px solid var(--line)",
            background: disabled ? "transparent" : "var(--bg-input)", color: "var(--ink-2)",
            cursor: disabled ? "default" : "pointer", fontSize: 18, flexShrink: 0,
            opacity: disabled ? 0.35 : 1, display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >−</button>
        <div style={{ textAlign: "center", minWidth: 64 }}>
          <input
            type="number"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            style={{
              width: "100%", background: disabled ? "transparent" : "var(--bg-input)",
              border: `1px solid ${disabled ? "transparent" : "var(--line)"}`,
              borderRadius: 8, padding: "8px 4px", color: disabled ? "var(--ink-3)" : "var(--ink)",
              fontSize: 20, fontFamily: "var(--f-mono)", fontWeight: 400,
              textAlign: "center", outline: "none",
            }}
          />
          {unit && <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 2, letterSpacing: "0.06em" }}>{unit}</div>}
        </div>
        <button
          onClick={() => nudge(1)}
          disabled={disabled}
          style={{
            width: 40, height: 40, borderRadius: 8, border: "1px solid var(--line)",
            background: disabled ? "transparent" : "var(--bg-input)", color: "var(--ink-2)",
            cursor: disabled ? "default" : "pointer", fontSize: 18, flexShrink: 0,
            opacity: disabled ? 0.35 : 1, display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >+</button>
      </div>
      {hint && (
        <div style={{ fontSize: 10, color: "var(--ink-5)", letterSpacing: "0.04em" }}>{hint}</div>
      )}
    </div>
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
  onLog: (data: { setType: string; weightKg: number | null; reps: number | null; rir: number | null }) => void;
  onUndo: () => void;
}

function SetCard({ setIndex, config, prefill, logged, currentPr1rm, weightIncrement, onLog, onUndo }: SetCardProps) {
  const initialWeight = logged?.weightKg?.toString() ?? prefill?.weightKg?.toString() ?? "";
  const initialReps   = logged?.reps?.toString()    ?? prefill?.reps?.toString()    ?? config.repMax.toString();
  const initialRir    = logged?.rir?.toString()     ?? prefill?.rir?.toString()     ?? config.rir.toString();

  const [weight, setWeight] = useState(initialWeight);
  const [reps,   setReps]   = useState(initialReps);
  const [rir,    setRir]    = useState(initialRir);
  const [setType, setSetType] = useState<string>(logged?.setType ?? config.type);

  // Reset inputs when "undo" clears the logged prop
  const prevLogged = useRef(logged);
  useEffect(() => {
    if (prevLogged.current !== null && logged === null) {
      // Set was undone — restore to prefill
      setWeight(prefill?.weightKg?.toString() ?? initialWeight);
      setReps(prefill?.reps?.toString() ?? initialReps);
      setRir(prefill?.rir?.toString() ?? initialRir);
    }
    prevLogged.current = logged;
  }, [logged]); // eslint-disable-line react-hooks/exhaustive-deps

  const isDone = !!logged;

  const w = parseFloat(weight);
  const r = parseInt(reps);
  const estimated1rm = !isNaN(w) && !isNaN(r) && r > 0 ? w * (1 + r / 30) : null;
  const isPr = estimated1rm !== null && estimated1rm > currentPr1rm && currentPr1rm > 0;

  function handleLog() {
    const weightKg = parseFloat(weight) || null;
    const repsVal  = parseInt(reps, 10);
    const rirVal   = parseInt(rir, 10);
    onLog({
      setType,
      weightKg,
      reps: !isNaN(repsVal) ? repsVal : null,
      rir:  !isNaN(rirVal)  ? rirVal  : null,
    });
  }

  const typeColor = SET_TYPE_COLOR[setType] ?? "var(--ink-4)";

  return (
    <div style={{
      borderRadius: 12, border: `1px solid ${isDone ? "rgba(111,212,154,0.30)" : "var(--line)"}`,
      background: isDone ? "rgba(111,212,154,0.04)" : "rgba(255,255,255,0.015)",
      padding: "16px 20px", marginBottom: 10, transition: "all 0.2s",
    }}>
      {/* Set header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6, background: `${typeColor}22`,
            border: `1px solid ${typeColor}55`, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 700, fontFamily: "var(--f-mono)", color: typeColor,
          }}>
            {setIndex + 1}
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
            target {config.repMin}–{config.repMax} reps · RIR {config.rir}
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

      {/* Last session hint */}
      {prefill && !isDone && (
        <div style={{ fontSize: 11, color: "var(--ink-5)", marginBottom: 14, letterSpacing: "0.02em" }}>
          Last session: <span style={{ color: "var(--ink-3)", fontFamily: "var(--f-mono)" }}>
            {prefill.weightKg ?? "—"}kg × {prefill.reps ?? "—"} reps
            {prefill.rir !== null ? ` · ${prefill.rir} RIR` : ""}
          </span>
        </div>
      )}

      {/* Steppers */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
        <Stepper
          label="Weight"
          value={weight}
          onChange={setWeight}
          step={weightIncrement}
          unit="kg"
          disabled={isDone}
          hint={prefill?.weightKg ? `last: ${prefill.weightKg}kg` : undefined}
        />
        <Stepper
          label="Reps"
          value={reps}
          onChange={setReps}
          step={1}
          unit="reps"
          disabled={isDone}
          hint={`${config.repMin}–${config.repMax}`}
        />
        <Stepper
          label="RIR"
          value={rir}
          onChange={setRir}
          step={1}
          unit="in tank"
          disabled={isDone}
          hint={`target: ${config.rir}`}
        />
      </div>

      {/* Action button */}
      {isDone ? (
        <button
          onClick={onUndo}
          style={{
            width: "100%", padding: "10px 0", borderRadius: 8,
            background: "rgba(255,255,255,0.04)", border: "1px solid var(--line)",
            color: "var(--ink-4)", fontSize: 12, fontFamily: "var(--f-mono)", cursor: "pointer",
            letterSpacing: "0.06em",
          }}
        >
          undo set
        </button>
      ) : (
        <button
          onClick={handleLog}
          style={{
            width: "100%", padding: "12px 0", borderRadius: 8,
            background: "var(--violet)", border: "none",
            color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer",
            letterSpacing: "0.01em",
          }}
        >
          ✓ Log set {setIndex + 1}
        </button>
      )}
    </div>
  );
}

// ─── Exercise block ───────────────────────────────────────────────────────────

interface ExerciseBlockProps {
  exercise: TemplateExercise;
  loggedSets: LoggedSet[];
  prefill: PrefillSet[];
  prMap: Record<number, number>;
  onLogSet: (exerciseId: number, exerciseName: string, data: {
    setType: string; weightKg: number | null; reps: number | null; rir: number | null;
  }, restS: number) => void;
  onUndoSet: (setId: number) => void;
}

function ExerciseBlock({ exercise, loggedSets, prefill, prMap, onLogSet, onUndoSet }: ExerciseBlockProps) {
  const [collapsed, setCollapsed] = useState(false);
  const currentPr = prMap[exercise.exerciseId] ?? 0;
  const mySets = loggedSets.filter((s) => s.exerciseId === exercise.exerciseId);
  const totalSets = exercise.setConfig.length;
  const doneSets = mySets.length;
  const allDone = doneSets >= totalSets && doneSets > 0;

  return (
    <div className="cc-card" style={{ marginBottom: 14 }}>
      {/* Exercise header — clickable to collapse */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        style={{
          width: "100%", background: "none", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 16px", borderBottom: collapsed ? "none" : "1px solid var(--line)",
        }}
      >
        <div style={{ textAlign: "left" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: allDone ? "var(--pos)" : "var(--ink)" }}>
            {allDone && <span style={{ marginRight: 6 }}>✓</span>}
            {exercise.name}
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2 }}>
            {[exercise.primaryMuscle, exercise.equipment].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
            <div style={{ fontSize: 11, color: "var(--ink-4)", marginBottom: 14, padding: "8px 12px", background: "rgba(179,136,255,0.06)", borderRadius: 8, borderLeft: "2px solid var(--violet)" }}>
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
                onLog={(data) => onLogSet(exercise.exerciseId, exercise.name, data, cfg.restS)}
                onUndo={() => loggedSet && onUndoSet(loggedSet.id)}
              />
            );
          })}
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
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300,
      padding: "0 16px",
    }}>
      <div className="cc-card" style={{ width: "100%", maxWidth: 440, maxHeight: "88vh", overflow: "auto" }}>
        <div className="cc-card-head">
          <div className="title">Session complete 🎉</div>
        </div>
        <div className="cc-card-body">
          {/* Stats hero */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0,
            background: "rgba(179,136,255,0.06)", borderRadius: 12, overflow: "hidden",
            border: "1px solid rgba(179,136,255,0.15)", marginBottom: 20,
          }}>
            {[
              { value: totalSets, label: "sets" },
              { value: `${Math.round(totalVolume).toLocaleString()} kg`, label: "volume" },
              { value: `${min}:${sec.toString().padStart(2, "0")}`, label: "time" },
            ].map((stat, i) => (
              <div key={stat.label} style={{
                padding: "18px 12px", textAlign: "center",
                borderRight: i < 2 ? "1px solid rgba(179,136,255,0.15)" : "none",
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
                    borderLeft: `2px solid ${SUGGESTION_COLOR[s.action] ?? "var(--line)"}`,
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

          <button onClick={onClose} style={{
            width: "100%", padding: "13px 0", borderRadius: 10,
            background: "var(--grad)", color: "#0A0A14",
            fontWeight: 700, fontSize: 15, border: "none", cursor: "pointer", letterSpacing: "-0.01em",
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
    fetch(`/api/workouts/session/${sid}`)
      .then((r) => {
        if (!r.ok) throw new Error("Session not found");
        return r.json();
      })
      .then((d: SessionData) => {
        setData(d);
        setLoggedSets(d.loggedSets ?? []);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message ?? "Failed to load session");
        setLoading(false);
      });
  }, [sid]);

  const handleLogSet = useCallback(async (
    exerciseId: number,
    exerciseName: string,
    setData: { setType: string; weightKg: number | null; reps: number | null; rir: number | null },
    restS: number,
    setNumber: number,
  ) => {
    const res = await fetch(`/api/workouts/session/${sid}/sets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exerciseId, exerciseName, setNumber, ...setData }),
    });
    if (!res.ok) return; // silently skip — don't optimistically add if save failed
    const json = await res.json();
    if (json.setId) {
      setLoggedSets((prev) => [...prev, {
        id: json.setId, exerciseId, exerciseName, setNumber,
        setType: setData.setType, weightKg: setData.weightKg,
        reps: setData.reps, rir: setData.rir, durationSeconds: null,
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
    <div style={{ padding: "20px 24px 100px", maxWidth: 720, margin: "0 auto" }}>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
            {data.session.workoutName}<span className="grad-text">.</span>
          </h1>
          <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 4, fontFamily: "var(--f-mono)" }}>
            {data.session.date}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            padding: "6px 14px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid var(--line)",
            fontFamily: "var(--f-mono)", fontSize: 18, fontWeight: 500,
            color: elapsed > 5400 ? "var(--warn)" : "var(--ink-2)",
          }}>
            {elapsedMin}:{elapsedSec.toString().padStart(2, "0")}
          </div>
          <button onClick={handleFinish} disabled={finishing} style={{
            padding: "8px 18px", borderRadius: 8,
            background: doneSets > 0 ? "var(--grad)" : "rgba(255,255,255,0.06)",
            border: "none", color: doneSets > 0 ? "#0A0A14" : "var(--ink-3)",
            fontSize: 13, fontWeight: 600, cursor: finishing ? "wait" : "pointer", letterSpacing: "-0.01em",
          }}>
            {finishing ? "Saving…" : "Finish"}
          </button>
        </div>
      </div>

      {/* ── Progress ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "var(--f-mono)" }}>
            {doneSets} / {totalConfigSets} sets
          </span>
          <span style={{ fontSize: 11, color: "var(--ink-4)" }}>
            {Math.round(progressPct)}%
          </span>
        </div>
        <div style={{ height: 6, background: "var(--line)", borderRadius: 99, overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${progressPct}%`,
            background: progressPct === 100 ? "var(--pos)" : "var(--grad)",
            borderRadius: 99, transition: "width 0.3s, background 0.3s",
          }} />
        </div>
      </div>

      {/* ── Exercise blocks ───────────────────────────────────────────────── */}
      {data.exercises.map((ex) => (
        <ExerciseBlock
          key={ex.exerciseId}
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
        <Link href="/workouts" className="cc-btn" style={{ fontSize: 12 }}>
          ← Back
        </Link>
        {!abandonConfirm ? (
          <button onClick={() => setAbandonConfirm(true)} className="cc-btn" style={{ fontSize: 12, color: "var(--neg)" }}>
            Abandon session
          </button>
        ) : (
          <>
            <button onClick={() => setAbandonConfirm(false)} className="cc-btn" style={{ fontSize: 12 }}>
              Cancel
            </button>
            <button onClick={handleAbandon} style={{
              padding: "7px 14px", borderRadius: 8, border: "1px solid var(--neg)",
              background: "rgba(255,100,100,0.08)", color: "var(--neg)",
              fontSize: 12, cursor: "pointer",
            }}>
              Yes, abandon
            </button>
          </>
        )}
      </div>

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
    </div>
  );
}
