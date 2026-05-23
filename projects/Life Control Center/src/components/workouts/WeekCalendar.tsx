"use client";

import { useState } from "react";
import Link from "next/link";

export interface WeekDay {
  dow: string;
  dnum: string;
  dateStr: string;
  sessionName: string | null;
  sessionId: number | null;
  isToday: boolean;
  isRest: boolean;
}

interface SessionSummary {
  id: number;
  sessionName: string;
  workoutName: string;
  date: string;
  durationSeconds: number | null;
  setCount: number;
  totalVolume: number;
  notes: string | null;
}

function formatDuration(s: number | null): string {
  if (!s) return "-";
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const mins = m % 60;
  return h > 0 ? `${h}h ${mins}m` : `${m}m`;
}

const SESSION_COLOR: Record<string, string> = {
  Push: "rgba(124,77,255,0.80)",
  Pull: "rgba(100,255,218,0.80)",
  Legs: "rgba(111,212,154,0.80)",
  "Push-Up SESH": "rgba(255,193,92,0.80)",
};

export default function WeekCalendar({
  weekDays,
  weekNum,
  weekRange,
  weekSessionCount,
  upNextPlanId,
}: {
  weekDays: WeekDay[];
  weekNum: string;
  weekRange: string;
  weekSessionCount: number;
  upNextPlanId: number;
}) {
  const [allSessions, setAllSessions] = useState<SessionSummary[] | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [modalSession, setModalSession] = useState<SessionSummary | null>(null);
  const [showAll, setShowAll] = useState(false);

  async function ensureSessions(): Promise<SessionSummary[]> {
    if (allSessions) return allSessions;
    setLoadingSessions(true);
    try {
      const r = await fetch("/api/workouts/history");
      const data: SessionSummary[] = await r.json();
      const list = Array.isArray(data) ? data : [];
      setAllSessions(list);
      return list;
    } catch {
      setAllSessions([]);
      return [];
    } finally {
      setLoadingSessions(false);
    }
  }

  async function handleDayClick(day: WeekDay) {
    if (!day.sessionId) return;
    const list = await ensureSessions();
    const found = list.find((s) => s.id === day.sessionId);
    if (found) setModalSession(found);
  }

  async function handleViewAll() {
    setShowAll(true);
    await ensureSessions();
  }

  return (
    <>
      <div className="cc-card" style={{ marginBottom: 14 }}>
        <div className="cc-card-head">
          <div className="title">Wk {weekNum} · {weekRange}</div>
          <div className="tail">{weekSessionCount} / 7 done</div>
        </div>
        <div className="cc-card-body">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
            {weekDays.map((day) => {
              const accentColor = day.sessionName ? (SESSION_COLOR[day.sessionName] ?? "rgba(124,77,255,0.80)") : null;
              const isClickable = day.sessionId != null || day.isToday;

              const cellInner = (
                <div
                  style={{
                    padding: "12px 6px",
                    textAlign: "left",
                    position: "relative",
                    overflow: "hidden",
                    borderRadius: 10,
                    border: `1px solid ${
                      day.isToday
                        ? "rgba(124,77,255,0.40)"
                        : day.sessionId
                        ? "rgba(124,77,255,0.18)"
                        : "var(--line)"
                    }`,
                    background: day.isToday
                      ? "radial-gradient(70% 80% at 0% 0%, rgba(124,77,255,0.18), transparent 60%), rgba(255,255,255,0.025)"
                      : day.sessionId
                      ? "rgba(124,77,255,0.06)"
                      : "rgba(255,255,255,0.018)",
                    boxShadow: day.isToday
                      ? "0 0 20px rgba(124,77,255,0.18), inset 0 0 10px rgba(124,77,255,0.06)"
                      : "none",
                    cursor: isClickable ? "pointer" : "default",
                    transition: "border-color 0.15s, background 0.15s",
                  }}
                >
                  {day.isToday && (
                    <span
                      style={{
                        position: "absolute", top: 5, right: 5,
                        fontSize: 7, fontFamily: "var(--f-mono)",
                        color: "var(--cyan)", letterSpacing: "0.10em",
                      }}
                    >
                      NOW
                    </span>
                  )}
                  {day.sessionId && !day.isToday && (
                    <span
                      style={{
                        position: "absolute", bottom: 0, left: 0, right: 0,
                        height: 2, background: accentColor ?? "var(--violet)",
                        opacity: 0.6,
                      }}
                    />
                  )}
                  <div
                    style={{
                      fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase" as const,
                      color: "var(--ink-3)", fontWeight: 600,
                    }}
                  >
                    {day.dow}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 500, marginTop: 1, color: "var(--ink)" }}>
                    {day.dnum}
                  </div>
                  <div
                    style={{
                      marginTop: 8, fontSize: 11,
                      color: day.isToday
                        ? "var(--violet)"
                        : day.sessionId
                        ? accentColor!
                        : "var(--ink-4)",
                    }}
                  >
                    {day.sessionName ? "🏋" : day.isToday ? "▶" : day.isRest ? "-" : "·"}
                  </div>
                  <div
                    style={{
                      fontSize: 10, fontWeight: 500, marginTop: 4, lineHeight: 1.2,
                      color: day.isToday
                        ? "var(--ink)"
                        : day.sessionId
                        ? "var(--ink-2)"
                        : day.isRest
                        ? "var(--ink-3)"
                        : "var(--ink-4)",
                    }}
                  >
                    {day.isToday ? "Start" : day.sessionName ?? (day.isRest ? "Rest" : "-")}
                  </div>
                </div>
              );

              if (day.isToday) {
                return (
                  <Link
                    key={day.dateStr}
                    href={`/workouts/session/new?planId=${upNextPlanId}`}
                    style={{ textDecoration: "none" }}
                  >
                    {cellInner}
                  </Link>
                );
              }
              return (
                <div
                  key={day.dateStr}
                  onClick={day.sessionId ? () => handleDayClick(day) : undefined}
                >
                  {cellInner}
                </div>
              );
            })}
          </div>

          <button
            onClick={handleViewAll}
            style={{
              marginTop: 12, fontSize: 11, color: "var(--ink-4)", background: "none",
              border: "none", cursor: "pointer", letterSpacing: "0.04em", padding: 0,
              fontFamily: "var(--f-sans)",
            }}
          >
            View all sessions →
          </button>
        </div>
      </div>

      {/* Session detail modal */}
      {modalSession && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.70)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
          }}
          onClick={() => setModalSession(null)}
        >
          <div className="cc-card" style={{ width: 380 }} onClick={(e) => e.stopPropagation()}>
            <div className="cc-card-head">
              <div className="title" style={{ color: SESSION_COLOR[modalSession.sessionName] ?? "var(--ink)" }}>
                {modalSession.sessionName}
              </div>
              <button
                onClick={() => setModalSession(null)}
                style={{ background: "none", border: "none", color: "var(--ink-4)", fontSize: 18, cursor: "pointer" }}
              >
                ×
              </button>
            </div>
            <div className="cc-card-body">
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 16, letterSpacing: "0.02em" }}>
                {modalSession.date}
              </div>
              <div
                style={{
                  display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0,
                  borderTop: "1px solid var(--line)", paddingTop: 14,
                }}
              >
                <div style={{ paddingRight: 12, borderRight: "1px solid var(--line)" }}>
                  <div style={{ fontSize: 9.5, letterSpacing: "0.16em", textTransform: "uppercase" as const, color: "var(--ink-3)" }}>
                    Duration
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 300, fontFamily: "var(--f-mono)", marginTop: 6, color: "var(--ink)" }}>
                    {formatDuration(modalSession.durationSeconds)}
                  </div>
                </div>
                <div style={{ padding: "0 12px", borderRight: "1px solid var(--line)" }}>
                  <div style={{ fontSize: 9.5, letterSpacing: "0.16em", textTransform: "uppercase" as const, color: "var(--ink-3)" }}>
                    Sets
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 300, fontFamily: "var(--f-mono)", marginTop: 6, color: "var(--ink)" }}>
                    {modalSession.setCount}
                  </div>
                </div>
                <div style={{ paddingLeft: 12 }}>
                  <div style={{ fontSize: 9.5, letterSpacing: "0.16em", textTransform: "uppercase" as const, color: "var(--ink-3)" }}>
                    Volume
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 300, fontFamily: "var(--f-mono)", marginTop: 6, color: "var(--ink)" }}>
                    {modalSession.totalVolume > 0
                      ? `${(modalSession.totalVolume / 1000).toFixed(1)}k`
                      : "-"}
                    {modalSession.totalVolume > 0 && (
                      <span style={{ fontSize: 12, color: "var(--ink-3)" }}> kg</span>
                    )}
                  </div>
                </div>
              </div>
              {modalSession.notes && (
                <div
                  style={{
                    marginTop: 16, padding: "10px 14px", borderRadius: 8,
                    background: "rgba(255,255,255,0.03)", fontSize: 12, color: "var(--ink-3)",
                    border: "1px solid var(--line)",
                  }}
                >
                  {modalSession.notes}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* All sessions drawer */}
      {showAll && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.60)", zIndex: 200,
          }}
          onClick={() => setShowAll(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed", top: 0, right: 0, bottom: 0, width: 420,
              background: "var(--bg-card)", borderLeft: "1px solid var(--line)",
              overflowY: "auto", padding: "24px 20px",
            }}
          >
            <div
              style={{
                display: "flex", justifyContent: "space-between",
                alignItems: "center", marginBottom: 20,
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 500 }}>All Sessions</div>
              <button
                onClick={() => setShowAll(false)}
                style={{ background: "none", border: "none", color: "var(--ink-4)", fontSize: 20, cursor: "pointer" }}
              >
                ×
              </button>
            </div>
            {loadingSessions && (
              <div style={{ color: "var(--ink-4)", fontSize: 13 }}>Loading…</div>
            )}
            {allSessions && allSessions.map((s) => {
              const color = SESSION_COLOR[s.sessionName] ?? "rgba(124,77,255,0.80)";
              return (
                <div
                  key={s.id}
                  style={{
                    padding: "12px 14px", marginBottom: 8, borderRadius: 10,
                    border: "1px solid var(--line)", background: "rgba(255,255,255,0.018)",
                    position: "relative", overflow: "hidden",
                  }}
                >
                  <span
                    style={{
                      position: "absolute", top: 0, left: 0, bottom: 0, width: 3,
                      background: color, borderRadius: "10px 0 0 10px",
                    }}
                  />
                  <div style={{ paddingLeft: 8 }}>
                    <div
                      style={{
                        display: "flex", justifyContent: "space-between", alignItems: "baseline",
                      }}
                    >
                      <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>
                        {s.sessionName}
                      </div>
                      <div
                        style={{
                          fontSize: 11, color: "var(--ink-4)",
                          fontFamily: "var(--f-mono)", letterSpacing: "0.04em",
                        }}
                      >
                        {s.date}
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex", gap: 14, marginTop: 5,
                        fontSize: 11, color: "var(--ink-3)",
                      }}
                    >
                      <span>{formatDuration(s.durationSeconds)}</span>
                      <span>{s.setCount} sets</span>
                      {s.totalVolume > 0 && (
                        <span>{Math.round(s.totalVolume).toLocaleString()} kg</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
