"use client";

/**
 * Morning podcast launcher (2026-09-10) · Today + News.
 *
 * The real player is its own full-screen page at /podcast (like /stretch and
 * /breathe) — this card is just the door: title, length, current chapter, one
 * big Play. Position/speed/heard live in localStorage (cc-podcast-pos/-speed/
 * -heard), shared with the player, so the card can show where he left off.
 *
 * Failure states stay honest: script-only → "voice is down · read it on the
 * player page"; nothing → one quiet line pointing at News.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCached, fetchJson } from "@/lib/local/store";

type Chapter = { title: string; startSec: number };
type Episode = {
  date: string; status: "pending" | "ready" | "failed";
  script: string | null; audioUrl: string | null; attempts: number;
  chapters: Chapter[]; durationSec: number | null;
};

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, "0")}`;

export function heardToday(today: string): boolean {
  try { return localStorage.getItem("cc-podcast-heard") === today; } catch { return false; }
}

export function PodcastCard({ today, hideWhenHeard = false }: { today: string; hideWhenHeard?: boolean }) {
  const { data } = useCached<{ episode: Episode | null }>("podcast-today", () => fetchJson("/api/podcast/today"));
  const ep = data?.episode && data.episode.date === today ? data.episode : null;
  const [heard, setHeard] = useState(false);
  const [resumeSec, setResumeSec] = useState(0);

  useEffect(() => {
    try {
      setHeard(localStorage.getItem("cc-podcast-heard") === today);
      const saved = JSON.parse(localStorage.getItem("cc-podcast-pos") ?? "null") as { date: string; sec: number } | null;
      setResumeSec(saved?.date === today ? saved.sec : 0);
    } catch { /* defaults */ }
  }, [today]);

  if (!ep) return null;
  if (hideWhenHeard && heard) return null;

  const duration = ep.durationSec || 0;
  const chapterCount = ep.chapters?.length ?? 0;

  return (
    <section className="cc-card">
      <div className="cc-card-head">
        <span className="title">Morning brief</span>
        <span className="tail">
          {ep.status === "ready" ? (heard ? "listened ✓" : duration ? fmt(duration) : "podcast") : ep.script ? "voice is down" : "not ready yet"}
        </span>
      </div>
      <div className="cc-card-body">
        {ep.status === "ready" && ep.audioUrl ? (
          <Link href="/podcast" style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 14, alignItems: "center", minHeight: 56, textDecoration: "none", color: "inherit" }}>
            <span aria-hidden style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--violet)", color: "var(--on-accent)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>▶</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 16, fontWeight: 500 }}>
                {resumeSec > 5 && duration ? `Resume at ${fmt(resumeSec)}` : "Listen to today's brief"}
              </span>
              <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)", marginTop: 2 }}>
                {chapterCount ? `${chapterCount} chapters · captions · plays locked` : "captions · plays locked"}
              </span>
            </span>
            <span style={{ color: "var(--ink-3)", fontSize: 15 }}>Open ›</span>
          </Link>
        ) : ep.script ? (
          <Link href="/podcast" style={{ display: "block", textDecoration: "none", color: "inherit", fontSize: 15 }}>
            <span style={{ color: "var(--warn)" }}>The voice is down this morning.</span>{" "}
            <span style={{ color: "var(--violet)" }}>Read the brief instead ›</span>
          </Link>
        ) : (
          <p style={{ margin: 0, fontSize: 15, color: "var(--ink-3)" }}>
            Today&rsquo;s episode isn&rsquo;t ready yet · it retries automatically. The written stories are on <Link href="/news" style={{ color: "var(--violet)" }}>News</Link>.
          </p>
        )}
      </div>
    </section>
  );
}
