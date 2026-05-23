"use client";

/**
 * Dashboard checklist card — interactive inline toggle.
 *
 * Receives pre-fetched items + completedIds from the server, handles
 * optimistic toggling without page reload. Navigates to /checklist on title click.
 */

import { useState } from "react";
import Link from "next/link";

type Item = {
  id: number;
  title: string;
  emoji: string | null;
  source?: "manual" | "workout";
};

interface Props {
  items: Item[];
  completedIds: Set<number>;
  total: number;
}

export function ChecklistCard({ items, completedIds: initialCompleted, total }: Props) {
  const [completed, setCompleted] = useState<Set<number>>(new Set(initialCompleted));

  const done = completed.size;
  const pct  = total > 0 ? Math.round((done / total) * 100) : 0;

  const toggle = async (itemId: number) => {
    // Optimistic UI
    setCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
    // Persist
    try {
      await fetch("/api/checklist/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
    } catch {
      // Rollback on network error
      setCompleted((prev) => {
        const next = new Set(prev);
        if (next.has(itemId)) next.delete(itemId);
        else next.add(itemId);
        return next;
      });
    }
  };

  const allDone = total > 0 && done === total;

  return (
    <div className="cc-card" style={{ padding: 22, height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10.5, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)" }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--violet)", boxShadow: "0 0 6px var(--violet)", flexShrink: 0 }} />
          Today · Checklist
        </div>
        <Link href="/checklist" style={{ fontSize: 11, color: "var(--ink-3)", textDecoration: "none" }}>
          {done} / {total}
        </Link>
      </div>

      {/* Progress hero */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
        <div
          className="tabular-nums"
          style={{
            fontSize: 52, fontWeight: 200, letterSpacing: "-0.04em", lineHeight: 1,
            background: allDone ? "var(--grad)" : "var(--grad)",
            WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
            transition: "filter 0.4s ease",
            filter: allDone ? "drop-shadow(0 0 16px rgba(124,77,255,0.60))" : "none",
          }}
        >
          {pct}<span style={{ fontSize: 20, WebkitTextFillColor: "var(--ink-3)", color: "var(--ink-3)" }}>%</span>
        </div>
        {allDone && (
          <span style={{ fontSize: 11, color: "var(--pos)", fontFamily: "var(--f-mono)", letterSpacing: "0.06em" }}>✓ ALL DONE</span>
        )}
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, background: "rgba(255,255,255,0.04)", borderRadius: 99, marginBottom: 16, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct}%`, borderRadius: 99,
          background: "var(--grad)",
          boxShadow: pct > 0 ? "0 0 12px rgba(124,77,255,0.40)" : "none",
          transition: "width 0.25s var(--easeOut)",
        }} />
      </div>

      {/* Item list */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {items.length === 0 ? (
          <Link href="/checklist" style={{ fontSize: 13, color: "var(--ink-3)", textDecoration: "none" }}>
            Set up your checklist →
          </Link>
        ) : (
          items.map((item, idx) => {
            const isDone = completed.has(item.id);
            return (
              <div
                key={item.id}
                onClick={() => item.source !== "workout" && toggle(item.id)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "22px 1fr",
                  gap: 10,
                  alignItems: "center",
                  padding: "9px 0",
                  borderBottom: idx < items.length - 1 ? "1px solid var(--line)" : "none",
                  cursor: item.source !== "workout" ? "pointer" : "default",
                  opacity: isDone ? 0.55 : 1,
                  transition: "opacity 0.2s ease",
                  userSelect: "none",
                }}
              >
                {/* Checkbox */}
                <span style={{
                  width: 18, height: 18, border: `1.4px solid ${isDone ? "transparent" : "var(--line-hi)"}`,
                  borderRadius: 6, display: "inline-flex", alignItems: "center", justifyContent: "center",
                  background: isDone ? "var(--grad)" : item.source === "workout" ? "rgba(100,255,218,0.04)" : "rgba(255,255,255,0.02)",
                  boxShadow: isDone ? "0 0 10px rgba(124,77,255,0.50)" : "none",
                  borderStyle: item.source === "workout" ? "dashed" : "solid",
                  borderColor: item.source === "workout" && !isDone ? "rgba(100,255,218,0.30)" : undefined,
                  flexShrink: 0, transition: "all 0.2s ease",
                }}>
                  {isDone && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0A0A14" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                {/* Label */}
                <span style={{
                  fontSize: 13, color: isDone ? "var(--ink-3)" : "var(--ink)",
                  textDecoration: isDone ? "line-through" : "none",
                  textDecorationColor: "var(--ink-5)",
                  textDecorationThickness: "1px",
                  transition: "color 0.2s ease",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {item.emoji ? `${item.emoji} ` : ""}{item.title}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
