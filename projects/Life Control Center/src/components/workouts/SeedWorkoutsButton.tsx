"use client";

/**
 * One-shot button to seed the PPL workout program for this user.
 * Calls POST /api/workouts/seed, then refreshes the page.
 */

import { useState } from "react";
import { Dumbbell, Loader2, CheckCircle } from "lucide-react";
import { useRouter } from "next/navigation";

export default function SeedWorkoutsButton() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");

  async function handleSeed() {
    setStatus("loading");
    try {
      const res = await fetch("/api/workouts/seed", { method: "POST" });
      if (!res.ok) throw new Error("Seed failed");
      setStatus("done");
      // Brief pause so user sees the success state, then refresh
      setTimeout(() => router.refresh(), 800);
    } catch {
      setStatus("idle");
      alert("Failed to seed workouts. Check the console.");
    }
  }

  return (
    <button
      onClick={handleSeed}
      disabled={status !== "idle"}
      className="btn btn-primary mx-auto"
      style={{ opacity: status !== "idle" ? 0.8 : 1 }}
    >
      {status === "loading" ? (
        <>
          <Loader2 size={14} className="animate-spin" />
          Setting up…
        </>
      ) : status === "done" ? (
        <>
          <CheckCircle size={14} />
          Done!
        </>
      ) : (
        <>
          <Dumbbell size={14} />
          Load PPL Program
        </>
      )}
    </button>
  );
}
