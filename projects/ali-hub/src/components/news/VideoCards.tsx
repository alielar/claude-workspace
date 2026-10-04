"use client";

/**
 * The video cards News and Today share (2026-10-04): PickCard = a daily pick as a big card
 * (News), VideoRow = one compact row (News' lists, Today's "Daily picks" card). Tapping the
 * thumbnail or title opens YouTube and marks NOTHING (Ali 2026-10-04: "I click it and come back,
 * I didn't finish it"); the tick on the right marks it watched by hand, and unmarks it again.
 * Every card shows the length when YouTube has given it.
 */

import { watchUrl } from "@/lib/news/useVideos";
import type { Video } from "@/lib/news/videos";

export const fmtLen = (s: number | null) => (s ? (s >= 3600 ? `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}` : `${Math.round(s / 60)} min`) : "");
export function ago(ms: number, now: number): string {
  const h = Math.max(0, Math.round((now - ms) / 3600_000));
  if (h < 1) return "just now";
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} d ago`;
}

/** The watched tick · same box as everywhere, 44 px target · shared with the football highlights. */
export function WatchedTick({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(); }} aria-pressed={on} aria-label={on ? `${label} · mark as not watched` : `${label} · mark as watched`}
      style={{ width: 44, minHeight: 44, background: "transparent", border: "none", display: "grid", placeItems: "center", cursor: "pointer", padding: 0, WebkitTapHighlightColor: "transparent", alignSelf: "center" }}>
      <span aria-hidden style={{ width: 24, height: 24, borderRadius: 8, border: `2px solid ${on ? "transparent" : "var(--line-strong)"}`, background: on ? "var(--pos)" : "var(--fill-1)", display: "inline-grid", placeItems: "center", transition: "background .15s, border-color .15s" }}>
        {on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#06060B" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
      </span>
    </button>
  );
}

/** A big card · the daily picks. */
export function PickCard({ label, v, onWatch, now }: { label: string; v: Video | null; onWatch: (id: string, watched: boolean) => void; now: number }) {
  if (!v) return (
    <div className="cc-card" style={{ padding: 14, display: "grid", gap: 6 }}>
      <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-3)" }}>{label}</span>
      <span style={{ fontSize: 15, color: "var(--ink-3)" }}>Nothing new yet</span>
    </div>
  );
  return (
    <div className="cc-card news-pick" style={{ display: "grid", overflow: "hidden", opacity: v.watched ? 0.6 : 1 }}>
      <a href={watchUrl(v.videoId)} target="_blank" rel="noopener noreferrer" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
        <span style={{ position: "relative", display: "block", aspectRatio: "16 / 9", background: "var(--fill-2)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- YouTube thumbnail, plain <img> keeps the bundle small */}
          <img src={v.thumbnail} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          <span style={{ position: "absolute", left: 10, top: 10, fontSize: 12.5, fontWeight: 600, color: "#fff", background: "rgba(0,0,0,.55)", padding: "4px 8px", borderRadius: 7 }}>{label}</span>
          {v.durationSec ? <span style={{ position: "absolute", right: 10, bottom: 10, fontSize: 12.5, fontWeight: 600, color: "#fff", background: "rgba(0,0,0,.7)", padding: "3px 7px", borderRadius: 6, fontFamily: "var(--f-mono)" }}>{fmtLen(v.durationSec)}</span> : null}
          <span aria-hidden style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
            <span style={{ width: 52, height: 52, borderRadius: 99, background: "rgba(0,0,0,.6)", display: "grid", placeItems: "center", color: "#fff", fontSize: 20, paddingLeft: 3 }}>▶</span>
          </span>
        </span>
      </a>
      <span style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", padding: "10px 6px 10px 14px" }}>
        <a href={watchUrl(v.videoId)} target="_blank" rel="noopener noreferrer" style={{ display: "grid", gap: 4, textDecoration: "none", color: "inherit", minWidth: 0 }}>
          <span style={{ fontSize: 16.5, fontWeight: 600, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" } as React.CSSProperties}>{v.title}</span>
          <span style={{ fontSize: 14, color: "var(--ink-3)" }}>{v.channel} · {ago(v.publishedAt, now)}{v.durationSec ? ` · ${fmtLen(v.durationSec)}` : ""}{v.watched ? " · watched" : ""}</span>
        </a>
        <WatchedTick on={v.watched} onToggle={() => onWatch(v.videoId, !v.watched)} label={v.title} />
      </span>
    </div>
  );
}

/** A row · watch later and the watched list on News, the two daily picks on Today (`label` leads the channel line there). */
export function VideoRow({ v, onWatch, now, label, last = false }: { v: Video; onWatch: (id: string, watched: boolean) => void; now: number; label?: string; last?: boolean }) {
  return (
    <div className="news-later" style={{ display: "grid", gridTemplateColumns: "116px 1fr auto", gap: 10, alignItems: "center", padding: "10px 4px 10px 14px", borderBottom: last ? "none" : "1px solid var(--line)", opacity: v.watched ? 0.6 : 1 }}>
      <a href={watchUrl(v.videoId)} target="_blank" rel="noopener noreferrer" style={{ position: "relative", display: "block", aspectRatio: "16 / 9", borderRadius: 10, overflow: "hidden", background: "var(--fill-2)" }} aria-label={`Play ${v.title}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- YouTube thumbnail */}
        <img src={v.thumbnail} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        {v.durationSec ? <span style={{ position: "absolute", right: 5, bottom: 5, fontSize: 11.5, fontWeight: 600, color: "#fff", background: "rgba(0,0,0,.7)", padding: "2px 5px", borderRadius: 5, fontFamily: "var(--f-mono)" }}>{fmtLen(v.durationSec)}</span> : null}
      </a>
      <a href={watchUrl(v.videoId)} target="_blank" rel="noopener noreferrer" style={{ minWidth: 0, display: "grid", gap: 3, textDecoration: "none", color: "inherit" }}>
        <span style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" } as React.CSSProperties}>{v.title}</span>
        <span style={{ fontSize: 13.5, color: "var(--ink-3)" }}>{label ? <span style={{ color: "var(--violet)", fontWeight: 500 }}>{label} · </span> : null}{v.channel} · {ago(v.publishedAt, now)}{v.durationSec ? ` · ${fmtLen(v.durationSec)}` : " · length soon"}</span>
      </a>
      <WatchedTick on={v.watched} onToggle={() => onWatch(v.videoId, !v.watched)} label={v.title} />
    </div>
  );
}
