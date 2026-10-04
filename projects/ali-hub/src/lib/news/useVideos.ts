"use client";

/**
 * The News page's videos on the phone (2026-10-03): the two daily picks and the watch-later
 * list, cached locally, "mark watched" optimistic through the outbox (watched state lives on
 * the server, so phone and laptop agree).
 */

import { useCached, fetchJson } from "@/lib/local/store";
import { sendOrQueue } from "@/lib/local/outbox";
import type { VideoFeed } from "@/lib/news/videos";

export const watchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;

export function useVideos() {
  const { data, loading, stale, setData } = useCached<VideoFeed>("news-videos-v2", () => fetchJson<VideoFeed>("/api/news/videos"));
  const markWatched = async (videoId: string, watched = true) => {
    if (data) {
      const v = data.later.find((x) => x.videoId === videoId) ?? data.watched?.find((x) => x.videoId === videoId) ?? data.picks.find((p) => p.video?.videoId === videoId)?.video ?? null;
      setData({
        ...data,
        picks: data.picks.map((p) => (p.video?.videoId === videoId ? { ...p, video: { ...p.video, watched } } : p)),
        later: watched ? data.later.filter((x) => x.videoId !== videoId) : v && !data.later.some((x) => x.videoId === videoId) ? [{ ...v, watched: false }, ...data.later] : data.later,
        watched: watched ? (v ? [{ ...v, watched: true }, ...(data.watched ?? []).filter((x) => x.videoId !== videoId)] : data.watched) : (data.watched ?? []).filter((x) => x.videoId !== videoId),
      });
    }
    try {
      await sendOrQueue({ url: "/api/news/videos/watch", method: "POST", body: { videoId, watched }, dedupeKey: `yt-watch:${videoId}` });
    } catch { /* replayed later */ }
  };
  return { feed: data, loading, stale, markWatched };
}
