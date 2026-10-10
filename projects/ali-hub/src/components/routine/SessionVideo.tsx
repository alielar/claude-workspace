"use client";

/**
 * The mobility video riding along the session (Ali 2026-10-10: "on the player it should also
 * show the video, small, on mute, I need to see how to perform the movements during the routine").
 * YouTube's iframe player, muted, no controls; every move change seeks to that move's moment in the
 * video (`VIDEO_AT` in stretching.ts, read from the video's chapters). YouTube's own controls stay ON so Ali
 * can scrub to the exact moment himself (2026-10-10: "I should be able to fast forward through the video");
 * the ⤢ button in the corner switches small ↔ wide. Shown only
 * while the current move has a moment in the video (the standing block); the floor finish has none.
 */

import { useEffect, useRef, useState } from "react";

type YTPlayer = { seekTo: (s: number, allow: boolean) => void; playVideo: () => void; pauseVideo: () => void; mute: () => void; destroy: () => void };
type YTNs = { Player: new (el: HTMLElement, cfg: unknown) => YTPlayer };
declare global { interface Window { YT?: YTNs; onYouTubeIframeAPIReady?: () => void } }

let apiPromise: Promise<YTNs> | null = null;
function loadApi(): Promise<YTNs> {
  if (typeof window === "undefined") return new Promise(() => {});
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise<YTNs>((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT!); };
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api"; s.async = true;
      document.head.appendChild(s);
    });
  }
  return apiPromise;
}

export function SessionVideo({ videoId, at, playing }: { videoId: string; at: number; playing: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const ready = useRef(false);
  const [wide, setWide] = useState(false);

  useEffect(() => {
    let gone = false;
    const el = document.createElement("div");
    box.current?.appendChild(el);
    loadApi().then((YT) => {
      if (gone) return;
      player.current = new YT.Player(el, {
        videoId, host: "https://www.youtube-nocookie.com",
        playerVars: { autoplay: 1, mute: 1, controls: 1, playsinline: 1, rel: 0, modestbranding: 1, start: Math.floor(at), fs: 0 },
        events: { onReady: () => { ready.current = true; player.current?.mute(); player.current?.seekTo(at, true); player.current?.playVideo(); } },
      });
    });
    return () => { gone = true; ready.current = false; try { player.current?.destroy(); } catch { /* ignore */ } player.current = null; el.remove(); };
    // The player is created once; moves and pauses are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  useEffect(() => { if (ready.current) { player.current?.seekTo(at, true); if (playing) player.current?.playVideo(); } }, [at, playing]);
  useEffect(() => { if (ready.current) { if (playing) player.current?.playVideo(); else player.current?.pauseVideo(); } }, [playing]);

  return (
    <div style={{ width: wide ? "100%" : "min(56vw, 260px)", maxWidth: 480, aspectRatio: "16 / 9", borderRadius: 12, overflow: "hidden", background: "#000", border: "1px solid var(--line)", position: "relative", transition: "width 0.25s ease-out", flex: "0 0 auto" }}>
      <div ref={box} className="mob-video" style={{ position: "absolute", inset: 0 }} />
      <button type="button" onClick={() => setWide((v) => !v)} aria-label={wide ? "Smaller video" : "Bigger video"}
        style={{ position: "absolute", top: 4, right: 4, width: 32, height: 32, borderRadius: 8, border: "none", background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: 15, lineHeight: 1, cursor: "pointer", padding: 0 }}>
        {wide ? "⤡" : "⤢"}
      </button>
    </div>
  );
}
