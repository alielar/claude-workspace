"use client";

/**
 * The two video cards News and Today share (2026-10-04): PickCard = a daily pick as a big card
 * (News), VideoRow = one compact row (News' watch-later list, Today's "Daily picks" card). Tap
 * opens YouTube externally and marks the video watched.
 */

import { watchUrl } from "@/lib/news/useVideos";
import type { Video } from "@/lib/news/videos";

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const fmtLen = (s: number | null) => (s ? (s >= 3600 ? `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}` : `${Math.round(s / 60)} min`) : "");
export function ago(ms: number, now: number): string {
  const h = Math.max(0, Math.round((now - ms) / 3600_000));
  if (h < 1) return "just now";
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} d ago`;
}
// ─── Video cards ──────────────────────────────────────────────────────────────

/** A big card · the daily picks. */
export function PickCard({ label, v, onWatch, now }: { label: string; v: Video | null; onWatch: (id: string) => void; now: number }) {
  if (!v) return (
    <div className="cc-card" style={{ padding: 14, display: "grid", gap: 6 }}>
      <span style={{ fontSize: 12.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-4)", fontFamily: "var(--f-mono)" }}>{label}</span>
      <span style={{ fontSize: 15, color: "var(--ink-3)" }}>Nothing new yet</span>
    </div>
  );
  return (
    <a href={watchUrl(v.videoId)} target="_blank" rel="noopener noreferrer" onClick={() => { if (!v.watched) onWatch(v.videoId); }} className="cc-card news-pick"
      style={{ display: "grid", textDecoration: "none", color: "inherit", overflow: "hidden", opacity: v.watched ? 0.6 : 1 }}>
      <span style={{ position: "relative", display: "block", aspectRatio: "16 / 9", background: "var(--fill-2)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- YouTube thumbnail, plain <img> keeps the bundle small */}
        <img src={v.thumbnail} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        <span style={{ position: "absolute", left: 10, top: 10, fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600, color: "#fff", background: "rgba(0,0,0,.55)", padding: "4px 8px", borderRadius: 7, fontFamily: "var(--f-mono)" }}>{label}</span>
        {v.durationSec ? <span style={{ position: "absolute", right: 10, bottom: 10, fontSize: 12.5, fontWeight: 600, color: "#fff", background: "rgba(0,0,0,.7)", padding: "3px 7px", borderRadius: 6, fontFamily: "var(--f-mono)" }}>{fmtLen(v.durationSec)}</span> : null}
        <span aria-hidden style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
          <span style={{ width: 52, height: 52, borderRadius: 99, background: v.watched ? "rgba(0,0,0,.5)" : "rgba(0,0,0,.6)", display: "grid", placeItems: "center", color: "#fff", fontSize: 20, paddingLeft: v.watched ? 0 : 3 }}>{v.watched ? "✓" : "▶"}</span>
        </span>
      </span>
      <span style={{ display: "grid", gap: 4, padding: "12px 14px 14px" }}>
        <span style={{ fontSize: 16.5, fontWeight: 600, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" } as React.CSSProperties}>{v.title}</span>
        <span style={{ fontSize: 14, color: "var(--ink-3)" }}>{v.channel} · {ago(v.publishedAt, now)}{v.watched ? " · watched" : ""}</span>
      </span>
    </a>
  );
}

/** A row card · watch later on News, the two daily picks on Today (`label` replaces the channel line there). */
export function VideoRow({ v, onWatch, now, label, last = false }: { v: Video; onWatch: (id: string) => void; now: number; label?: string; last?: boolean }) {
  return (
    <a href={watchUrl(v.videoId)} target="_blank" rel="noopener noreferrer" onClick={() => onWatch(v.videoId)} className="news-later"
      style={{ display: "grid", gridTemplateColumns: "128px 1fr", gap: 12, alignItems: "center", padding: "10px 14px", textDecoration: "none", color: "inherit", borderBottom: last ? "none" : "1px solid var(--line)", opacity: v.watched ? 0.6 : 1 }}>
      <span style={{ position: "relative", display: "block", aspectRatio: "16 / 9", borderRadius: 10, overflow: "hidden", background: "var(--fill-2)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- YouTube thumbnail */}
        <img src={v.thumbnail} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        {v.durationSec ? <span style={{ position: "absolute", right: 5, bottom: 5, fontSize: 11.5, fontWeight: 600, color: "#fff", background: "rgba(0,0,0,.7)", padding: "2px 5px", borderRadius: 5, fontFamily: "var(--f-mono)" }}>{fmtLen(v.durationSec)}</span> : null}
      </span>
      <span style={{ minWidth: 0, display: "grid", gap: 3 }}>
        <span style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" } as React.CSSProperties}>{v.title}</span>
        <span style={{ fontSize: 13.5, color: "var(--ink-3)" }}>{label ? <span style={{ color: "var(--violet)", fontWeight: 500 }}>{label} · </span> : null}{v.channel} · {ago(v.publishedAt, now)}{v.watched ? " · watched" : ""}</span>
      </span>
    </a>
  );
}

