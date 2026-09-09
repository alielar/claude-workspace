"use client";

/**
 * Morning podcast player v2 (2026-09-09) · Today + News.
 *
 * YouTube-inspired: chaptered timeline (dividers on the bar, tap/drag to seek),
 * chapter list with jump, playback speed (persisted), back 15 s / next chapter,
 * lock-screen controls via MediaSession (incl. position state), position resumes
 * if breakfast gets interrupted. Reaching the end (or 90%) marks the episode
 * heard: Today drops the card for the day (localStorage cc-podcast-heard),
 * News keeps it with a "listened" tail.
 *
 * Failure states stay honest: script-only → "voice is down · read it instead"
 * + retry; nothing → one quiet line pointing at News.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useCached, fetchJson } from "@/lib/local/store";

type Chapter = { title: string; startSec: number };
type Episode = {
  date: string; status: "pending" | "ready" | "failed";
  script: string | null; audioUrl: string | null; attempts: number;
  chapters: Chapter[]; durationSec: number | null;
};

const SPEEDS = [1, 1.25, 1.5, 1.75];
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, "0")}`;

export function heardToday(today: string): boolean {
  try { return localStorage.getItem("cc-podcast-heard") === today; } catch { return false; }
}

export function PodcastCard({ today, hideWhenHeard = false }: { today: string; hideWhenHeard?: boolean }) {
  const { data, setData } = useCached<{ episode: Episode | null }>("podcast-today", () => fetchJson("/api/podcast/today"));
  const ep = data?.episode && data.episode.date === today ? data.episode : null;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [heard, setHeard] = useState(false);
  const [showScript, setShowScript] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const sp = Number(localStorage.getItem("cc-podcast-speed"));
      if (SPEEDS.includes(sp)) setSpeed(sp);
      setHeard(localStorage.getItem("cc-podcast-heard") === today);
    } catch { /* defaults */ }
  }, [today]);
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  if (!ep) return null;
  if (hideWhenHeard && heard) return null;

  const duration = dur || ep.durationSec || 0;
  const chapters = ep.chapters ?? [];
  const currentChapter = chapters.length ? [...chapters].reverse().find((c) => pos >= c.startSec) ?? chapters[0] : null;

  const markHeard = () => {
    try { localStorage.setItem("cc-podcast-heard", today); localStorage.removeItem("cc-podcast-pos"); } catch { /* ignore */ }
    setHeard(true);
  };

  const ensureAudio = (): HTMLAudioElement | null => {
    if (!ep.audioUrl) return null;
    if (audioRef.current) return audioRef.current;
    const a = new Audio(ep.audioUrl);
    a.preload = "metadata";
    a.playbackRate = speed;
    // Resume where he left off (interrupted breakfast) · same day only.
    try {
      const saved = JSON.parse(localStorage.getItem("cc-podcast-pos") ?? "null") as { date: string; sec: number } | null;
      if (saved?.date === today && saved.sec > 5) a.currentTime = saved.sec;
    } catch { /* start at 0 */ }
    a.addEventListener("timeupdate", () => {
      setPos(a.currentTime);
      try { localStorage.setItem("cc-podcast-pos", JSON.stringify({ date: today, sec: Math.floor(a.currentTime) })); } catch { /* ignore */ }
      if (a.duration && a.currentTime / a.duration >= 0.9) markHeard();
      if ("mediaSession" in navigator && a.duration) {
        try { navigator.mediaSession.setPositionState({ duration: a.duration, position: a.currentTime, playbackRate: a.playbackRate }); } catch { /* ignore */ }
      }
    });
    a.addEventListener("durationchange", () => setDur(a.duration || 0));
    a.addEventListener("ended", () => { setPlaying(false); markHeard(); });
    a.addEventListener("pause", () => setPlaying(false));
    a.addEventListener("play", () => setPlaying(true));
    audioRef.current = a;
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: "Morning brief", artist: "A L I", album: ep.date });
      navigator.mediaSession.setActionHandler("play", () => a.play());
      navigator.mediaSession.setActionHandler("pause", () => a.pause());
      navigator.mediaSession.setActionHandler("seekbackward", () => { a.currentTime = Math.max(0, a.currentTime - 15); });
      navigator.mediaSession.setActionHandler("seekforward", () => { a.currentTime = Math.min(a.duration || 1e9, a.currentTime + 15); });
      try {
        navigator.mediaSession.setActionHandler("nexttrack", () => nextChapter());
        navigator.mediaSession.setActionHandler("seekto", (d) => { if (d.seekTime != null) a.currentTime = d.seekTime; });
      } catch { /* older Safari */ }
    }
    return a;
  };

  const toggle = () => {
    const a = ensureAudio();
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  };
  const seekTo = (sec: number) => {
    const a = ensureAudio();
    if (!a) return;
    a.currentTime = Math.max(0, Math.min(duration || 1e9, sec));
    setPos(a.currentTime);
    if (a.paused) { a.play().catch(() => {}); }
  };
  const back15 = () => { const a = ensureAudio(); if (a) { a.currentTime = Math.max(0, a.currentTime - 15); setPos(a.currentTime); } };
  const nextChapter = () => {
    const next = chapters.find((c) => c.startSec > pos + 1);
    if (next) seekTo(next.startSec);
    else { const a = audioRef.current; if (a && a.duration) a.currentTime = a.duration; }
  };
  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
    try { localStorage.setItem("cc-podcast-speed", String(next)); } catch { /* ignore */ }
  };
  const onBarTap = (e: React.MouseEvent | React.TouchEvent) => {
    const el = barRef.current;
    if (!el || !duration) return;
    const rect = el.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0]?.clientX ?? (e as React.TouchEvent).changedTouches[0].clientX : (e as React.MouseEvent).clientX;
    seekTo(((x - rect.left) / rect.width) * duration);
  };

  const retry = async () => {
    setRetrying(true);
    try {
      const r = await fetch("/api/podcast/retry", { method: "POST" }).then((x) => x.json());
      if (r?.episode) setData({ episode: r.episode });
    } catch { /* the tick keeps retrying anyway */ }
    setRetrying(false);
  };

  const remaining = duration ? Math.max(0, duration - pos) / speed : 0;

  return (
    <section className="cc-card">
      <div className="cc-card-head">
        <span className="title">Morning brief</span>
        <span className="tail">
          {ep.status === "ready" ? (heard ? "listened ✓" : duration ? `${fmt(duration)}${currentChapter ? ` · ${currentChapter.title}` : ""}` : "podcast") : ep.script ? "voice is down" : "not ready yet"}
        </span>
      </div>
      <div className="cc-card-body" style={{ display: "grid", gap: 10 }}>
        {ep.status === "ready" && ep.audioUrl && (
          <>
            {/* Chaptered timeline · tap anywhere to jump */}
            <div ref={barRef} onClick={onBarTap} role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={Math.floor(pos)}
              style={{ position: "relative", height: 22, display: "flex", alignItems: "center", cursor: "pointer", touchAction: "manipulation" }}>
              <div style={{ position: "relative", width: "100%", height: 6, borderRadius: 99, background: "var(--fill-3)", overflow: "hidden" }}>
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: duration ? `${(pos / duration) * 100}%` : "0%", background: "var(--violet)" }} />
                {duration > 0 && chapters.slice(1).map((c) => (
                  <span key={c.startSec} style={{ position: "absolute", left: `${(c.startSec / duration) * 100}%`, top: 0, bottom: 0, width: 2, background: "var(--bg-card)" }} />
                ))}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--ink-4)", fontFamily: "var(--f-mono)", marginTop: -6 }}>
              <span>{fmt(pos)}</span>
              <span>{remaining > 0 ? `${fmt(remaining)} left at ${speed}×` : fmt(duration)}</span>
            </div>

            {/* Transport */}
            <div style={{ display: "grid", gridTemplateColumns: "auto auto 1fr auto", gap: 10, alignItems: "center" }}>
              <button onClick={toggle} aria-label={playing ? "Pause" : "Play"}
                style={{ width: 58, height: 58, borderRadius: "50%", border: "none", background: "var(--violet)", color: "var(--on-accent)", fontSize: 22, cursor: "pointer" }}>
                {playing ? "❚❚" : "▶"}
              </button>
              <button onClick={back15} aria-label="Back 15 seconds" className="cc-btn cc-btn-ghost" style={{ minHeight: 44, minWidth: 52, borderRadius: 12, fontSize: 14 }}>↺15</button>
              <span />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={cycleSpeed} aria-label="Playback speed" className="cc-btn cc-btn-ghost" style={{ minHeight: 44, minWidth: 56, borderRadius: 12, fontSize: 14, fontFamily: "var(--f-mono)" }}>{speed}×</button>
                <button onClick={nextChapter} aria-label="Next chapter" className="cc-btn cc-btn-ghost" style={{ minHeight: 44, minWidth: 52, borderRadius: 12, fontSize: 15 }}>⏭</button>
              </div>
            </div>

            {/* Chapters · tap to jump, current one highlighted */}
            {chapters.length > 1 && (
              <div style={{ display: "grid" }}>
                {chapters.map((c) => {
                  const active = currentChapter?.startSec === c.startSec;
                  return (
                    <button key={c.startSec} onClick={() => seekTo(c.startSec)}
                      style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 10, alignItems: "center", minHeight: 40, padding: "0 4px", background: "transparent", border: "none", borderBottom: "1px solid var(--line)", textAlign: "left", cursor: "pointer", font: "inherit", color: active ? "var(--ink)" : "var(--ink-3)" }}>
                      <span style={{ fontFamily: "var(--f-mono)", fontSize: 13, color: active ? "var(--violet)" : "var(--ink-4)", minWidth: 36 }}>{fmt(c.startSec)}</span>
                      <span style={{ fontSize: 14.5, fontWeight: active ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <div style={{ fontSize: 12.5, color: "var(--ink-4)" }}>Plays with the screen locked · lock-screen buttons skip 15 s / next chapter.</div>
          </>
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
            {showScript && <div style={{ fontSize: 15.5, lineHeight: 1.6, color: "var(--ink-2)", whiteSpace: "pre-wrap" }}>{ep.script.replace(/^###\s*/gm, "")}</div>}
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
