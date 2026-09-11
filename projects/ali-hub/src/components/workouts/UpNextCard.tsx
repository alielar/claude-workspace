"use client";

import { useState } from "react";
import Link from "next/link";

const MUSCLE_LABELS: Record<string, string> = {
  chest: "Chest", front_delts: "Front Delts", side_delts: "Side Delts",
  rear_delts: "Rear Delts", triceps: "Triceps", biceps: "Biceps",
  lats: "Lats", upper_back: "Upper Back", traps: "Traps",
  quads: "Quads", hamstrings: "Hams", glutes: "Glutes",
  calves: "Calves", abs: "Abs", obliques: "Obliques",
  forearms: "Forearms", serratus: "Serratus",
};

const DAY_LABELS: Record<string, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

interface Plan {
  id: number;
  name: string;
  assignedDays: string | null;
  targetMuscles: string | null;
  exerciseCount: number;
  lastDone: string | null;
  exercises: { name: string; primaryMuscle: string | null }[];
}

interface UpNextCardProps {
  plans: Plan[];
  initialPlanId: number;
  todayDow: string;
}

function parseDays(raw: string | null): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function parseMuscles(raw: string | null): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function daysAgo(dateStr: string): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
  const d = Math.floor((new Date(today).getTime() - new Date(dateStr).getTime()) / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  return `${d}d ago`;
}

// Find the next scheduled plan from today onward
function findNextPlan(plans: Plan[], todayDow: string, skip: Set<number>): Plan | null {
  const DOW_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const todayIdx = DOW_ORDER.indexOf(todayDow);

  // Check today first, then each subsequent day for a week
  for (let offset = 0; offset < 7; offset++) {
    const dow = DOW_ORDER[(todayIdx + offset) % 7];
    for (const plan of plans) {
      if (skip.has(plan.id)) continue;
      const days = parseDays(plan.assignedDays);
      if (days.includes(dow)) return plan;
    }
  }
  return plans.find(p => !skip.has(p.id)) ?? null;
}

export default function UpNextCard({ plans, initialPlanId, todayDow }: UpNextCardProps) {
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [musclesExpanded, setMusclesExpanded] = useState(false);

  const currentPlan = selectedPlanId
    ? plans.find(p => p.id === selectedPlanId) ?? plans.find(p => p.id === initialPlanId) ?? plans[0]
    : plans.find(p => p.id === initialPlanId) ?? plans[0];

  if (!currentPlan) return null;

  const days = parseDays(currentPlan.assignedDays);
  const muscles = parseMuscles(currentPlan.targetMuscles);
  const isToday = days.includes(todayDow);

  return (
    <div className="cc-card" style={{
      marginBottom: 14, padding: 0, overflow: "visible",
      background: `
        radial-gradient(60% 80% at 0% 0%, rgba(124,77,255,0.16), transparent 60%),
        radial-gradient(50% 80% at 100% 100%, rgba(100,255,218,0.10), transparent 60%),
        var(--bg-card)`,
    }}>
      <div style={{ padding: "30px 32px" }}>
        <div className="workout-hero-layout" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10.5, letterSpacing: "0.20em", textTransform: "uppercase" as const, color: "var(--ink-3)", marginBottom: 12 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--cyan)", boxShadow: "0 0 8px var(--cyan)", flexShrink: 0 }} />
              {isToday ? `Today · ${currentPlan.name}` : `Next · ${currentPlan.name}`}
            </div>
            <div className="workout-hero-title" style={{
              fontSize: 64, fontWeight: 200, letterSpacing: "-0.04em", lineHeight: 0.9,
              background: "var(--grad)", WebkitBackgroundClip: "text", backgroundClip: "text",
              color: "transparent", filter: "drop-shadow(0 0 24px rgba(124,77,255,0.20))",
              paddingBottom: "0.15em", marginBottom: "-0.15em",
            }}>
              {currentPlan.name.toUpperCase()}
            </div>
            <div style={{ display: "flex", gap: 18, marginTop: 14, color: "var(--ink-2)", fontSize: 12.5, alignItems: "center", flexWrap: "wrap" as const }}>
              <span>{currentPlan.exerciseCount} exercises</span>
              {muscles.length > 0 && (
                <>
                  <span style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--ink-4)" }} />
                  <span>
                    {(musclesExpanded ? muscles : muscles.slice(0, 2)).map(m => MUSCLE_LABELS[m] ?? m).join(" · ")}
                    {muscles.length > 2 && !musclesExpanded && (
                      <button
                        onClick={() => setMusclesExpanded(true)}
                        style={{
                          marginLeft: 6, background: "none", border: "none",
                          color: "var(--violet)", fontSize: 12, cursor: "pointer",
                          padding: 0, fontWeight: 500,
                        }}
                      >
                        +{muscles.length - 2} more
                      </button>
                    )}
                  </span>
                </>
              )}
              {days.length > 0 && (
                <>
                  <span style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--ink-4)" }} />
                  <span>{days.map(d => DAY_LABELS[d] ?? d).join(", ")}</span>
                </>
              )}
              {currentPlan.lastDone && (
                <>
                  <span style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--ink-4)" }} />
                  <span>last: {daysAgo(currentPlan.lastDone)}</span>
                </>
              )}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0, position: "relative" }}>
            <Link
              href={`/workouts/session/new?planId=${currentPlan.id}`}
              className="cc-btn-primary"
              style={{
                display: "inline-flex", alignItems: "center", gap: 10,
                padding: "14px 22px", borderRadius: 10,
                fontSize: 14, fontWeight: 600, letterSpacing: "-0.005em",
                textDecoration: "none",
              }}
            >
              Start session
            </Link>
            <button
              onClick={() => setShowPicker((v) => !v)}
              style={{
                padding: "8px 16px", borderRadius: 8, fontSize: 11,
                background: showPicker ? "rgba(124,77,255,0.08)" : "transparent",
                border: `1px solid ${showPicker ? "rgba(124,77,255,0.3)" : "var(--line)"}`,
                color: showPicker ? "var(--violet)" : "var(--ink-4)",
                cursor: "pointer", letterSpacing: "0.02em",
                display: "flex", alignItems: "center", gap: 6, justifyContent: "center",
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
              Switch workout
            </button>

            {/* Workout picker dropdown */}
            {showPicker && (
              <div style={{
                position: "absolute", top: "100%", right: 0, marginTop: 4,
                width: 240, background: "rgba(12,12,22,0.97)", border: "1px solid var(--line-hi)",
                borderRadius: 12, padding: "6px", zIndex: 30,
                boxShadow: "0 8px 32px rgba(0,0,0,0.5), 0 0 20px rgba(124,77,255,0.08)",
                backdropFilter: "blur(20px)",
              }}>
                {plans.map(p => {
                  const pDays = parseDays(p.assignedDays);
                  const isCurrent = p.id === currentPlan.id;
                  const scheduledToday = pDays.includes(todayDow);
                  return (
                    <button
                      key={p.id}
                      onClick={() => { setSelectedPlanId(p.id); setShowPicker(false); }}
                      style={{
                        width: "100%", padding: "10px 12px", borderRadius: 8,
                        background: isCurrent ? "rgba(124,77,255,0.12)" : "transparent",
                        border: "none", cursor: "pointer", textAlign: "left",
                        display: "flex", flexDirection: "column", gap: 2,
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                      onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.background = "transparent"; }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: isCurrent ? "var(--violet)" : "var(--ink)" }}>{p.name}</span>
                        {scheduledToday && (
                          <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: "rgba(100,255,218,0.12)", color: "var(--cyan)", fontWeight: 600, letterSpacing: "0.06em" }}>TODAY</span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "var(--f-mono)", letterSpacing: "0.04em" }}>
                        {p.exerciseCount} ex · {pDays.length > 0 ? pDays.map(d => DAY_LABELS[d] ?? d).join(", ") : "unscheduled"}
                        {p.lastDone ? ` · ${daysAgo(p.lastDone)}` : ""}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Exercise preview grid */}
        {currentPlan.exercises.length > 0 && (
          <div className="workout-exercise-preview" style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
            {currentPlan.exercises.slice(0, 8).map((ex, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "24px 1fr auto",
                alignItems: "center", gap: 12, padding: "10px 14px",
                border: "1px solid var(--line)", borderRadius: 10,
                background: "rgba(255,255,255,0.018)", fontSize: 13,
              }}>
                <span style={{ fontFamily: "var(--f-mono)", color: "var(--ink-4)", fontSize: 10.5, letterSpacing: "0.06em" }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span style={{ color: "var(--ink)" }}>{ex.name}</span>
                <span style={{ fontFamily: "var(--f-mono)", color: "var(--ink-3)", fontSize: 11.5 }}>
                  {MUSCLE_LABELS[ex.primaryMuscle ?? ""] ?? ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
