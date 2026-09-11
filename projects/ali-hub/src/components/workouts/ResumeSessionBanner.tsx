"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Props {
  sessionId: number;
  workoutName: string;
  date: string;
}

export default function ResumeSessionBanner({ sessionId, workoutName, date }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      await fetch(`/api/workouts/session/${sessionId}`, { method: "DELETE" });
      router.refresh();
    } catch {
      setDeleting(false);
    }
  }

  return (
    <div className="cc-card" style={{
      marginBottom: 14, padding: "20px 24px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      background: "linear-gradient(135deg, rgba(124,77,255,0.12), rgba(100,255,218,0.06)), var(--bg-card)",
      border: "1px solid rgba(124,77,255,0.30)",
    }}>
      <div>
        <div style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--cyan)", fontFamily: "var(--f-mono)", marginBottom: 4 }}>
          Session in progress
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>
          {workoutName} · {date}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <button
          onClick={handleDelete}
          disabled={deleting}
          style={{
            padding: "10px 16px", borderRadius: 8,
            background: "transparent", border: "1px solid rgba(255,100,100,0.30)",
            color: "var(--neg)", fontSize: 12, fontWeight: 600,
            cursor: deleting ? "wait" : "pointer",
            opacity: deleting ? 0.5 : 1,
          }}
        >
          {deleting ? "…" : "Delete"}
        </button>
        <Link
          href={`/workouts/session/${sessionId}/active`}
          className="cc-btn-primary"
          style={{
            display: "inline-flex", padding: "10px 20px", borderRadius: 8,
            fontSize: 13, fontWeight: 700, textDecoration: "none",
          }}
        >
          Resume
        </Link>
      </div>
    </div>
  );
}
