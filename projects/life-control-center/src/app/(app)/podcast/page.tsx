"use client";

/**
 * /podcast · the morning brief's own full-screen player (2026-09-10),
 * the same pattern as /stretch and /breathe: Today shows a launcher card,
 * the real player lives here.
 *
 * - Play/pause, speed (persisted), back 15 s, next chapter
 * - Chaptered timeline (dividers, tap to seek) + chapter jump list
 * - Synced captions: the script follows the audio like subtitles. Timing is
 *   derived, not guessed: audio is CBR, chapter starts are exact (byte offsets),
 *   and inside a chapter each sentence gets time proportional to its length.
 *   Tap any line to jump there.
 * - Works with the screen locked (audio element + MediaSession, incl. lock-screen
 *   back-15/next-chapter and the position scrubber).
 * - Same storage keys as the Today card (cc-podcast-pos/-speed/-heard), so
 *   starting on Today and finishing here resumes seamlessly.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCached, fetchJson } from "@/lib/local/store";
import { checklistToday } from "@/lib/checklist/day";

type Chapter = { title: string; startSec: number };
type Episode = {
  date: string; status: "pending" | "ready" | "failed";
  script: string | null; audioUrl: string | null; attempts: number;
  chapters: Chapter[]; durationSec: number | null;
};

const SPEEDS = [1, 1.25, 1.5, 1.75];
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, "0")}`;

type Caption = { text: string; startSec: number; endSec: number; chapter: number };

/** Sentence-level caption track from the script + exact chapter start times. */
function buildCaptions(script: string, chapters: Chapter[], durationSec: number): Caption[] {
  const parts = script.split(/^###\s*(.+)$/m); // [pre, title1, body1, title2, body2, …]
  const blocks: { title: string; body: string }[] = [];
  for (let i = 1; i < parts.length; i += 2) blocks.push({ title: parts[i].trim(), body: (parts[i + 1] ?? "").trim() });
  if (!blocks.length) blocks.push({ title: "", body: script.trim() });

  const out: Caption[] = [];
  blocks.forEach((b, ci) => {
    const start = chapters[ci]?.startSec ?? 0;
    const end = chapters[ci + 1]?.startSec ?? durationSec;
    const sentences = b.body.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean);
    const totalChars = sentences.reduce((n, s) => n + s.length, 0) || 1;
    let t = start;
    sentences.forEach((s) => {
      const span = ((end - start) * s.length) / totalChars;
      out.push({ text: s, startSec: t, endSec: t + span, chapter: ci });
      t += span;
    });
  });
  return out;
}

export default function PodcastPage() {
  const router = useRouter();
  const today = checklistToday();
  const { data, setData } = useCached<{ episode: Episode | null }>("podcast-today", () => fetchJson("/api/podcast/today"));
  const ep = data?.episode && data.episode.date === today ? data.episode : null;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [showChapters, setShowChapters] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const barRef = useRef<HTMLDivElement | null>(null);
  const captionsBox = useRef<HTMLDivElement | null>(null);
  const activeLine = useRef<HTMLButtonElement | null>(null);
  // Auto-scroll pauses while he scrolls the captions himself, resumes after 4 s.
  const userScrolledAt = useRef(0);

  useEffect(() => {
    try {
      const sp = Number(localStorage.getItem("cc-podcast-speed"));
      if (SPEEDS.includes(sp)) setSpeed(sp);
    } catch { /* defaults */ }
  }, []);
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const duration = dur || ep?.durationSec || 0;
  const chapters = useMemo(() => ep?.chapters ?? [], [ep]);
  const captions = useMemo(
    () => (ep?.script && duration ? buildCaptions(ep.script, chapters, duration) : []),
    [ep?.script, chapters, duration],
  );
  const captionIdx = captions.length ? Math.max(0, captions.findIndex((c) => pos < c.endSec)) : -1;
  const currentChapter = chapters.length ? [...chapters].reverse().find((c) => pos >= c.startSec) ?? chapters[0] : null;

  // Keep the active caption centred (unless he is reading elsewhere).
  useEffect(() => {
    if (Date.now() - userScrolledAt.current < 4000) return;
    activeLine.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [captionIdx]);

  const markHeard = useCallback(() => {
    try { localStorage.setItem("cc-podcast-heard", today); localStorage.removeItem("cc-podcast-pos"); } catch { /* ignore */ }
  }, [today]);

  const ensureAudio = useCallback((): HTMLAudioElement | null => {
    if (!ep?.audioUrl) return null;
    if (audioRef.current) return audioRef.current;
    const a = new Audio(ep.audioUrl);
    a.preload = "metadata";
    a.playbackRate = speed;
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
        navigator.mediaSession.setActionHandler("nexttrack", () => {
          const next = (ep.chapters ?? []).find((c) => c.startSec > a.currentTime + 1);
          if (next) a.currentTime = next.startSec;
        });
        navigator.mediaSession.setActionHandler("seekto", (d) => { if (d.seekTime != null) a.currentTime = d.seekTime; });
      } catch { /* older Safari */ }
    }
    return a;
  }, [ep, speed, today, markHeard]);

  const toggle = () => {
    const a = ensureAudio();
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  };
  const seekTo = (sec: number, andPlay = true) => {
    const a = ensureAudio();
    if (!a) return;
    a.currentTime = Math.max(0, Math.min(duration || 1e9, sec));
    setPos(a.currentTime);
    if (andPlay && a.paused) a.play().catch(() => {});
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
  const exit = () => { audioRef.current?.pause(); router.push("/today"); };

  const remaining = duration ? Math.max(0, duration - pos) / speed : 0;

  // ── No episode / voice down: same honest states, full page ────────────────
  if (!ep || ep.status !== "ready" || !ep.audioUrl) {
    return (
      <div style={{ display: "grid", gap: 16, maxWidth: 560 }}>
        <div className="cc-pagetitle" style={{ marginBottom: 0 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 600 }}>Morning brief</h1>
            <div className="sub">{today}</div>
          </div>
        </div>
        {ep?.script ? (
          <>
            <p style={{ margin: 0, fontSize: 15, color: "var(--warn)" }}>
              The voice service is down this morning. The app keeps retrying on its own · today&rsquo;s brief is written below.
            </p>
            <button className="cc-btn cc-btn-ghost" onClick={retry} disabled={retrying} style={{ minHeight: 48, borderRadius: 12 }}>{retrying ? "Trying…" : "Try the voice again"}</button>
            <div style={{ fontSize: 16, lineHeight: 1.65, color: "var(--ink-2)", whiteSpace: "pre-wrap" }}>{ep.script.replace(/^###\s*/gm, "")}</div>
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 15, color: "var(--ink-3)" }}>
            Today&rsquo;s episode isn&rsquo;t ready yet · it retries automatically. The written stories are on <Link href="/news" style={{ color: "var(--violet)" }}>News</Link>.
          </p>
        )}
        <Link href="/today" style={{ fontSize: 15, color: "var(--ink-3)", textDecoration: "none" }}>← Back to Today</Link>
      </div>
    );
  }

  // ── Full-screen player ─────────────────────────────────────────────────────
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 60, background: "var(--bg-deep)",
      display: "flex", flexDirection: "column",
      padding: "calc(env(safe-area-inset-top) + 14px) 18px calc(env(safe-area-inset-bottom) + 16px)",
    }}>
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 600 }}>Morning brief</div>
          <div style={{ fontSize: 13, color: "var(--ink-3)", fontFamily: "var(--f-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {currentChapter ? currentChapter.title : ep.date}
          </div>
        </div>
        <button onClick={() => setShowChapters((v) => !v)} aria-pressed={showChapters} className="cc-btn cc-btn-ghost" style={{ minHeight: 44, borderRadius: 12, fontSize: 14 }}>
          {showChapters ? "Captions" : "Chapters"}
        </button>
        <button onClick={exit} aria-label="Exit" className="cc-btn cc-btn-ghost" style={{ minWidth: 44, minHeight: 44, padding: 0, borderRadius: 12 }}>✕</button>
      </div>

      {/* Middle: captions (default) or the chapter list */}
      {!showChapters ? (
        <div
          ref={captionsBox}
          onScroll={() => { userScrolledAt.current = Date.now(); }}
          style={{ flex: 1, overflowY: "auto", margin: "14px -4px", padding: "30vh 4px 30vh", display: "grid", gap: 14, alignContent: "start" }}
        >
          {captions.map((c, i) => {
            const active = i === captionIdx;
            const isChapterStart = i === 0 || captions[i - 1].chapter !== c.chapter;
            return (
              <div key={i}>
                {isChapterStart && chapters[c.chapter] && (
                  <div style={{ fontSize: 12.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--violet)", fontFamily: "var(--f-mono)", margin: "10px 0 8px" }}>
                    {chapters[c.chapter].title}
                  </div>
                )}
                <button
                  ref={active ? activeLine : undefined}
                  onClick={() => seekTo(c.startSec)}
                  style={{
                    display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none",
                    padding: 0, cursor: "pointer", font: "inherit",
                    fontSize: 19, lineHeight: 1.5, fontWeight: active ? 600 : 400,
                    color: active ? "var(--ink)" : pos > c.endSec ? "var(--ink-4)" : "var(--ink-3)",
                    transition: "color 0.2s",
                  }}
                >
                  {c.text}
                </button>
              </div>
            );
          })}
          {!captions.length && <div style={{ color: "var(--ink-3)", fontSize: 15 }}>No captions for this episode.</div>}
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto", margin: "14px 0" }}>
          {chapters.map((c) => {
            const active = currentChapter?.startSec === c.startSec;
            return (
              <button key={c.startSec} onClick={() => { seekTo(c.startSec); setShowChapters(false); }}
                style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, alignItems: "center", width: "100%", minHeight: 52, padding: "0 4px", background: "transparent", border: "none", borderBottom: "1px solid var(--line)", textAlign: "left", cursor: "pointer", font: "inherit", color: active ? "var(--ink)" : "var(--ink-3)" }}>
                <span style={{ fontFamily: "var(--f-mono)", fontSize: 14, color: active ? "var(--violet)" : "var(--ink-4)", minWidth: 40 }}>{fmt(c.startSec)}</span>
                <span style={{ fontSize: 16, fontWeight: active ? 600 : 400 }}>{c.title}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Timeline */}
      <div ref={barRef} onClick={onBarTap} role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={Math.floor(pos)}
        style={{ position: "relative", height: 26, display: "flex", alignItems: "center", cursor: "pointer", touchAction: "manipulation" }}>
        <div style={{ position: "relative", width: "100%", height: 7, borderRadius: 99, background: "var(--fill-3)", overflow: "hidden" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: duration ? `${(pos / duration) * 100}%` : "0%", background: "var(--violet)" }} />
          {duration > 0 && chapters.slice(1).map((c) => (
            <span key={c.startSec} style={{ position: "absolute", left: `${(c.startSec / duration) * 100}%`, top: 0, bottom: 0, width: 2, background: "var(--bg-deep)" }} />
          ))}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--ink-4)", fontFamily: "var(--f-mono)", marginBottom: 12 }}>
        <span>{fmt(pos)}</span>
        <span>{remaining > 0 ? `${fmt(remaining)} left at ${speed}×` : fmt(duration)}</span>
      </div>

      {/* Transport · thumb zone */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 12, alignItems: "center" }}>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={back15} aria-label="Back 15 seconds" className="cc-btn cc-btn-ghost" style={{ minHeight: 56, minWidth: 64, borderRadius: 14, fontSize: 15 }}>↺15</button>
        </div>
        <button onClick={toggle} aria-label={playing ? "Pause" : "Play"}
          style={{ width: 76, height: 76, borderRadius: "50%", border: "none", background: "var(--violet)", color: "var(--on-accent)", fontSize: 28, cursor: "pointer" }}>
          {playing ? "❚❚" : "▶"}
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={nextChapter} aria-label="Next chapter" className="cc-btn cc-btn-ghost" style={{ minHeight: 56, minWidth: 56, borderRadius: 14, fontSize: 16 }}>⏭</button>
          <button onClick={cycleSpeed} aria-label="Playback speed" className="cc-btn cc-btn-ghost" style={{ minHeight: 56, minWidth: 60, borderRadius: 14, fontSize: 14, fontFamily: "var(--f-mono)" }}>{speed}×</button>
        </div>
      </div>
    </div>
  );
}
