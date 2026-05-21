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
  warmup: "var(--warn)",
  drop: "var(--cyan)",
  failure: "var(--neg)",
};

const SET_TYPE_LABEL: Record<string, string> = {
  standard: "STD",
  warmup: "WRM",
  drop: "DROP",
  failure: "FAIL",
};

// ─── Rest Timer ───────────────────────────────────────────────────────────────

function RestTimer({ seconds, onDone }: { seconds: number; onDone: () => void }) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (remaining <= 0) { onDone(); return; }
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining, onDone]);

  const pct = ((seconds - remaining) / seconds) * 100;
  const min = Math.floor(remaining / 60);
  const sec = remaining % 60;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
    }}>
      <div className="cc-card" style={{ width: 280, padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 12, color: "var(--ink-4)", fontFamily: "var(--f-mono)", letterSpacing: "0.1em", marginBottom: 16 }}>
          REST
        </div>
        <div style={{ fontSize: 64, fontWeight: 700, fontFamily: "var(--f-mono)", color: remaining <= 10 ? "var(--warn)" : "var(--ink)", lineHeight: 1 }}>
          {min}:{sec.toString().padStart(2, "0")}
        </div>
        {/* progress bar */}
        <div style={{ marginTop: 20, height: 4, background: "var(--line)", borderRadius: 2 }}>
          <div style={{ height: "100%", width: `${pct}%`, background: "var(--violet)", borderRadius: 2, transition: "width 1s linear" }} />
        </div>
        <button
          onClick={onDone}
          className="cc-btn"
          style={{ marginTop: 20, width: "100%" }}
        >
          Skip rest
        </button>
      </div>
    </div>
  );
}

// ─── Set Row ──────────────────────────────────────────────────────────────────

interface SetRowProps {
  setIndex: number;
  config: SetConfig;
  prefill: PrefillSet | null;
  logged: LoggedSet | null;
  currentPr1rm: number;
  weightIncrement: number;
  onLog: (data: { setType: string; weightKg: number | null; reps: number | null; rir: number | null }) => void;
  onUndo: () => void;
}

function SetRow({ setIndex, config, prefill, logged, currentPr1rm, weightIncrement, onLog, onUndo }: SetRowProps) {
  const [weight, setWeight] = useState<string>(
    logged?.weightKg?.toString() ?? prefill?.weightKg?.toString() ?? ""
  );
  const [reps, setReps] = useState<string>(
    logged?.reps?.toString() ?? prefill?.reps?.toString() ?? config.repMax.toString()
  );
  const [rir, setRir] = useState<string>(
    logged?.rir?.toString() ?? prefill?.rir?.toString() ?? config.rir.toString()
  );
  const [setType, setSetType] = useState<string>(logged?.setType ?? config.type);
  const isDone = !!logged;

  // Epley 1RM from current inputs
  const w = parseFloat(weight);
  const r = parseInt(reps);
  const estimated1rm = !isNaN(w) && !isNaN(r) && r > 0 ? w * (1 + r / 30) : null;
  const isPr = estimated1rm !== null && estimated1rm > currentPr1rm && currentPr1rm > 0;

  function nudge(field: "weight" | "reps" | "rir", delta: number) {
    if (field === "weight") {
      const cur = parseFloat(weight) || 0;
      setWeight(Math.max(0, cur + delta * weightIncrement).toString());
    } else if (field === "reps") {
      const cur = parseInt(reps) || 0;
      setReps(Math.max(0, cur + delta).toString());
    } else {
      const cur = parseInt(rir) || 0;
      setRir(Math.max(0, cur + delta).toString());
    }
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "8px 0",
      borderBottom: "1px solid var(--line)",
      opacity: isDone ? 0.7 : 1,
    }}>
      {/* Set number + type badge */}
      <div style={{ width: 36, textAlign: "center" }}>
        <div style={{ fontSize: 12, fontFamily: "var(--f-mono)", color: "var(--ink-4)" }}>
          {setIndex + 1}
        </div>
        <div style={{
          fontSize: 8, fontFamily: "var(--f-mono)", fontWeight: 700,
          color: SET_TYPE_COLOR[setType] ?? "var(--ink-4)",
          letterSpacing: "0.06em",
        }}>
          {SET_TYPE_LABEL[setType] ?? setType.toUpperCase()}
        </div>
      </div>

      {/* Weight */}
      <div style={{ flex: 2, display: "flex", alignItems: "center", gap: 4 }}>
        <button onClick={() => nudge("weight", -1)} disabled={isDone} style={{ ...nudgeBtn, opacity: isDone ? 0.4 : 1 }}>−</button>
        <input
          type="number"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          disabled={isDone}
          placeholder="kg"
          style={{ ...inputStyle, width: 60 }}
        />
        <button onClick={() => nudge("weight", 1)} disabled={isDone} style={{ ...nudgeBtn, opacity: isDone ? 0.4 : 1 }}>+</button>
      </div>

      {/* Reps */}
      <div style={{ flex: 1.5, display: "flex", alignItems: "center", gap: 4 }}>
        <button onClick={() => nudge("reps", -1)} disabled={isDone} style={{ ...nudgeBtn, opacity: isDone ? 0.4 : 1 }}>−</button>
        <input
          type="number"
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          disabled={isDone}
          placeholder="reps"
          style={{ ...inputStyle, width: 48 }}
        />
        <button onClick={() => nudge("reps", 1)} disabled={isDone} style={{ ...nudgeBtn, opacity: isDone ? 0.4 : 1 }}>+</button>
      </div>

      {/* RIR */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 4 }}>
        <button onClick={() => nudge("rir", -1)} disabled={isDone} style={{ ...nudgeBtn, opacity: isDone ? 0.4 : 1 }}>−</button>
        <input
          type="number"
          value={rir}
          onChange={(e) => setRir(e.target.value)}
          disabled={isDone}
          placeholder="RIR"
          style={{ ...inputStyle, width: 40 }}
        />
        <button onClick={() => nudge("rir", 1)} disabled={isDone} style={{ ...nudgeBtn, opacity: isDone ? 0.4 : 1 }}>+</button>
      </div>

      {/* Log / Undo button */}
      <div style={{ width: 64, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        {isDone ? (
          <button onClick={onUndo} style={{ ...actionBtn, background: "rgba(255,255,255,0.06)", color: "var(--ink-4)" }}>
            undo
          </button>
        ) : (
          <button
            onClick={() => onLog({
              setType,
              weightKg: parseFloat(weight) || null,
              reps: parseInt(reps) || null,
              rir: parseInt(rir) ?? null,
            })}
            style={{ ...actionBtn, background: "var(--violet)", color: "#fff" }}
          >
            ✓ log
          </button>
        )}
        {isPr && !isDone && (
          <span style={{ fontSize: 8, color: "var(--warn)", fontFamily: "var(--f-mono)", letterSpacing: "0.06em" }}>
            PR!
          </span>
        )}
      </div>
    </div>
  );
}

const nudgeBtn: React.CSSProperties = {
  width: 22, height: 22, borderRadius: 4, border: "1px solid var(--line)",
  background: "var(--bg-input)", color: "var(--ink-3)", cursor: "pointer",
  fontSize: 14, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center",
  flexShrink: 0,
};

const inputStyle: React.CSSProperties = {
  background: "var(--bg-input)", border: "1px solid var(--line)", borderRadius: 6,
  color: "var(--ink)", fontSize: 13, fontFamily: "var(--f-mono)", textAlign: "center",
  padding: "4px 0",
};

const actionBtn: React.CSSProperties = {
  width: 60, padding: "5px 0", borderRadius: 6, border: "none", cursor: "pointer",
  fontSize: 11, fontFamily: "var(--f-mono)", fontWeight: 600, letterSpacing: "0.04em",
};

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
  const currentPr = prMap[exercise.exerciseId] ?? 0;

  // How many sets are logged for this exercise in this session
  const mySets = loggedSets.filter((s) => s.exerciseId === exercise.exerciseId);
  const totalConfigSets = exercise.setConfig.length;
  const done = mySets.length;

  return (
    <div className="cc-card" style={{ marginBottom: 12 }}>
      <div className="cc-card-head">
        <div>
          <div className="title">{exercise.name}</div>
          <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2 }}>
            {exercise.primaryMuscle} · {exercise.equipment}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, fontFamily: "var(--f-mono)", color: done >= totalConfigSets ? "var(--pos)" : "var(--ink-4)" }}>
            {done}/{totalConfigSets} sets
          </span>
          {done >= totalConfigSets && done > 0 && (
            <span style={{ fontSize: 9, fontFamily: "var(--f-mono)", color: "var(--pos)", letterSpacing: "0.1em" }}>
              DONE
            </span>
          )}
        </div>
      </div>

      <div className="cc-card-body">
        {/* Column headers */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <div style={{ width: 36 }} />
          <div style={{ flex: 2, fontSize: 10, color: "var(--ink-5)", textAlign: "center", fontFamily: "var(--f-mono)" }}>WEIGHT (kg)</div>
          <div style={{ flex: 1.5, fontSize: 10, color: "var(--ink-5)", textAlign: "center", fontFamily: "var(--f-mono)" }}>REPS</div>
          <div style={{ flex: 1, fontSize: 10, color: "var(--ink-5)", textAlign: "center", fontFamily: "var(--f-mono)" }}>RIR</div>
          <div style={{ width: 64 }} />
        </div>

        {exercise.setConfig.map((cfg, idx) => {
          const loggedSet = mySets.find((s) => s.setNumber === idx + 1) ?? null;
          const prefillSet = prefill[idx] ?? null;
          return (
            <SetRow
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
    </div>
  );
}

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
  const totalSets = data.loggedSets.length;
  const totalVolume = data.loggedSets.reduce((sum, s) => sum + (s.weightKg ?? 0) * (s.reps ?? 0), 0);
  const min = Math.floor(elapsedSeconds / 60);
  const sec = elapsedSeconds % 60;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300,
    }}>
      <div className="cc-card" style={{ width: 360, maxHeight: "80vh", overflow: "auto" }}>
        <div className="cc-card-head">
          <div className="title">Session complete</div>
        </div>
        <div className="cc-card-body">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
            <div style={{ textAlign: "center" }}>
              <div className="num" style={{ fontSize: 28 }}>{totalSets}</div>
              <div style={{ fontSize: 11, color: "var(--ink-4)" }}>sets</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div className="num" style={{ fontSize: 28 }}>{Math.round(totalVolume).toLocaleString()}</div>
              <div style={{ fontSize: 11, color: "var(--ink-4)" }}>kg volume</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div className="num" style={{ fontSize: 28 }}>{min}:{sec.toString().padStart(2, "0")}</div>
              <div style={{ fontSize: 11, color: "var(--ink-4)" }}>duration</div>
            </div>
          </div>

          <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 16 }}>
            {data.session.workoutName} · {data.session.date}
          </div>

          <button onClick={onClose} className="cc-btn-primary" style={{ width: "100%", padding: "10px 0" }}>
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
  const [loggedSets, setLoggedSets] = useState<LoggedSet[]>([]);
  const [restTimer, setRestTimer] = useState<{ seconds: number } | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [finishing, setFinishing] = useState(false);

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
      .then((r) => r.json())
      .then((d: SessionData) => {
        setData(d);
        setLoggedSets(d.loggedSets ?? []);
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
      body: JSON.stringify({
        exerciseId,
        exerciseName,
        setNumber,
        ...setData,
      }),
    });
    const json = await res.json();
    if (json.setId) {
      setLoggedSets((prev) => [
        ...prev,
        {
          id: json.setId,
          exerciseId,
          exerciseName,
          setNumber,
          setType: setData.setType,
          weightKg: setData.weightKg,
          reps: setData.reps,
          rir: setData.rir,
          durationSeconds: null,
        },
      ]);
      // Start rest timer
      if (restS > 0 && setData.setType !== "warmup") {
        setRestTimer({ seconds: restS });
      }
    }
  }, [sid]);

  const handleUndoSet = useCallback(async (setId: number) => {
    await fetch(`/api/workouts/session/${sid}/sets?setId=${setId}`, { method: "DELETE" });
    setLoggedSets((prev) => prev.filter((s) => s.id !== setId));
  }, [sid]);

  const handleFinish = useCallback(async () => {
    setFinishing(true);
    await fetch(`/api/workouts/session/${sid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ durationSeconds: elapsed, finished: true }),
    });
    setShowSummary(true);
    setFinishing(false);
  }, [sid, elapsed]);

  const handleAbandon = useCallback(async () => {
    if (!confirm("Abandon this session? All logged sets will be deleted.")) return;
    await fetch(`/api/workouts/session/${sid}`, { method: "DELETE" });
    router.push("/workouts");
  }, [sid, router]);

  const elapsedMin = Math.floor(elapsed / 60);
  const elapsedSec = elapsed % 60;

  if (loading || !data) {
    return (
      <div style={{ padding: 32, color: "var(--ink-4)", fontSize: 13 }}>Loading session…</div>
    );
  }

  const totalConfigSets = data.exercises.reduce((sum, ex) => sum + ex.setConfig.length, 0);
  const doneSets = loggedSets.length;
  const progressPct = totalConfigSets > 0 ? (doneSets / totalConfigSets) * 100 : 0;

  return (
    <div style={{ padding: "20px 24px 80px", maxWidth: 720, margin: "0 auto" }}>

      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
            {data.session.workoutName}
            <span className="grad-text">.</span>
          </h1>
          <div style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 4 }}>
            {data.session.date}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Elapsed clock */}
          <div style={{
            fontFamily: "var(--f-mono)", fontSize: 20, fontWeight: 600,
            color: elapsed > 5400 ? "var(--warn)" : "var(--ink-2)",
          }}>
            {elapsedMin}:{elapsedSec.toString().padStart(2, "0")}
          </div>
          <button onClick={handleAbandon} className="cc-btn" style={{ fontSize: 12, padding: "6px 12px" }}>
            Abandon
          </button>
          <button
            onClick={handleFinish}
            disabled={finishing}
            className="cc-btn-primary"
            style={{ fontSize: 12, padding: "6px 14px" }}
          >
            {finishing ? "Saving…" : "Finish"}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, background: "var(--line)", borderRadius: 2, marginBottom: 20 }}>
        <div style={{
          height: "100%",
          width: `${progressPct}%`,
          background: "var(--grad)",
          borderRadius: 2,
          transition: "width 0.3s",
        }} />
      </div>
      <div style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "var(--f-mono)", marginBottom: 20 }}>
        {doneSets} / {totalConfigSets} sets
      </div>

      {/* Exercise blocks */}
      {data.exercises.map((ex) => (
        <ExerciseBlock
          key={ex.exerciseId}
          exercise={ex}
          loggedSets={loggedSets.filter((s) => s.exerciseId === ex.exerciseId)}
          prefill={data.prefillMap[ex.exerciseId] ?? []}
          prMap={data.prMap}
          onLogSet={(exerciseId, exerciseName, setData, restS) => {
            // setNumber = next set number for this exercise
            const myLogged = loggedSets.filter((s) => s.exerciseId === exerciseId);
            const setNumber = myLogged.length + 1;
            handleLogSet(exerciseId, exerciseName, setData, restS, setNumber);
          }}
          onUndoSet={handleUndoSet}
        />
      ))}

      {/* Footer nav */}
      <div style={{ marginTop: 32, display: "flex", justifyContent: "center" }}>
        <Link href="/workouts" className="cc-btn" style={{ fontSize: 12 }}>
          ← Back to Workouts
        </Link>
      </div>

      {/* Rest timer overlay */}
      {restTimer && (
        <RestTimer
          seconds={restTimer.seconds}
          onDone={() => setRestTimer(null)}
        />
      )}

      {/* Session summary overlay */}
      {showSummary && (
        <SessionSummary
          data={{ ...data, loggedSets }}
          elapsedSeconds={elapsed}
          onClose={() => {
            setShowSummary(false);
            router.push("/workouts");
          }}
        />
      )}
    </div>
  );
}
