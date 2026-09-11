"use client";

/**
 * Instagram reel learning link · tappable, opens externally, and dismissible
 * FOREVER: once Ali has mastered a movement he taps ✕ and the link disappears
 * as if it was never there. Dismissed ids live in localStorage["cc-reels-dismissed"].
 * Used by /stretch and /train — reuse this anywhere a reel appears.
 */

import { useEffect, useState } from "react";

const KEY = "cc-reels-dismissed";

function readDismissed(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch { return []; }
}

export function useReelDismissals() {
  const [dismissed, setDismissed] = useState<string[] | null>(null); // null until read → no flash
  useEffect(() => { setDismissed(readDismissed()); }, []);
  const dismiss = (id: string) => {
    const next = [...readDismissed(), id];
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
    setDismissed(next);
  };
  const isDismissed = (id: string) => dismissed === null || dismissed.includes(id);
  return { isDismissed, dismiss, ready: dismissed !== null };
}

export function ReelRow({ id, label, url, onDismiss, dismissed }: {
  id: string; label: string; url: string; dismissed: boolean; onDismiss: (id: string) => void;
}) {
  if (dismissed) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, alignItems: "center" }}>
      <a href={url} target="_blank" rel="noopener noreferrer"
        style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44, padding: "6px 12px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--fill-1)", color: "var(--ink)", textDecoration: "none", fontSize: 15 }}>
        <span aria-hidden style={{ color: "var(--violet)", fontSize: 13 }}>▶</span>
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      </a>
      <button onClick={() => onDismiss(id)} aria-label={`I know this now · remove ${label}`} title="I know this · remove forever"
        style={{ width: 44, minHeight: 44, borderRadius: 10, border: "1px solid var(--line)", background: "transparent", color: "var(--ink-4)", fontSize: 15, cursor: "pointer" }}>
        ✕
      </button>
    </div>
  );
}
