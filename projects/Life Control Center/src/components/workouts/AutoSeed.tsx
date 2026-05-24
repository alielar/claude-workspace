"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Auto-seeds workout plans + history when the page has no plans.
 * Renders a loading state while seeding, then refreshes.
 */
export default function AutoSeed() {
  const [seeding, setSeeding] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    async function seed() {
      try {
        const res = await fetch("/api/workouts/seed-history", { method: "POST" });
        if (res.ok && !cancelled) {
          router.refresh();
        }
      } catch {
        // silently fail — user can manually create
      } finally {
        if (!cancelled) setSeeding(false);
      }
    }
    seed();
    return () => { cancelled = true; };
  }, [router]);

  if (!seeding) return null;

  return (
    <div className="cc-card" style={{ padding: 0, overflow: "visible" }}>
      <div style={{
        padding: "48px 40px", textAlign: "center",
        background: `
          radial-gradient(50% 60% at 50% 0%, rgba(124,77,255,0.08), transparent 70%),
          var(--bg-card)`,
      }}>
        <div className="cc-grad-text" style={{
          fontSize: 48, fontWeight: 200, letterSpacing: "-0.04em",
        }}>
          Setting up your program
        </div>
        <p style={{ color: "var(--ink-3)", fontSize: 14, lineHeight: 1.6, maxWidth: 420, margin: "0 auto 12px" }}>
          Creating your workouts and seeding training history...
        </p>
        <div style={{ width: 24, height: 24, margin: "0 auto", border: "2px solid var(--line)", borderTopColor: "var(--violet)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      </div>
    </div>
  );
}
