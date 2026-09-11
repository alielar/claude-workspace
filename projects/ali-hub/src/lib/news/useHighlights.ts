"use client";

/**
 * Spoiler-free highlights on the phone: cached list + "mark watched" (optimistic,
 * through the outbox). Shared by the News card and the one-line Today suggestion,
 * same cache key so both stay in step.
 */

import { useCached, fetchJson } from "@/lib/local/store";
import { sendOrQueue } from "@/lib/local/outbox";
import type { Highlight } from "@/lib/news/highlights";

export const youtubeUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;

export function useHighlights() {
  const { data, setData } = useCached<{ items: Highlight[] }>("highlights", () => fetchJson<{ items: Highlight[] }>("/api/highlights"));
  const items = data?.items ?? [];
  const markWatched = async (videoId: string, watched = true) => {
    if (data) setData({ ...data, items: data.items.map((h) => (h.videoId === videoId ? { ...h, watched } : h)) });
    try {
      await sendOrQueue({ url: "/api/highlights/watch", method: "POST", body: { videoId, watched }, dedupeKey: `hl-watch:${videoId}` });
    } catch { /* replayed later */ }
  };
  const unwatched = items.filter((h) => !h.watched);
  return { items, unwatched, markWatched };
}
