"use client";

import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useRouter } from "next/navigation";

const AnalyticsPanel = lazy(() => import("./AnalyticsPanel"));
const WorkoutsPanel = lazy(() => import("./WorkoutsPanel"));
const ExercisesPanel = lazy(() => import("./ExercisesPanel"));

type DrawerType = "analytics" | "workouts" | "exercises" | null;

const DRAWER_TITLES: Record<Exclude<DrawerType, null>, string> = {
  analytics: "Analytics",
  workouts: "Workouts",
  exercises: "Exercises",
};

export default function WorkoutDrawers({ mode = "pills" }: { mode?: "pills" | "cards" | "hidden" }) {
  const [open, setOpen] = useState<DrawerType>(null);
  // Track which panels have been opened so we can keep them mounted (cached)
  const [mounted, setMounted] = useState<Set<Exclude<DrawerType, null>>>(new Set());
  const drawerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  function openDrawer(key: Exclude<DrawerType, null>) {
    setMounted((prev) => new Set(prev).add(key));
    setOpen(key);
    // Scroll drawer to top after render settles
    setTimeout(() => drawerRef.current?.scrollTo({ top: 0, behavior: "instant" }), 50);
  }

  // Listen for external open requests (e.g. empty state CTA, InfoTiles)
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail && DRAWER_TITLES[detail as Exclude<DrawerType, null>]) {
        openDrawer(detail as Exclude<DrawerType, null>);
      }
    }
    window.addEventListener("open-workout-drawer", handler);
    return () => window.removeEventListener("open-workout-drawer", handler);
  }, [mode]);

  // Listen for data changes from drawer panels and refresh the page
  useEffect(() => {
    function handler() { router.refresh(); }
    window.addEventListener("workouts-data-changed", handler);
    return () => window.removeEventListener("workouts-data-changed", handler);
  }, [router]);

  const items: { key: Exclude<DrawerType, null>; label: string; desc: string }[] = [
    { key: "analytics", label: "Analytics", desc: "Volume, trends, PRs" },
    { key: "workouts", label: "Workouts", desc: "Create and edit workouts" },
    { key: "exercises", label: "Exercises", desc: "Your exercise library" },
  ];

  return (
    <>
      {/* Trigger buttons */}
      {mode === "pills" && (
        <div style={{ display: "flex", gap: 6, alignSelf: "flex-end", paddingBottom: 2 }}>
          {items.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => openDrawer(key)}
              style={{
                padding: "5px 12px", borderRadius: 7, fontSize: 12,
                color: "var(--ink-4)", border: "1px solid var(--line)",
                background: "transparent", cursor: "pointer",
                letterSpacing: "0.02em", transition: "color 0.15s, border-color 0.15s",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Section cards */}
      {mode === "cards" && (
        <div className="workout-section-cards" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 14 }}>
          {items.map(({ key, label, desc }) => (
            <button
              key={key}
              onClick={() => openDrawer(key)}
              className="cc-card"
              style={{
                padding: "18px 20px", cursor: "pointer", textAlign: "left",
                border: "1px solid var(--line)", background: "var(--bg-card)",
                transition: "border-color 0.15s",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 15, fontWeight: 500, letterSpacing: "-0.005em", color: "var(--ink)" }}>{label}</span>
                <span style={{ fontSize: 10, color: "var(--cyan)", letterSpacing: "0.04em" }}>Manage →</span>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--ink-4)", marginTop: 4 }}>{desc}</div>
            </button>
          ))}
        </div>
      )}

      {/* Drawer overlay */}
      {open && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 100,
            background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(null); }}
        >
          <div ref={drawerRef} className="cc-drawer-panel" style={{
            position: "absolute", right: 0, top: 0, bottom: 0,
            width: "100%", maxWidth: 1100,
            background: "var(--bg)", overflowY: "auto",
            borderLeft: "1px solid var(--line)",
          }}>
            {/* Sticky close bar */}
            <div style={{
              position: "sticky", top: 0, zIndex: 10,
              padding: "14px 24px",
              display: "flex", justifyContent: "flex-end",
              background: "var(--bg)",
            }}>
              <button
                onClick={() => setOpen(null)}
                style={{
                  width: 36, height: 36, borderRadius: 10,
                  border: "1px solid var(--line)", background: "var(--bg-card)",
                  color: "var(--ink-3)", cursor: "pointer", fontSize: 18,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                ×
              </button>
            </div>

            {/* Panel content — keep mounted panels alive for caching */}
            <Suspense fallback={
              <div style={{ padding: "40px 24px", color: "var(--ink-4)", fontSize: 13, fontFamily: "var(--f-mono)" }}>
                Loading {DRAWER_TITLES[open]}...
              </div>
            }>
              {mounted.has("analytics") && <div style={{ display: open === "analytics" ? "block" : "none" }}><AnalyticsPanel /></div>}
              {mounted.has("workouts") && <div style={{ display: open === "workouts" ? "block" : "none" }}><WorkoutsPanel /></div>}
              {mounted.has("exercises") && <div style={{ display: open === "exercises" ? "block" : "none" }}><ExercisesPanel /></div>}
            </Suspense>
          </div>
        </div>
      )}
    </>
  );
}
