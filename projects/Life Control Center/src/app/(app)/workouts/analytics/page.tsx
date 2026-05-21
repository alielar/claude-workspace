"use server";
/**
 * /workouts/analytics — Dedicated analytics route
 * Change 5 will rebuild this with 5 chart sections.
 * Shell ready: Volume · Weekly Trend · Exercise Progression · PR Timeline · Heatmap
 */

import { auth } from "@/lib/auth";
import Link from "next/link";

export default async function WorkoutsAnalyticsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  return (
    <div style={{ padding: "28px 32px 64px", maxWidth: 1100, margin: "0 auto" }}>
      <div className="cc-pagetitle" style={{ marginBottom: 28 }}>
        <div>
          <h1>Analytics<span className="grad-text">.</span></h1>
          <div className="sub">Volume · Progression · PRs · Consistency</div>
        </div>
        <Link href="/workouts" className="cc-btn" style={{ alignSelf: "flex-start" }}>
          ← Workouts
        </Link>
      </div>

      {/* Placeholder sections — rebuilt in Change 5 */}
      {[
        { title: "Volume per Muscle Group", sub: "Sets this week vs MEV / MAV / MRV zones" },
        { title: "Weekly Volume Trend", sub: "Total tonnage · last 12 weeks" },
        { title: "Exercise Progression", sub: "Best weight or est. 1RM over time" },
        { title: "PR Timeline", sub: "Lifetime personal records · reverse chronological" },
        { title: "Consistency Heatmap", sub: "Year view · completion vs skipped" },
      ].map(({ title, sub }) => (
        <div
          key={title}
          className="cc-card"
          style={{ marginBottom: 14, opacity: 0.5 }}
        >
          <div className="cc-card-head">
            <div className="title">{title}</div>
            <div className="tail">{sub}</div>
          </div>
          <div
            className="cc-card-body"
            style={{
              height: 180, display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--ink-4)", fontSize: 12, fontFamily: "var(--f-mono)",
              letterSpacing: "0.06em",
            }}
          >
            coming in Change 5
          </div>
        </div>
      ))}
    </div>
  );
}
