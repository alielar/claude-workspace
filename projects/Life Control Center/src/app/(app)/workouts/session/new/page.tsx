"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

interface ActiveSession {
  id: number;
  workoutName: string;
  date: string;
}

function NewSessionInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planId = searchParams.get("planId");
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!planId) { router.replace("/workouts"); return; }

    // Check for existing active session first
    fetch("/api/workouts/session/active")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.session) {
          setActiveSession(data.session);
          setChecking(false);
        } else {
          // No active session — create new one
          createSession();
        }
      })
      .catch(() => createSession());

    function createSession() {
      setChecking(false);
      fetch("/api/workouts/session/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: parseInt(planId!) }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.sessionId) router.replace(`/workouts/session/${data.sessionId}/active`);
          else router.replace("/workouts");
        })
        .catch(() => router.replace("/workouts"));
    }
  }, [planId, router]);

  function handleStartNew() {
    if (!planId) return;
    // Abandon old session and create new
    if (activeSession) {
      fetch(`/api/workouts/session/${activeSession.id}`, { method: "DELETE" })
        .then(() => {
          setActiveSession(null);
          fetch("/api/workouts/session/new", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ planId: parseInt(planId) }),
          })
            .then((r) => r.json())
            .then((data) => {
              if (data.sessionId) router.replace(`/workouts/session/${data.sessionId}/active`);
              else router.replace("/workouts");
            })
            .catch(() => router.replace("/workouts"));
        })
        .catch(() => router.replace("/workouts"));
    }
  }

  if (activeSession) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "80vh", padding: "0 16px" }}>
        <div className="cc-card" style={{ maxWidth: 400, width: "100%", textAlign: "center" }}>
          <div className="cc-card-head">
            <div className="title">Session in progress</div>
          </div>
          <div className="cc-card-body" style={{ padding: "24px 20px" }}>
            <div style={{ fontSize: 14, color: "var(--ink-2)", marginBottom: 6 }}>
              You have an unfinished session:
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>
              {activeSession.workoutName}
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-4)", fontFamily: "var(--f-mono)", marginBottom: 24 }}>
              {activeSession.date}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Link
                href={`/workouts/session/${activeSession.id}/active`}
                className="cc-btn-primary"
                style={{
                  display: "block", padding: "14px 0", borderRadius: 10,
                  fontSize: 15, fontWeight: 700, textDecoration: "none", textAlign: "center",
                }}
              >
                Resume session
              </Link>
              <button
                onClick={handleStartNew}
                style={{
                  padding: "12px 0", borderRadius: 10,
                  background: "transparent", border: "1px solid var(--line)",
                  color: "var(--ink-4)", fontSize: 13, cursor: "pointer",
                }}
              >
                Discard & start new
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "80vh" }}>
      <div style={{ color: "var(--ink-4)", fontSize: 13, fontFamily: "var(--f-mono)" }}>
        {checking ? "Checking…" : "Starting session…"}
      </div>
    </div>
  );
}

export default function NewSessionPage() {
  return (
    <Suspense>
      <NewSessionInner />
    </Suspense>
  );
}
