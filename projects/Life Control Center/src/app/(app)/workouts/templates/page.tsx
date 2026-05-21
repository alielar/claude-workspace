"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Plan {
  id: number;
  name: string;
  type: string;
  sortOrder: number;
}

interface Program {
  id: number;
  name: string;
  cycles: number | null;
  isActive: boolean;
  plans: Plan[];
}

const PLAN_MUSCLES: Record<string, string> = {
  Push: "Chest · Shoulders · Triceps",
  Pull: "Back · Biceps · Traps · Forearms",
  Legs: "Quads · Hams · Glutes · Calves",
  "Push-Up SESH": "Calisthenics · Core · Skill",
};

export default function TemplatesPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [activeProgramId, setActiveProgramId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/workouts/programs")
      .then((r) => r.json())
      .then((data: Program[]) => {
        setPrograms(data);
        const active = data.find((p) => p.isActive);
        setActiveProgramId(active?.id ?? data[0]?.id ?? null);
        setLoading(false);
      });
  }, []);

  async function setActive(programId: number) {
    // Deactivate all, then activate chosen
    for (const p of programs) {
      await fetch(`/api/workouts/programs/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: p.id === programId }),
      });
    }
    setPrograms((prev) => prev.map((p) => ({ ...p, isActive: p.id === programId })));
    setActiveProgramId(programId);
  }

  const activeProgram = programs.find((p) => p.id === activeProgramId);

  return (
    <div style={{ padding: "28px 32px 64px", maxWidth: 1100, margin: "0 auto" }}>

      {/* Page title */}
      <div className="cc-pagetitle" style={{ marginBottom: 26 }}>
        <div>
          <h1>Templates<span className="grad-text">.</span></h1>
          <div className="sub">Manage programs and workout templates</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/workouts" className="cc-btn">← Workouts</Link>
          <Link href="/workouts/exercises" className="cc-btn">Exercise Library</Link>
        </div>
      </div>

      {loading ? (
        <div style={{ color: "var(--ink-4)", fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16 }}>

          {/* Left: program list */}
          <div>
            <div className="cc-card">
              <div className="cc-card-head">
                <div className="title">Programs</div>
              </div>
              <div style={{ padding: "8px 0" }}>
                {programs.map((prog) => (
                  <button
                    key={prog.id}
                    onClick={() => { setActiveProgramId(prog.id); setActive(prog.id); }}
                    style={{
                      width: "100%", textAlign: "left", padding: "12px 16px",
                      background: prog.id === activeProgramId ? "rgba(179,136,255,0.08)" : "transparent",
                      borderLeft: `2px solid ${prog.id === activeProgramId ? "var(--violet)" : "transparent"}`,
                      border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: prog.id === activeProgramId ? "var(--ink)" : "var(--ink-2)" }}>
                        {prog.name}
                      </div>
                      {prog.cycles && (
                        <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2 }}>{prog.cycles} cycles</div>
                      )}
                    </div>
                    {prog.isActive && (
                      <span style={{ fontSize: 9, fontFamily: "var(--f-mono)", color: "var(--cyan)", letterSpacing: "0.12em", background: "rgba(126,231,255,0.10)", padding: "3px 7px", borderRadius: 4 }}>
                        ACTIVE
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: plans in active program */}
          <div>
            {activeProgram ? (
              <div className="cc-card">
                <div className="cc-card-head">
                  <div className="title">{activeProgram.name} · Workout Plans</div>
                  <div className="tail">{activeProgram.plans.length} templates</div>
                </div>
                <div className="cc-card-body">
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {activeProgram.plans
                      .sort((a, b) => a.sortOrder - b.sortOrder)
                      .map((plan) => (
                        <Link key={plan.id} href={`/workouts/templates/${plan.id}`} style={{ textDecoration: "none" }}>
                          <div style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            padding: "14px 18px", borderRadius: 12, cursor: "pointer", transition: "all 0.12s",
                            border: "1px solid var(--line)", background: "rgba(255,255,255,0.018)",
                          }}>
                            <div>
                              <div style={{ fontSize: 16, fontWeight: 500 }}>{plan.name}</div>
                              <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 3 }}>
                                {PLAN_MUSCLES[plan.name] ?? plan.type}
                              </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <span style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "var(--f-mono)", letterSpacing: "0.06em", textTransform: "uppercase" as const }}>
                                {plan.type}
                              </span>
                              <span style={{ fontSize: 18, color: "var(--ink-4)" }}>→</span>
                            </div>
                          </div>
                        </Link>
                      ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="cc-card" style={{ padding: 32, textAlign: "center" }}>
                <p style={{ color: "var(--ink-3)" }}>Select a program to view its templates</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
