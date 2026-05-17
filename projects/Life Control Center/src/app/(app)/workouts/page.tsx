/**
 * /workouts — V2 Session selector.
 *
 * Shows PPL sessions with next-up highlight.
 * Empty state → seed button.
 */

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { workoutSessions, workoutPrograms, workoutLogs } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { ChevronRight, Clock, Play, History } from "lucide-react";
import SeedWorkoutsButton from "@/components/workouts/SeedWorkoutsButton";

// ─── V2 colour palette ────────────────────────────────────────────────────────
const SESSION_COLORS: Record<string, string> = {
  Push:            "#FF8A8A",
  Pull:            "#7EE7FF",
  Legs:            "#6FD49A",
  Core:            "#FFC15C",
  "Push-Up Skill": "#B388FF",
};

const SESSION_EMOJI: Record<string, string> = {
  Push:            "💪",
  Pull:            "🔙",
  Legs:            "🦵",
  Core:            "🔥",
  "Push-Up Skill": "⬆️",
};

const SESSION_DURATION: Record<string, string> = {
  Push:            "45–60 min",
  Pull:            "45–60 min",
  Legs:            "45–60 min",
  Core:            "20 min",
  "Push-Up Skill": "15 min",
};

const ROTATION = ["Push", "Pull", "Legs", "Core", "Push", "Pull", "Push-Up Skill"];

export default async function WorkoutsPage() {
  const session = await auth();
  const userId  = session!.user!.id!;

  const allSessions = await db
    .select()
    .from(workoutSessions)
    .innerJoin(workoutPrograms, eq(workoutSessions.programId, workoutPrograms.id))
    .where(eq(workoutPrograms.userId, userId))
    .orderBy(workoutSessions.sortOrder);

  const [lastLog] = await db
    .select()
    .from(workoutLogs)
    .where(eq(workoutLogs.userId, userId))
    .orderBy(desc(workoutLogs.startedAt))
    .limit(1);

  const lastSessionName = lastLog
    ? allSessions.find((s) => s.workout_sessions.id === lastLog.sessionId)?.workout_sessions.name
    : null;

  const lastIdx         = lastSessionName ? ROTATION.lastIndexOf(lastSessionName) : -1;
  const nextSessionName = ROTATION[(lastIdx + 1) % ROTATION.length];
  const nextSession     = allSessions.find((s) => s.workout_sessions.name === nextSessionName);

  return (
    <div className="page-enter p-5 md:p-8 max-w-2xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.02em" }}>
            Workouts
          </h1>
          {nextSessionName && allSessions.length > 0 && (
            <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 3 }}>
              Up next:{" "}
              <span style={{ color: SESSION_COLORS[nextSessionName] ?? "var(--neg)", fontWeight: 600 }}>
                {nextSessionName}
              </span>
            </p>
          )}
        </div>
        <Link href="/workouts/history" className="cc-btn cc-btn-ghost">
          <History size={13} />
          History
        </Link>
      </div>

      {/* Empty state */}
      {allSessions.length === 0 && (
        <div className="cc-card p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mx-auto" style={{ background: "rgba(255,138,138,0.12)" }}>
            🏋️
          </div>
          <div>
            <p style={{ fontSize: 17, fontWeight: 600, color: "var(--ink)" }}>Set up your PPL program</p>
            <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 6 }}>
              Load the Push / Pull / Legs rotation with progressive overload tracking.
            </p>
          </div>
          <SeedWorkoutsButton />
        </div>
      )}

      {/* Next session hero */}
      {nextSession && allSessions.length > 0 && (() => {
        const color = SESSION_COLORS[nextSessionName] ?? "#FF8A8A";
        return (
          <Link href={`/workouts/session/${nextSession.workout_sessions.id}`} className="block mb-4">
            <div
              className="cc-card cc-card-hover p-5"
              style={{
                borderColor: `${color}30`,
                background: `linear-gradient(160deg, var(--bg-card) 0%, ${color}12 100%)`,
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0" style={{ background: `${color}18` }}>
                    {SESSION_EMOJI[nextSessionName] ?? "💪"}
                  </div>
                  <div>
                    <p className="cc-section-label mb-1" style={{ color }}>Up Next</p>
                    <p style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)" }}>{nextSessionName}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Clock size={11} style={{ color: "var(--ink-3)" }} />
                      <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{SESSION_DURATION[nextSessionName] ?? "~45 min"}</span>
                    </div>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}20` }}>
                  <Play size={16} fill={color} style={{ color }} />
                </div>
              </div>
            </div>
          </Link>
        );
      })()}

      {/* All sessions */}
      {allSessions.length > 0 && (
        <div>
          <p className="cc-section-label mb-3 px-1">All Sessions</p>
          <div className="space-y-2">
            {allSessions.map(({ workout_sessions: ws }) => {
              const color  = SESSION_COLORS[ws.name] ?? "var(--violet)";
              const isNext = ws.name === nextSessionName;
              return (
                <Link key={ws.id} href={`/workouts/session/${ws.id}`} className="block">
                  <div className="cc-card cc-card-hover p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ background: `${color}16` }}>
                        {SESSION_EMOJI[ws.name] ?? "🏋️"}
                      </div>
                      <div>
                        <p style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)" }}>{ws.name}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Clock size={10} style={{ color: "var(--ink-3)" }} />
                          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{SESSION_DURATION[ws.name] ?? "~45 min"}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isNext && (
                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ background: `${color}18`, color }}>
                          NEXT
                        </span>
                      )}
                      <ChevronRight size={15} style={{ color: "var(--ink-3)" }} />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Running shortcut */}
      <div className="cc-card p-4 flex items-center justify-between mt-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ background: "rgba(111,212,154,0.12)" }}>
            🏃
          </div>
          <div>
            <p style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)" }}>Running</p>
            <p style={{ fontSize: 12, color: "var(--ink-3)" }}>Track 5K progress</p>
          </div>
        </div>
        <Link href="/workouts/history" className="text-sm px-4 py-2 rounded-xl font-medium transition-opacity hover:opacity-80" style={{ background: "rgba(111,212,154,0.12)", color: "var(--pos)" }}>
          Log Run
        </Link>
      </div>

    </div>
  );
}
