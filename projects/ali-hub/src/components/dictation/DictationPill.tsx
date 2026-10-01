"use client";

/**
 * The dictation running from ALAI, seen from any other screen: a pill above the tab bar with a
 * red dot, the last words as they are heard, Stop, and a tap on the text goes back to ALAI.
 * Renders nothing while idle (and on ALAI itself, where the composer shows the text).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { composed, isDictating, stopDictation, useDict } from "@/lib/dictation/store";

export function DictationPill() {
  const d = useDict();
  const path = usePathname();
  if (!isDictating(d) || path?.startsWith("/alai")) return null;
  const all = composed(d);
  const said = all.length > 80 ? all.slice(-80).replace(/^\S*\s/, "") : all; // the last words, cut at a word
  return (
    <div className="dict-pill" role="status" aria-live="polite">
      <span aria-hidden className="dict-dot" />
      <Link href="/alai" style={{ flex: 1, minWidth: 0, color: "var(--ink)", textDecoration: "none", fontSize: 15, lineHeight: 1.35, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", direction: "ltr" }}>
        {d.status === "connecting" ? "Starting…" : d.status === "stopping" ? "Finishing…" : said ? <>{said.length < all.length ? "…" : ""}{said}</> : "Listening"}
      </Link>
      <button type="button" onClick={stopDictation} className="cc-btn" style={{ minHeight: 40, minWidth: 64, borderRadius: 12, background: "var(--neg)", color: "#fff", border: "none", fontWeight: 600 }}>Stop</button>
    </div>
  );
}
