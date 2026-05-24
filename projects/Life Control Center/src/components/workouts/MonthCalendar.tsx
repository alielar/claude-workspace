"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface MonthSession {
  id: number;
  date: string;
  sessionName: string;
  workoutName: string;
  durationSeconds: number | null;
  setCount: number;
  totalVolume: number;
}

interface MonthCalendarProps {
  /** Sessions for the initial month (from server) */
  initialSessions: MonthSession[];
  /** Days assigned to any template (["mon","thu"]) — for planned-day markers */
  assignedDays: string[];
  /** Today in Madrid timezone (YYYY-MM-DD) */
  today: string;
  /** If a template is assigned today, its planId for the "start session" link */
  upNextPlanId: number | null;
  /** Monthly session count for header stat */
  monthSessionCount: number;
}

const DOW_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DOW_MAP: Record<number, string> = { 0: "sun", 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat" };
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getMonthGrid(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();

  // Monday = 0, Sunday = 6
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const cells: { day: number; dateStr: string }[] = [];
  // Leading blanks
  for (let i = 0; i < startDow; i++) cells.push({ day: 0, dateStr: "" });
  // Days
  for (let d = 1; d <= daysInMonth; d++) {
    const mm = String(month + 1).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    cells.push({ day: d, dateStr: `${year}-${mm}-${dd}` });
  }
  return cells;
}

function formatDuration(sec: number | null): string {
  if (!sec) return "-";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function MonthCalendar({ initialSessions, assignedDays, today, upNextPlanId, monthSessionCount }: MonthCalendarProps) {
  const todayDate = new Date(today);
  const [year, setYear] = useState(todayDate.getFullYear());
  const [month, setMonth] = useState(todayDate.getMonth());
  const [sessions, setSessions] = useState<MonthSession[]>(initialSessions);
  const [loading, setLoading] = useState(false);

  const [fetchError, setFetchError] = useState(false);

  // Session detail drawer
  const [selectedSession, setSelectedSession] = useState<MonthSession | null>(null);
  const [sessionSets, setSessionSets] = useState<{ exerciseName: string; setNumber: number; weightKg: number | null; reps: number | null; setType: string }[]>([]);
  const [setsError, setSetsError] = useState(false);

  const isCurrentMonth = year === todayDate.getFullYear() && month === todayDate.getMonth();

  // Fetch sessions when navigating months
  const fetchMonth = useCallback(async (y: number, m: number) => {
    const mm = String(m + 1).padStart(2, "0");
    const from = `${y}-${mm}-01`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const to = `${y}-${mm}-${String(lastDay).padStart(2, "0")}`;
    setLoading(true);
    setFetchError(false);
    try {
      const res = await fetch(`/api/workouts/history?limit=100&from=${from}&to=${to}`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      } else {
        setFetchError(true);
      }
    } catch {
      setFetchError(true);
    }
    setLoading(false);
  }, []);

  function navigate(delta: number) {
    let newMonth = month + delta;
    let newYear = year;
    if (newMonth < 0) { newMonth = 11; newYear--; }
    if (newMonth > 11) { newMonth = 0; newYear++; }
    setYear(newYear);
    setMonth(newMonth);

    if (newYear === todayDate.getFullYear() && newMonth === todayDate.getMonth()) {
      setSessions(initialSessions);
    } else {
      fetchMonth(newYear, newMonth);
    }
  }

  // Session lookup by date
  const sessionMap = useMemo(() => {
    const map = new Map<string, MonthSession>();
    for (const s of sessions) map.set(s.date, s);
    return map;
  }, [sessions]);

  const cells = getMonthGrid(year, month);

  // Count sessions this month
  const thisMonthCount = isCurrentMonth ? monthSessionCount : sessions.length;

  function getDow(dateStr: string): string {
    const d = new Date(dateStr);
    return DOW_MAP[d.getDay()] ?? "";
  }

  async function openSessionDetail(session: MonthSession) {
    setSelectedSession(session);
    setSessionSets([]);
    setSetsError(false);
    try {
      const res = await fetch(`/api/workouts/session/${session.id}`);
      if (res.ok) {
        const data = await res.json();
        setSessionSets(data.loggedSets ?? []);
      } else {
        setSetsError(true);
      }
    } catch {
      setSetsError(true);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="cc-card" style={{ marginBottom: 14 }}>
      {/* Header */}
      <div className="cc-card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              width: 28, height: 28, borderRadius: 6, border: "1px solid var(--line)",
              background: "transparent", color: "var(--ink-3)", cursor: "pointer",
              fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            ‹
          </button>
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)", letterSpacing: "-0.01em" }}>
            {MONTH_NAMES[month]} {year}
          </span>
          <button
            onClick={() => navigate(1)}
            style={{
              width: 28, height: 28, borderRadius: 6, border: "1px solid var(--line)",
              background: "transparent", color: "var(--ink-3)", cursor: "pointer",
              fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            ›
          </button>
        </div>
        <span style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "var(--f-mono)", letterSpacing: "0.04em" }}>
          {thisMonthCount} sessions
        </span>
      </div>

      {/* Calendar grid */}
      <div className="cc-card-body" style={{ padding: "10px 16px 16px", overflowX: "auto" }}>
        {/* Day headers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
          {DOW_HEADERS.map((d) => (
            <div key={d} style={{
              textAlign: "center", fontSize: 9.5, fontFamily: "var(--f-mono)",
              letterSpacing: "0.12em", color: "var(--ink-4)", fontWeight: 600,
              padding: "4px 0",
            }}>
              {d}
            </div>
          ))}
        </div>

        {fetchError && (
          <div style={{ fontSize: 11, color: "var(--neg)", textAlign: "center", padding: "8px 0" }}>
            Failed to load sessions
          </div>
        )}

        {/* Cells */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2,
          opacity: loading ? 0.5 : 1, transition: "opacity 0.15s",
        }}>
          {cells.map((cell, i) => {
            if (cell.day === 0) return <div key={`blank-${i}`} />;

            const session = sessionMap.get(cell.dateStr);
            const isToday = cell.dateStr === today;
            const isPast = cell.dateStr < today;
            const isFuture = cell.dateStr > today;
            const dow = getDow(cell.dateStr);
            const isPlanned = assignedDays.includes(dow);
            const hasSession = !!session;

            return (
              <button
                key={cell.dateStr}
                onClick={() => {
                  if (hasSession) openSessionDetail(session);
                  else if (isToday && upNextPlanId) {
                    window.location.href = `/workouts/session/new?planId=${upNextPlanId}`;
                  }
                }}
                style={{
                  position: "relative",
                  width: "100%", aspectRatio: "1", borderRadius: 8,
                  border: isToday
                    ? "2px solid var(--violet)"
                    : hasSession
                    ? "1px solid rgba(124,77,255,0.30)"
                    : "1px solid transparent",
                  background: hasSession
                    ? "linear-gradient(135deg, rgba(124,77,255,0.18), rgba(100,255,218,0.10))"
                    : isToday
                    ? "rgba(124,77,255,0.08)"
                    : isFuture && isPlanned
                    ? "rgba(255,255,255,0.02)"
                    : "transparent",
                  cursor: hasSession || (isToday && upNextPlanId) ? "pointer" : "default",
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                  gap: 2, padding: 2,
                  transition: "all 0.12s",
                }}
              >
                {/* Day number */}
                <span style={{
                  fontSize: 11, fontWeight: isToday ? 600 : 400,
                  color: hasSession ? "var(--ink)" : isToday ? "var(--violet)" : isPast ? "var(--ink-4)" : "var(--ink-3)",
                  fontFamily: "var(--f-mono)", lineHeight: 1,
                }}>
                  {cell.day}
                </span>
                {/* Tick */}
                {hasSession && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M1 4L3.5 6.5L9 1" stroke="var(--pos)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {/* Planned future dot */}
                {isFuture && isPlanned && !hasSession && (
                  <span style={{
                    width: 4, height: 4, borderRadius: "50%",
                    border: "1px dotted var(--ink-4)", flexShrink: 0,
                  }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Session detail drawer ──────────────────────────────────────────── */}
      {selectedSession && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 100,
            background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
            display: "flex", justifyContent: "flex-end",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedSession(null); }}
        >
          <div style={{
            width: "100%", maxWidth: 480, height: "100%", overflowY: "auto",
            background: "var(--bg-card)", borderLeft: "1px solid var(--line)",
            padding: "28px 24px",
          }}>
            {/* Close */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>
                  {selectedSession.workoutName}
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
                  {selectedSession.date} · {formatDuration(selectedSession.durationSeconds)}
                </div>
              </div>
              <button
                onClick={() => setSelectedSession(null)}
                style={{
                  width: 32, height: 32, borderRadius: 8, border: "1px solid var(--line)",
                  background: "transparent", color: "var(--ink-3)", cursor: "pointer", fontSize: 16,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                ×
              </button>
            </div>

            {/* Stats */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0,
              background: "rgba(124,77,255,0.06)", borderRadius: 10, overflow: "hidden",
              border: "1px solid rgba(124,77,255,0.15)", marginBottom: 20,
            }}>
              {[
                { value: selectedSession.setCount, label: "sets" },
                { value: `${Math.round(selectedSession.totalVolume).toLocaleString()} kg`, label: "volume" },
                { value: formatDuration(selectedSession.durationSeconds), label: "time" },
              ].map((stat, i) => (
                <div key={stat.label} style={{
                  padding: "14px 10px", textAlign: "center",
                  borderRight: i < 2 ? "1px solid rgba(124,77,255,0.15)" : "none",
                }}>
                  <div style={{ fontSize: 20, fontWeight: 300, fontFamily: "var(--f-mono)", color: "var(--ink)" }}>
                    {stat.value}
                  </div>
                  <div style={{ fontSize: 9.5, color: "var(--ink-4)", letterSpacing: "0.10em", textTransform: "uppercase" as const, marginTop: 3 }}>
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Sets list */}
            {sessionSets.length > 0 ? (
              <div>
                <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: "var(--ink-4)", fontWeight: 600, marginBottom: 10 }}>
                  Sets
                </div>
                {(() => {
                  // Group sets by exercise
                  const grouped: Record<string, typeof sessionSets> = {};
                  for (const s of sessionSets) {
                    if (!grouped[s.exerciseName]) grouped[s.exerciseName] = [];
                    grouped[s.exerciseName].push(s);
                  }
                  return Object.entries(grouped).map(([name, sets]) => (
                    <div key={name} style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)", marginBottom: 6 }}>{name}</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        {sets.map((s, i) => (
                          <div key={i} style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            padding: "6px 10px", borderRadius: 6,
                            background: "rgba(255,255,255,0.02)", border: "1px solid var(--line)",
                          }}>
                            <span style={{ fontSize: 10.5, color: "var(--ink-4)", fontFamily: "var(--f-mono)" }}>
                              Set {s.setNumber} · {s.setType}
                            </span>
                            <span style={{ fontSize: 12, color: "var(--ink)", fontFamily: "var(--f-mono)" }}>
                              {s.weightKg ?? "-"}kg × {s.reps ?? "-"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            ) : setsError ? (
              <div style={{ fontSize: 12, color: "var(--neg)", textAlign: "center", padding: "20px 0" }}>
                Failed to load sets
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--ink-4)", textAlign: "center", padding: "20px 0" }}>
                —
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
