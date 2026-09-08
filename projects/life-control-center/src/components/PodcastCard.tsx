"use client";

/**
 * Morning podcast play card (2026-09-08) · Today + News.
 * Ready → play/pause with progress, works with the screen locked (MediaSession).
 * Audio failed but the script exists → "the voice is down" + full script to read
 * + a retry button. Nothing yet → one quiet line. Never a mystery at 7:25.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useCached, fetchJson } from "@/lib/local/store";

type Episode = { date: string; status: "pending" | "ready" | "failed"; script: string | null; audioUrl: string | null; attempts: number };

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function PodcastCard({ today }: { today: string }) {
  const { data, setData } = useCached<{ episode: Episode | null }>("podcast-today", () => fetchJson("/api/podcast/today"));
  const ep = data?.episode && data.episode.date === today ? data.episode : null;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [showScript, setShowScript] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  if (!ep) return null;

  const toggle = () => {
    if (!ep.audioUrl) return;
    if (!audioRef.current) {
      const a = new Audio(ep.audioUrl);
      a.preload = "metadata";
      a.addEventListener("timeupdate", () => setPos(a.currentTime));
      a.addEventListener("durationchange", () => setDur(a.duration || 0));
      a.addEventListener("ended", () => setPlaying(false));
      audioRef.current = a;
      if ("mediaSession" in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({ title: "Morning brief", artist: "A L I", album: ep.date });
        navigator.mediaSession.setActionHandler("play", () => { a.play(); setPlaying(true); });
        navigator.mediaSession.setActionHandler("pause", () => { a.pause(); setPlaying(false); });
      }
    }
    const a = audioRef.current;
    if (a.paused) { a.play().catch(() => {}); setPlaying(true); }
    else { a.pause(); setPlaying(false); }
  };

  const retry = async () => {
    setRetrying(true);
    try {
      const r = await fetch("/api/podcast/retry", { method: "POST" }).then((x) => x.json());
      if (r?.episode) setData({ episode: r.episode });
    } catch { /* the tick keeps retrying anyway */ }
    setRetrying(false);
  };

  return (
    <section className="cc-card">
      <div className="cc-card-head">
        <span className="title">Morning brief</span>
        <span className="tail">{ep.status === "ready" ? (dur ? `${fmt(dur)}` : "podcast") : ep.script ? "voice is down" : "not ready yet"}</span>
      </div>
      <div className="cc-card-body" style={{ display: "grid", gap: 10 }}>
        {ep.status === "ready" && ep.audioUrl && (
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 14, alignItems: "center" }}>
            <button onClick={toggle} aria-label={playing ? "Pause" : "Play the morning brief"}
              style={{ width: 56, height: 56, borderRadius: "50%", border: "none", background: "var(--violet)", color: "var(--on-accent)", fontSize: 22, cursor: "pointer" }}>
              {playing ? "❚❚" : "▶"}
            </button>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, color: "var(--ink-2)" }}>Today&rsquo;s headlines, spoken · plays with the screen locked.</div>
              <div className="cc-progress-track" style={{ height: 4, marginTop: 8 }}>
                <div className="cc-progress-fill" style={{ width: dur ? `${(pos / dur) * 100}%` : "0%" }} />
              </div>
              <div style={{ fontSize: 13, color: "var(--ink-4)", fontFamily: "var(--f-mono)", marginTop: 4 }}>{fmt(pos)}{dur ? ` / ${fmt(dur)}` : ""}</div>
            </div>
          </div>
        )}

        {ep.status !== "ready" && ep.script && (
          <>
            <p style={{ margin: 0, fontSize: 15, color: "var(--warn)" }}>
              The voice service is down this morning. The app keeps retrying on its own · meanwhile, today&rsquo;s brief is written below.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="cc-btn" onClick={() => setShowScript((v) => !v)} style={{ minHeight: 44, flex: 1 }}>{showScript ? "Hide the text" : "Read it instead"}</button>
              <button className="cc-btn cc-btn-ghost" onClick={retry} disabled={retrying} style={{ minHeight: 44 }}>{retrying ? "Trying…" : "Try the voice again"}</button>
            </div>
            {showScript && <div style={{ fontSize: 15.5, lineHeight: 1.6, color: "var(--ink-2)", whiteSpace: "pre-wrap" }}>{ep.script}</div>}
          </>
        )}

        {ep.status !== "ready" && !ep.script && (
          <p style={{ margin: 0, fontSize: 15, color: "var(--ink-3)" }}>
            Today&rsquo;s episode isn&rsquo;t ready yet · it retries automatically. The written stories are on <Link href="/news" style={{ color: "var(--violet)" }}>News</Link>.
          </p>
        )}
      </div>
    </section>
  );
}
