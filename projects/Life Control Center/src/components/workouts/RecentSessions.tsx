"use client";

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";

interface HistorySession {
  id: number;
  sessionName: string;
  workoutName: string;
  date: string;
  durationSeconds: number | null;
  setCount: number;
  totalVolume: number;
  sets?: Array<{ exerciseName: string; setNumber: number; weightKg: number | null; reps: number | null; setType: string }>;
}

function formatDuration(s: number | null): string {
  if (!s) return "-";
  const m = Math.floor(s / 60);
  return `${m}min`;
}

function formatVolume(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}t`;
  return `${v}kg`;
}

// Group sets by exercise name for expand view
function groupByExercise(sets: HistorySession["sets"]) {
  if (!sets) return [];
  const map = new Map<string, typeof sets>();
  for (const s of sets) {
    if (!map.has(s.exerciseName)) map.set(s.exerciseName, []);
    map.get(s.exerciseName)!.push(s);
  }
  return Array.from(map.entries());
}

export default function RecentSessions() {
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDrawer, setShowDrawer] = useState(false);
  const [allSessions, setAllSessions] = useState<HistorySession[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Load last 5 for the card
  useEffect(() => {
    fetch("/api/workouts/history?limit=5")
      .then((r) => r.json())
      .then((data) => { setSessions(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  function openDrawer() {
    setShowDrawer(true);
    if (allSessions.length === 0) {
      setDrawerLoading(true);
      fetch("/api/workouts/history?limit=200&detail=true")
        .then((r) => r.json())
        .then((data) => { setAllSessions(data); setDrawerLoading(false); })
        .catch(() => setDrawerLoading(false));
    }
  }

  function toggleExpand(id: number) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  // Group by month for drawer
  function groupByMonth(list: HistorySession[]) {
    const groups: { month: string; sessions: HistorySession[] }[] = [];
    for (const s of list) {
      const month = s.date.slice(0, 7); // "YYYY-MM"
      const last = groups[groups.length - 1];
      if (last && last.month === month) {
        last.sessions.push(s);
      } else {
        groups.push({ month, sessions: [s] });
      }
    }
    return groups;
  }

  if (loading) {
    return (
      <div className="cc-card" style={{ marginTop: 14 }}>
        <div className="cc-card-head">
          <div className="title">Recent Sessions</div>
        </div>
        <div className="cc-card-body">
          <div className="skeleton" style={{ height: 48, borderRadius: 8, marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 48, borderRadius: 8 }} />
        </div>
      </div>
    );
  }

  if (sessions.length === 0) return null;

  return (
    <>
      {/* Card on main page */}
      <div className="cc-card" style={{ marginTop: 14 }}>
        <div className="cc-card-head">
          <div className="title">Recent Sessions</div>
          <button
            onClick={openDrawer}
            style={{ background: "none", border: "none", fontSize: 10, color: "var(--cyan)", cursor: "pointer", letterSpacing: "0.04em" }}
          >
            View all →
          </button>
        </div>
        <div style={{ padding: 0 }}>
          {sessions.map((s, i) => (
            <div
              key={s.id}
              style={{
                display: "grid", gridTemplateColumns: "1fr auto",
                alignItems: "center", padding: "12px 16px",
                borderBottom: i < sessions.length - 1 ? "1px solid var(--line)" : "none",
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{s.sessionName}</div>
                <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2, fontFamily: "var(--f-mono)" }}>
                  {format(parseISO(s.date), "EEE, MMM d")}
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--f-mono)" }}>
                  {s.setCount} sets
                </span>
                <span style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--f-mono)" }}>
                  {formatVolume(s.totalVolume)}
                </span>
                <span style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "var(--f-mono)" }}>
                  {formatDuration(s.durationSeconds)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Full history drawer */}
      {showDrawer && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 100,
            background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowDrawer(false); }}
        >
          <div style={{
            position: "absolute", right: 0, top: 0, bottom: 0,
            width: "100%", maxWidth: 700,
            background: "var(--bg)", overflowY: "auto",
            borderLeft: "1px solid var(--line)",
          }}>
            {/* Header */}
            <div style={{
              position: "sticky", top: 0, zIndex: 10,
              padding: "14px 24px",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: "var(--bg)", borderBottom: "1px solid var(--line)",
            }}>
              <h2 style={{ fontSize: 20, fontWeight: 600 }}>
                Session History<span className="grad-text">.</span>
              </h2>
              <button
                onClick={() => setShowDrawer(false)}
                style={{
                  width: 36, height: 36, borderRadius: 10,
                  border: "1px solid var(--line)", background: "var(--bg-card)",
                  color: "var(--ink-3)", cursor: "pointer", fontSize: 18,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: "20px 24px 40px" }}>
              {drawerLoading ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="skeleton" style={{ height: 56, borderRadius: 10 }} />
                  ))}
                </div>
              ) : allSessions.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--ink-4)", padding: 32 }}>No sessions yet</div>
              ) : (
                groupByMonth(allSessions).map(({ month, sessions: monthSessions }) => (
                  <div key={month} style={{ marginBottom: 24 }}>
                    <div style={{
                      fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
                      textTransform: "uppercase" as const, color: "var(--ink-4)", marginBottom: 10,
                      fontFamily: "var(--f-mono)",
                    }}>
                      {format(parseISO(`${month}-01`), "MMMM yyyy")}
                      <span style={{ marginLeft: 8, color: "var(--ink-5)" }}>{monthSessions.length} sessions</span>
                    </div>
                    <div className="cc-card">
                      {monthSessions.map((s, i) => (
                        <div key={s.id}>
                          <button
                            onClick={() => toggleExpand(s.id)}
                            style={{
                              display: "grid", gridTemplateColumns: "1fr auto",
                              alignItems: "center", padding: "12px 16px", width: "100%",
                              background: "transparent", border: "none", cursor: "pointer",
                              textAlign: "left",
                              borderBottom: (expandedId !== s.id && i < monthSessions.length - 1) ? "1px solid var(--line)" : "none",
                            }}
                          >
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{s.sessionName}</div>
                              <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2, fontFamily: "var(--f-mono)" }}>
                                {format(parseISO(s.date), "EEE, MMM d")}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                              <span style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--f-mono)" }}>
                                {s.setCount} sets
                              </span>
                              <span style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--f-mono)" }}>
                                {formatVolume(s.totalVolume)}
                              </span>
                              <span style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "var(--f-mono)" }}>
                                {formatDuration(s.durationSeconds)}
                              </span>
                              <span style={{
                                fontSize: 14, color: "var(--ink-4)", transition: "transform 0.15s",
                                transform: expandedId === s.id ? "rotate(180deg)" : "rotate(0deg)",
                              }}>
                                ↓
                              </span>
                            </div>
                          </button>

                          {/* Expanded exercise detail */}
                          {expandedId === s.id && s.sets && (
                            <div style={{
                              padding: "0 16px 14px",
                              borderBottom: i < monthSessions.length - 1 ? "1px solid var(--line)" : "none",
                            }}>
                              {groupByExercise(s.sets).map(([name, sets]) => (
                                <div key={name} style={{ marginBottom: 10 }}>
                                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-2)", marginBottom: 4 }}>
                                    {name}
                                  </div>
                                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                                    {sets.map((set) => (
                                      <span
                                        key={`${set.exerciseName}-${set.setNumber}`}
                                        style={{
                                          fontSize: 10, fontFamily: "var(--f-mono)", padding: "2px 8px",
                                          borderRadius: 4, background: "rgba(255,255,255,0.03)",
                                          border: "1px solid var(--line)", color: "var(--ink-3)",
                                        }}
                                      >
                                        {set.weightKg ?? "-"}kg x {set.reps ?? "-"}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
