/**
 * YouTube videos for the daily brief · no API key, just each channel's public RSS feed.
 *
 * Channels are picked per interest (spec §8a: "Claude picks per topic, shows the list once
 * for adjustment"). Ali can switch any of them off in Settings → News → YouTube channels.
 * Feed:  https://www.youtube.com/feeds/videos.xml?channel_id=<id>  (Atom, last 15 uploads)
 */

import type { NewsCategory } from "@/lib/news-brief";

/** Video categories = the four news interests + "tools" (Claude / AI tooling, 2026-09-12). */
export type VideoCategory = NewsCategory | "tools";
export type YtChannel = { id: string; name: string; category: VideoCategory; why: string; maxAgeHours?: number; custom?: boolean; edited?: boolean };
export const VIDEO_CATEGORIES: { key: VideoCategory; label: string }[] = [
  { key: "football",    label: "Football" },
  { key: "geopolitics", label: "Geopolitics" },
  { key: "tech",        label: "Tech & AI" },
  { key: "business",    label: "Business" },
  { key: "tools",       label: "Claude & AI tools" },
];

/**
 * Ali's own changes to the channel list (Settings, 2026-09-12). Stored as a JSON array in
 * `user_settings.news_custom_channels`; `news_channels` (enabled ids) covers these too.
 * Three shapes share the array:
 *   - a channel Ali added from the live search (id not in YT_CHANNELS)
 *   - an EDIT of a built-in (same id as a built-in · its name/category replace the default)
 *   - a REMOVAL of a built-in (`removed: true` · the built-in disappears until restored)
 * The built-ins are a starting list Ali owns, not a fixed one.
 */
export type CustomChannel = { id: string; name: string; category: VideoCategory; handle?: string; subs?: string; removed?: boolean };

export function parseCustomChannels(json: string | null | undefined): CustomChannel[] {
  try {
    const v: unknown = json ? JSON.parse(json) : [];
    if (!Array.isArray(v)) return [];
    const cats = new Set<string>(VIDEO_CATEGORIES.map((c) => c.key));
    return v.filter((c): c is CustomChannel =>
      !!c && typeof c === "object" && typeof (c as CustomChannel).id === "string" && typeof (c as CustomChannel).name === "string" && cats.has((c as CustomChannel).category));
  } catch { return []; }
}

/** Is this id one of the shipped defaults? */
export const isBuiltIn = (id: string) => YT_CHANNELS.some((c) => c.id === id);

/**
 * The list as Ali sees it: built-ins (minus the removed ones, with his edits applied)
 * plus his own additions.
 */
export function allChannels(custom: CustomChannel[] = []): YtChannel[] {
  const byId = new Map(custom.map((c) => [c.id, c]));
  const builtIns: YtChannel[] = [];
  for (const c of YT_CHANNELS) {
    const o = byId.get(c.id);
    if (o?.removed) continue;
    builtIns.push(o ? { ...c, name: o.name, category: o.category, edited: true, maxAgeHours: o.category === "tools" ? 240 : c.maxAgeHours } : c);
  }
  const own: YtChannel[] = custom.filter((c) => !c.removed && !isBuiltIn(c.id)).map((c) => ({
    id: c.id, name: c.name, category: c.category, custom: true,
    why: [c.handle, c.subs].filter(Boolean).join(" · ") || "added by you",
    maxAgeHours: c.category === "tools" ? 240 : undefined,
  }));
  return [...builtIns, ...own];
}

export const YT_CHANNELS: YtChannel[] = [
  // Football · Real Madrid + tactics; the Moroccan team surfaces through keywords on all football channels
  { id: "UCWV3obpZVGgJ3j9FVhEjF2Q", name: "Real Madrid",        category: "football",    why: "official club channel · highlights, press, behind the scenes" },
  { id: "UCGYYNGmyhZ_kwBF_lqqXdAQ", name: "Tifo Football",      category: "football",    why: "tactics explained in 10 minutes, no noise" },
  // Geopolitics · Morocco / MENA / world
  { id: "UCwnKziETDbHJtx78nIkfYug", name: "CaspianReport",      category: "geopolitics", why: "calm geopolitical analysis, strong on MENA and energy" },
  { id: "UC-uhvujip5deVcEtLxnW8qg", name: "TLDR News Global",   category: "geopolitics", why: "world politics explained in plain language" },
  { id: "UCNye-wNBqNL5ZzHSJj3l8Bg", name: "Al Jazeera English", category: "geopolitics", why: "MENA-first coverage, Morocco appears here more than anywhere" },
  { id: "UCmGSJVG3mCRXVOP4yZrU1Dw", name: "Johnny Harris",      category: "geopolitics", why: "maps and stories behind the headlines" },
  // Tech & AI
  { id: "UCNJ1Ymd5yFuUPtn21xtRbbw", name: "AI Explained",       category: "tech",        why: "the most careful weekly read on new AI models and papers" },
  { id: "UCsBjURrPoezykLs9EqgamOA", name: "Fireship",           category: "tech",        why: "dev news in 100 seconds · what shipped this week" },
  { id: "UChpleBmo18P08aKCIgti38g", name: "Matt Wolfe",         category: "tech",        why: "practical AI tools roundup for builders" },
  { id: "UCrDwWp7EBBv4NwvScIpBDOA", name: "Anthropic",          category: "tech",        why: "the company behind the models this app is built with" },
  { id: "UCBJycsmduvYEL83R_U4JriQ", name: "Marques Brownlee",   category: "tech",        why: "product launches, honest reviews" },
  // Business & markets
  { id: "UCIALMKvObZNtJ6AmdCLP7Lg", name: "Bloomberg Television", category: "business", why: "markets and companies, daily" },
  { id: "UCASM0cgfkJxQ1ICmRilfHLw", name: "Patrick Boyle",      category: "business",    why: "finance professor, dry humour, explains what actually happened" },
  { id: "UCFCEuCsyWP0YkP3CZ3Mr01Q", name: "The Plain Bagel",    category: "business",    why: "personal finance and markets without hype" },
  // Claude & AI tools (2026-09-12, Ali: get better at Claude Code / Claude / Cowork, quality over
  // volume). These channels post weekly, so the window is 10 days and titles are filtered
  // (TOOLS_INCLUDE / TOOLS_EXCLUDE below) · beginner overviews and product-drama never show.
  { id: "UC_x36zCEGilGpB1m-V4gmjg", name: "IndyDevDan",         category: "tools", maxAgeHours: 240, why: "agentic engineering: how to structure work for coding agents, deep and practical" },
  { id: "UCswG6FSbgZjbWtdf_hMLaow", name: "Matt Pocock",        category: "tools", maxAgeHours: 240, why: "Claude Code skills and workflows (/wayfinder, /grill-me), planning with agents" },
  { id: "UCMwVTLZIRRUyyVrkjDpn4pA", name: "Cole Medin",         category: "tools", maxAgeHours: 240, why: "AI coding workflows, context and safety for agents that touch real systems" },
  { id: "UCrXSVX9a1mj8l0CMLwKgMVw", name: "AI Jason",           category: "tools", maxAgeHours: 240, why: "context engineering and agent loops, tested hands-on" },
  { id: "UCelfWQr9sXVMTvBzviPGlFw", name: "AI LABS",            category: "tools", maxAgeHours: 240, why: "Claude skills, rules and tools, week by week" },
];

/** Tools videos must be about the craft · one of these words in the title … */
const TOOLS_INCLUDE = /\b(claude|cowork|anthropic|fable|opus|agent|agentic|agents|context|skill|skills|workflow|workflows|mcp|prompt|prompting|harness|coding|codebase|sandbox|plan|planning|spec|specs|memory|subagent|hooks?)\b/i;
/** … and none of these (beginner overviews, hype, money talk). */
const TOOLS_EXCLUDE = /\b(beginner|beginners|getting started|intro|introduction|explained in|in 10 minutes|for dummies|make money|\$\d|insane|shocking|it's over|debate|vs\.?|versus|review|unboxing)\b/i;
export const passesToolsFilter = (title: string) => TOOLS_INCLUDE.test(title) && !TOOLS_EXCLUDE.test(title);

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

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return (m?.[1] ?? "").trim();
}

function decode(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
}

/** Fetch one channel's latest uploads (published within `maxAgeHours`). */
export async function fetchChannelVideos(ch: YtChannel, maxAgeHours = ch.maxAgeHours ?? 48): Promise<NewsVideo[]> {
  try {
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${ch.id}`, {
      headers: { "User-Agent": "ali-hub/1.0 (personal dashboard)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const out: NewsVideo[] = [];
    const cutoff = Date.now() - maxAgeHours * 3600_000;
    for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
      const e = m[1];
      const id = tag(e, "yt:videoId");
      const published = tag(e, "published");
      if (!id || !published) continue;
      const t = new Date(published).getTime();
      if (!Number.isFinite(t) || t < cutoff) continue;
      const title = decode(tag(e, "title"));
      // Skip shorts / live placeholders by title convention
      if (/#shorts?\b/i.test(title)) continue;
      if (ch.category === "tools" && !passesToolsFilter(title)) continue;
      const thumb = e.match(/<media:thumbnail url="([^"]+)"/)?.[1] ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
      out.push({
        id, title, channel: ch.name, channelId: ch.id, category: ch.category,
        url: `https://www.youtube.com/watch?v=${id}`, thumbnail: thumb, publishedAt: new Date(t).toISOString(),
      });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Up to `perCategory` fresh videos per interest across the enabled channels,
 * newest first but never two from the same channel when another has something.
 */
export async function fetchBriefVideos(enabledIds: string[] | null, custom: CustomChannel[] = [], perCategory = 2): Promise<NewsVideo[]> {
  const channels = allChannels(custom).filter((c) => !enabledIds || enabledIds.includes(c.id));
  const lists = await Promise.all(channels.map((c) => fetchChannelVideos(c)));
  const all = lists.flat().sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  const picked: NewsVideo[] = [];
  for (const cat of ["tools", "tech", "geopolitics", "business", "football"] as VideoCategory[]) {
    const pool = all.filter((v) => v.category === cat);
    const want = cat === "tools" ? 4 : perCategory;
    const usedChannels = new Set<string>();
    const chosen: NewsVideo[] = [];
    for (const v of pool) {
      if (chosen.length >= want) break;
      if (usedChannels.has(v.channelId)) continue;
      chosen.push(v); usedChannels.add(v.channelId);
    }
    for (const v of pool) {
      if (chosen.length >= want) break;
      if (!chosen.includes(v)) chosen.push(v);
    }
    picked.push(...chosen);
  }
  return picked;
}
