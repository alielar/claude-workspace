/**
 * /workouts/session/[id] — Active workout session page.
 * Loads the session template + last session's progression suggestions,
 * then renders the ActiveWorkoutLogger.
 */

"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import ActiveWorkoutLogger from "@/components/workouts/ActiveWorkoutLogger";
import { Loader2 } from "lucide-react";

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [suggestions, setSuggestions] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

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
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 size={24} className="animate-spin" style={{ color: "var(--accent)" }} />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p style={{ color: "var(--text-muted)" }}>Session not found.</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full flex flex-col"
    >
      {/* Progression suggestions banner */}
      {Object.keys(suggestions).length > 0 && (
        <div
          className="px-4 py-2 text-xs"
          style={{ background: "var(--accent-dim)", color: "var(--accent-bright)", borderBottom: "1px solid var(--border-accent)" }}
        >
          💡 Suggestions from last session loaded — see weight hints in each exercise
        </div>
      )}

      <ActiveWorkoutLogger
        sessionId={parseInt(id)}
        sessionName={session.name}
        exercises={session.exercises.map((ex: any) => ({
          ...ex,
          // Inject weight suggestion from last session
          suggestedWeightKg: suggestions[ex.name]?.suggestedWeightKg ?? null,
          suggestionMessage: suggestions[ex.name]?.message ?? null,
        }))}
        onFinish={handleFinish}
      />
    </motion.div>
  );
}
