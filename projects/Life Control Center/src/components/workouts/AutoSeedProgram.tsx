"use client";

import { useEffect, useState } from "react";

/**
 * Auto-runs the migration + seed on mount when no active program exists.
 * Shows a loading state, then reloads the page once the program is created.
 */
export default function AutoSeedProgram() {
  const [status, setStatus] = useState<"seeding" | "done" | "error">("seeding");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Run migration first (idempotent)
        await fetch("/api/admin/migrate", { method: "POST" });
        if (cancelled) return;

        // Seed the 4-Day Split program
        const res = await fetch("/api/workouts/seed-program", { method: "POST" });
        const data = await res.json();
        if (cancelled) return;

        if (data.success || data.programId) {
          setStatus("done");
          // Reload to show the new program
          window.location.reload();
        } else {
          setStatus("error");
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (status === "error") {
    return (
      <div style={{ marginTop: 16, fontSize: 12, color: "var(--neg)" }}>
        Failed to set up program. Try refreshing the page.
      </div>
    );
  }

  return (
    <div style={{ marginTop: 16, fontSize: 12, color: "var(--ink-3)" }}>
      Setting up your workout program…
    </div>
  );
}
