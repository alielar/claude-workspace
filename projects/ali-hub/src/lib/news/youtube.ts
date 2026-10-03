/**
 * YouTube feed helpers · the channel LIST moved to src/lib/news/channels.ts on 2026-10-03 (a
 * fixed list Ali gave: two daily picks + ten watch-later channels) and the videos themselves
 * are stored by src/lib/news/videos.ts. This file keeps the shared video shape only; the old
 * per-topic built-ins, custom channels and the tools filter are gone (git has them).
 */

import type { NewsCategory } from "@/lib/news-brief";

export type VideoCategory = NewsCategory | "tools";

export type NewsVideo = {
  id: string;               // YouTube video id
  title: string;
  channel: string;
  channelId: string;
  category: VideoCategory;
  url: string;              // https://www.youtube.com/watch?v=…
  thumbnail: string;
  publishedAt: string;      // ISO
  minutesAgo?: number;
};
