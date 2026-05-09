/**
 * /workouts — Session selector page.
 * Shows the PPL session templates with next-up indicator.
 * If not seeded, shows a setup card with a seed button.
 */

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { workoutSessions, workoutPrograms, workoutLogs } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { ChevronRight, Clock, Play } from "lucide-react";
import SeedWorkoutsButton from "@/components/workouts/SeedWorkoutsButton";

const SESSION_COLORS: Record<string, string> = {
  Push:           "#f59e0b",
  Pull:           "#60a5fa",
  Legs:           "#4ade80",
  Core:           "#f472b6",
  "Push-Up Skill":"#a78bfa",
};

const SESSION_EMOJI: Record<string, string> = {
  Push:           "💪",
  Pull:           "🔙",
  Legs:           "🦵",
  Core:           "🔥",
  "Push-Up Skill":"⬆️",
};

const SESSION_DURATION: Record<string, string> = {
  Push:           "45–60 min",
  Pull:           "45–60 min",
  Legs:           "45–60 min",
  Core:           "20 min",
  "Push-Up Skill":"15 min",
};

export default async function WorkoutsPage() {
  const session = await auth();
  const userId = session!.user!.id!;

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

  const ROTATION = ["Push", "Pull", "Legs", "Core", "Push", "Pull", "Push-Up Skill"];
  const lastSessionName = lastLog
    ? allSessions.find((s) => s.workout_sessions.id === lastLog.sessionId)?.workout_sessions.name
    : null;

  const lastIdx = lastSessionName ? ROTATION.lastIndexOf(lastSessionName) : -1;
  const nextSessionName = ROTATION[(lastIdx + 1) % ROTATION.length];

  return (
    <div className="page-enter p-5 md:p-10 max-w-2xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Workouts
          </h1>
          {nextSessionName && allSessions.length > 0 && (
            <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
              Up next:{" "}
              <span style={{ color: SESSION_COLORS[nextSessionName] ?? "var(--workout-color)" }}>
                {nextSessionName}
              </span>
            </p>
          )}
        </div>
        <Link
          href="/workouts/history"
          className="btn btn-ghost text-sm"
        >
          History
        </Link>
      </div>

      {/* Empty state — not seeded */}
      {allSessions.length === 0 && (
        <div className="glass rounded-2xl p-8 text-center space-y-4">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mx-auto"
            style={{ background: "rgba(245,158,11,0.12)" }}
          >
            🏋️
          </div>
          <div>
            <p className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
              Set up your PPL program
            </p>
            <p className="text-sm mt-1.5" style={{ color: "var(--text-muted)" }}>
              Load the Push / Pull / Legs rotation with progressive overload tracking.
            </p>
          </div>
          <SeedWorkoutsButton />
        </div>
      )}

      {/* Quick-start: next session */}
      {allSessions.length > 0 && (() => {
        const nextSession = allSessions.find((s) => s.workout_sessions.name === nextSessionName);
        if (!nextSession) return null;
        const color = SESSION_COLORS[nextSessionName] ?? "#f59e0b";
        return (
          <Link href={`/workouts/session/${nextSession.workout_sessions.id}`} className="block">
            <div
              className="glass card-hover rounded-2xl p-5 cursor-pointer"
              style={{ borderColor: `${color}28` }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                    style={{ background: `${color}15` }}
                  >
                    {SESSION_EMOJI[nextSessionName] ?? "💪"}
                  </div>
                  <div>
                    <p className="section-label mb-1" style={{ color }}>Up Next</p>
                    <p className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
                      {nextSessionName}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Clock size={11} style={{ color: "var(--text-muted)" }} />
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {SESSION_DURATION[nextSessionName] ?? "~45 min"}
                      </span>
                    </div>
                  </div>
                </div>
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: `${color}15` }}
                >
                  <Play size={16} fill={color} style={{ color }} />
                </div>
              </div>
            </div>
          </Link>
        );
      })()}

      {/* All sessions */}
      {allSessions.length > 0 && (
        <div className="space-y-2">
          <p className="section-label px-1 mb-3">All Sessions</p>
          {allSessions.map(({ workout_sessions: ws }) => {
            const color = SESSION_COLORS[ws.name] ?? "var(--accent)";
            const isNext = ws.name === nextSessionName;
            return (
              <Link key={ws.id} href={`/workouts/session/${ws.id}`} className="block">
                <div className="glass card-hover rounded-xl p-4 flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                      style={{ background: `${color}14` }}
                    >
                      {SESSION_EMOJI[ws.name] ?? "🏋️"}
                    </div>
                    <div>
                      <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                        {ws.name}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Clock size={10} style={{ color: "var(--text-muted)" }} />
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {SESSION_DURATION[ws.name] ?? "~45 min"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isNext && (
                      <span
                        className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                        style={{ background: `${color}18`, color }}
                      >
                        NEXT
                      </span>
                    )}
                    <ChevronRight size={15} style={{ color: "var(--text-muted)" }} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Running log shortcut */}
      <div className="glass rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
            style={{ background: "rgba(52,211,153,0.1)" }}
          >
            🏃
          </div>
          <div>
            <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
              Running
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Track 5K progress
            </p>
          </div>
        </div>
        <Link
          href="/workouts/history"
          className="text-sm px-4 py-2 rounded-xl font-medium transition-opacity hover:opacity-80"
          style={{ background: "rgba(52,211,153,0.1)", color: "var(--calendar-color)" }}
        >
          Log Run
        </Link>
      </div>
    </div>
  );
}
