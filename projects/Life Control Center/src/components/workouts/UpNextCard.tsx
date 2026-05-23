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
  const [skippedIds, setSkippedIds] = useState<Set<number>>(new Set());

  const currentPlan = skippedIds.size === 0
    ? plans.find(p => p.id === initialPlanId) ?? plans[0]
    : findNextPlan(plans, todayDow, skippedIds);

  if (!currentPlan) return null;

  const days = parseDays(currentPlan.assignedDays);
  const muscles = parseMuscles(currentPlan.targetMuscles);
  const isToday = days.includes(todayDow);

  function handleSkip() {
    setSkippedIds(prev => new Set(prev).add(currentPlan!.id));
  }

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
              {isToday ? `Today \u00b7 ${currentPlan.name}` : `Next \u00b7 ${currentPlan.name}`}
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
                  <span>{muscles.map(m => MUSCLE_LABELS[m] ?? m).join(" \u00b7 ")}</span>
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
          <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
            <Link
              href={`/workouts/session/new?planId=${currentPlan.id}`}
              style={{
                display: "inline-flex", alignItems: "center", gap: 10,
                padding: "14px 22px", borderRadius: 10,
                background: "#E8E8F0", color: "#06060B",
                fontSize: 14, fontWeight: 600, letterSpacing: "-0.005em",
                textDecoration: "none",
              }}
            >
              Start session
            </Link>
            <button
              onClick={handleSkip}
              style={{
                padding: "8px 16px", borderRadius: 8, fontSize: 11,
                background: "transparent", border: "1px solid var(--line)",
                color: "var(--ink-4)", cursor: "pointer", letterSpacing: "0.02em",
              }}
            >
              Skip \u00b7 next workout
            </button>
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
