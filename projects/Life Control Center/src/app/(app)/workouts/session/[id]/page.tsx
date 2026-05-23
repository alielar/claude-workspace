"use client";

/**
 * /workouts/session/[id] — Active workout session page. V2 Ambient Futurism.
 * Thin wrapper: loads session data + progression suggestions, then renders ActiveWorkoutLogger.
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ActiveWorkoutLogger from "@/components/workouts/ActiveWorkoutLogger";

export default function SessionPage() {
  const { id }   = useParams<{ id: string }>();
  const router   = useRouter();
  const [session, setSession]         = useState<any>(null);
  const [suggestions, setSuggestions] = useState<Record<string, any>>({});
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/workouts/sessions/${id}`).then((r) => r.json()),
      fetch(`/api/workouts/suggestions?sessionId=${id}`).then((r) => r.json()),
    ]).then(([s, sugg]) => {
      setSession(s);
      setSuggestions(sugg);
      setLoading(false);
    });
  }, [id]);

  const handleFinish = async (log: any) => {
    await fetch("/api/workouts/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(log),
    });
    router.push("/workouts?finished=1");
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", flexDirection: "column", gap: 12 }}>
        <div style={{
          width: 32, height: 32, borderRadius: "99px",
          border: "2px solid var(--line-hi)",
          borderTopColor: "var(--violet)",
          animation: "spin 0.8s linear infinite",
        }} />
        <div style={{ fontSize: 12, color: "var(--ink-4)", letterSpacing: "0.10em", textTransform: "uppercase", fontFamily: "var(--f-mono)" }}>
          Loading session…
        </div>
        <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div className="cc-card" style={{ padding: "32px 48px", textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "var(--ink-2)", marginBottom: 16 }}>Session not found.</div>
          <button className="cc-btn" onClick={() => router.push("/workouts")}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            Back to workouts
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Progression suggestion banner */}
      {Object.keys(suggestions).length > 0 && (
        <div style={{
          padding: "10px 20px", fontSize: 12, letterSpacing: "0.04em",
          background: "rgba(124,77,255,0.08)",
          color: "var(--violet)",
          borderBottom: "1px solid rgba(124,77,255,0.20)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ width: 5, height: 5, borderRadius: "99px", background: "var(--violet)", boxShadow: "0 0 6px var(--violet)", display: "inline-block" }} />
          Suggestions from last session loaded. See weight hints in each exercise
        </div>
      )}

      <ActiveWorkoutLogger
        sessionId={parseInt(id)}
        sessionName={session.name}
        exercises={session.exercises.map((ex: any) => ({
          ...ex,
          suggestedWeightKg: suggestions[ex.name]?.suggestedWeightKg ?? null,
          suggestionMessage: suggestions[ex.name]?.message ?? null,
        }))}
        onFinish={handleFinish}
      />
    </div>
  );
}
