"use client";

/**
 * Settings → YouTube channels · placeholder until the News rebuild (wave 4, same day) puts the
 * fixed channel list here. Renders one quiet door to News.
 */

import Link from "next/link";

export function ChannelsCard() {
  return (
    <Link href="/news" className="cc-card" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
      <div className="cc-card-body" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", minHeight: 56 }}>
        <span style={{ fontSize: 16, fontWeight: 500 }}>YouTube channels</span>
        <span style={{ color: "var(--ink-3)", fontSize: 15 }}>News ›</span>
      </div>
    </Link>
  );
}
