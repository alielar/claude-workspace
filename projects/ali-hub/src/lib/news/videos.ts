/**
 * YouTube picks for News (2026-10-03) · server only.
 *
 * `pollVideos()` reads every channel's public Atom feed (no key), stores new uploads in
 * `yt_videos` (video id unique → idempotent), reads each new video's LENGTH from its watch page
 * ("lengthSeconds" in the page data · the feed carries none) a few per poll, and prunes. It runs
 * from the reminders tick and throttles itself to once every 30 min (stamp in `football_meta`);
 * the GET behind the page runs it inline when the table looks stale.
 *
 * `listVideos()` → the two DAILY PICKS (the newest upload of each pick channel, watched or not,
 * so the card can say "watched") and WATCH LATER (unwatched uploads of the last 14 days, in the
 * channels' priority order, newest first inside a channel). Bloomberg Originals is filtered to
 * AI, politics and business by title. Shorts never enter.
 */

import { db } from "@/db";
import { footballMeta, ytVideos } from "@/db/schema";
import { and, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { ALL_CHANNELS, DAILY_PICKS, LATER_WINDOW_DAYS, WATCH_LATER, channelById, type Channel } from "@/lib/news/channels";
import { searchVideos } from "@/lib/news/youtubeSearch";

export type Video = {
  videoId: string;
  channelId: string;
  channel: string;
  title: string;
  publishedAt: number;      // ms
  durationSec: number | null;
  thumbnail: string;
  watched: boolean;
};
export type VideoFeed = {
  picks: { channel: Channel; video: Video | null }[];
  later: Video[];
  fetchedAt: number;
};

const POLL_EVERY_MS = 30 * 60_000;
const PER_CHANNEL = 5;
const DURATION_BUDGET = 24;
const SEARCH_BUDGET = 10;           // search-page lookups per poll (~1 MB each)         // lengths read per poll (the player endpoint is a few KB each)
const UA = { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", "accept-language": "en" };

async function ensureTable() {
  try {
    await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS yt_videos (
      video_id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, title TEXT NOT NULL, published_at INTEGER NOT NULL,
      duration_sec INTEGER, thumbnail TEXT, watched_at INTEGER, fetched_at INTEGER NOT NULL)`));
  } catch { /* exists */ }
  try { await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS football_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)`)); } catch { /* exists */ }
}

const STAMP = "videos:polledAt";
async function lastPoll(): Promise<number> {
  try {
    const row = await db.select({ value: footballMeta.value }).from(footballMeta).where(eq(footballMeta.key, STAMP)).get();
    return row ? Number(JSON.parse(row.value)) || 0 : 0;
  } catch { return 0; }
}
async function stampPoll() {
  try {
    await db.insert(footballMeta).values({ key: STAMP, value: JSON.stringify(Date.now()), updatedAt: new Date() })
      .onConflictDoUpdate({ target: footballMeta.key, set: { value: JSON.stringify(Date.now()), updatedAt: new Date() } });
  } catch { /* best effort */ }
}

/** True when the table has nothing or the last poll is older than the poll interval. */
export async function videosStale(): Promise<boolean> {
  await ensureTable();
  const last = await lastPoll();
  if (Date.now() - last > POLL_EVERY_MS * 1.5) return true;
  const any = await db.select({ id: ytVideos.videoId }).from(ytVideos).limit(1).catch(() => []);
  return any.length === 0;
}

type FeedEntry = { videoId: string; title: string; publishedAt: number; thumbnail: string };
const decodeXml = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
async function fetchFeed(channelId: string): Promise<FeedEntry[]> {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, { headers: { "user-agent": "ali-hub/1.0 (personal dashboard)" }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`feed ${res.status}`);
  const xml = await res.text();
  const out: FeedEntry[] = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const id = e.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    const title = e.match(/<title>([^<]*)<\/title>/)?.[1];
    const pub = e.match(/<published>([^<]+)<\/published>/)?.[1];
    const thumb = e.match(/<media:thumbnail url="([^"]+)"/)?.[1] ?? (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : "");
    if (id && title) out.push({ videoId: id, title: decodeXml(title), publishedAt: pub ? Date.parse(pub) : Date.now(), thumbnail: thumb });
  }
  return out;
}

/** The innertube clients tried in order · a server IP gets a "sign in" wall on the web client for fresh
 * videos, the embedded-TV and mobile clients usually still answer. */
const PLAYER_CLIENTS: { name: string; client: Record<string, unknown>; headers?: Record<string, string>; thirdParty?: boolean; key?: string }[] = [
  { name: "WEB", client: { clientName: "WEB", clientVersion: "2.20240101.00.00", hl: "en" } },
  { name: "TV_EMBED", client: { clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER", clientVersion: "2.0", hl: "en" }, thirdParty: true },
  // The mobile apps' public keys (the ones every client ships with · yt-dlp uses the same).
  { name: "ANDROID", key: "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w", client: { clientName: "ANDROID", clientVersion: "19.09.37", androidSdkVersion: 30, hl: "en", gl: "US", osName: "Android", osVersion: "11", platform: "MOBILE" }, headers: { "user-agent": "com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip", "x-youtube-client-name": "3", "x-youtube-client-version": "19.09.37" } },
  { name: "IOS", key: "AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc", client: { clientName: "IOS", clientVersion: "19.09.3", deviceModel: "iPhone14,3", hl: "en", gl: "US", osName: "iPhone", osVersion: "15.6.0.19G71", platform: "MOBILE" }, headers: { "user-agent": "com.google.ios.youtube/19.09.3 (iPhone14,3; U; CPU iOS 15_6 like Mac OS X)", "x-youtube-client-name": "5", "x-youtube-client-version": "19.09.3" } },
  { name: "MWEB", client: { clientName: "MWEB", clientVersion: "2.20240101.00.00", hl: "en" }, headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" } },
];

async function playerLength(videoId: string, c: typeof PLAYER_CLIENTS[number]): Promise<{ sec: number | null; status: number; note: string }> {
  const res = await fetch(`https://www.youtube.com/youtubei/v1/player?prettyPrint=false${c.key ? `&key=${c.key}` : ""}`, {
    method: "POST", headers: { "content-type": "application/json", "user-agent": UA["user-agent"], ...(c.headers ?? {}) }, signal: AbortSignal.timeout(8000),
    body: JSON.stringify({ context: { client: c.client, ...(c.thirdParty ? { thirdParty: { embedUrl: "https://www.youtube.com/" } } : {}) }, videoId, contentCheckOk: true, racyCheckOk: true }),
  });
  const text = await res.text();
  const sec = Number(text.match(/"lengthSeconds":"(\d+)"/)?.[1]);
  const note = text.match(/"status":"([A-Z_]+)"/)?.[1] ?? "";
  return { sec: Number.isFinite(sec) && sec > 0 ? sec : null, status: res.status, note };
}

/** Last resort: YouTube's search results page names the length of every hit (the highlights code reads
 * it the same way, and that works from Vercel) · about 1 MB a call, so a few per poll. */
async function searchLength(videoId: string, title: string): Promise<number | null> {
  try {
    const hits = await searchVideos(title.slice(0, 80));
    return hits.find((h) => h.videoId === videoId)?.seconds ?? null;
  } catch { return null; }
}

/** The video's length · the innertube clients in order, then the watch page. Null when nothing answered. */
async function readDuration(videoId: string): Promise<number | null> {
  for (const c of PLAYER_CLIENTS) {
    try { const r = await playerLength(videoId, c); if (r.sec) return r.sec; } catch { /* next client */ }
  }
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, { headers: UA, signal: AbortSignal.timeout(9000) });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/"lengthSeconds":"(\d+)"/) ?? html.match(/"approxDurationMs":"(\d+)"/);
    if (!m) return null;
    const n = Number(m[1]);
    return m[0].startsWith('"approx') ? Math.round(n / 1000) : n;
  } catch { return null; }
}

/** Diagnostics: what each length source answers for one video (the page shows nothing of this). */
export async function probeDuration(videoId: string): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const c of PLAYER_CLIENTS) {
    try { out[c.name] = await playerLength(videoId, c); } catch (e) { out[c.name] = { error: String((e as Error).message).slice(0, 100) }; }
  }
  return out;
}

/** Fetch every channel, store what is new, read a few lengths, prune. */
export async function pollVideos(opts: { force?: boolean } = {}): Promise<{ added: number; measured: number; errors: string[]; pending?: number; sample?: unknown }> {
  await ensureTable();
  if (!opts.force && Date.now() - (await lastPoll()) < POLL_EVERY_MS) return { added: 0, measured: 0, errors: ["throttled"] };
  await stampPoll();
  const errors: string[] = [];
  const results = await Promise.allSettled(ALL_CHANNELS.map(async (c) => ({ c, entries: await fetchFeed(c.id) })));
  const known = new Set((await db.select({ id: ytVideos.videoId }).from(ytVideos).catch(() => [])).map((r) => r.id));
  const cutoff = Date.now() - 45 * 86400_000;
  let added = 0;
  const now = new Date();
  for (const r of results) {
    if (r.status === "rejected") { errors.push(String((r.reason as Error)?.message ?? r.reason).slice(0, 60)); continue; }
    const { c, entries } = r.value;
    for (const e of entries) {
      if (known.has(e.videoId)) continue;
      if (e.publishedAt < cutoff) continue;
      if (/#shorts?\b/i.test(e.title)) continue;
      if (c.filter && !c.filter.test(e.title)) continue;
      try {
        await db.insert(ytVideos).values({ videoId: e.videoId, channelId: c.id, title: e.title, publishedAt: new Date(e.publishedAt), thumbnail: e.thumbnail, fetchedAt: now });
        known.add(e.videoId); added += 1;
      } catch { /* raced */ }
    }
  }
  // Lengths · newest first, a few per poll. A video whose page says nothing (a live stream in
  // progress, a premiere) is left null and tried again next time; after 45 days it is gone anyway.
  let measured = 0;
  let sample: unknown = null;
  const pending = await db.select({ videoId: ytVideos.videoId, title: ytVideos.title }).from(ytVideos).where(isNull(ytVideos.durationSec)).orderBy(desc(ytVideos.publishedAt)).limit(DURATION_BUDGET).catch((e) => { errors.push(`pending: ${String((e as Error).message).slice(0, 80)}`); return []; });
  let searches = 0;
  for (const p of pending) {
    let sec = await readDuration(p.videoId);
    if (sec === null && searches < SEARCH_BUDGET) { searches += 1; sec = await searchLength(p.videoId, p.title); }
    if (sample === null) sample = { videoId: p.videoId, sec };
    if (sec === null) continue;
    // Shorts and clips under 75 s do not belong on the page · 0 marks "measured, not shown".
    await db.update(ytVideos).set({ durationSec: sec < 75 ? 0 : sec }).where(eq(ytVideos.videoId, p.videoId)).catch(() => {});
    measured += 1;
  }
  try { await db.delete(ytVideos).where(lt(ytVideos.publishedAt, new Date(cutoff))); } catch { /* best effort */ }
  return { added, measured, errors, pending: pending.length, sample };
}

const toVideo = (r: typeof ytVideos.$inferSelect): Video => ({
  videoId: r.videoId, channelId: r.channelId, channel: channelById(r.channelId)?.name ?? "YouTube", title: r.title,
  publishedAt: r.publishedAt.getTime(), durationSec: r.durationSec, thumbnail: r.thumbnail ?? `https://i.ytimg.com/vi/${r.videoId}/hqdefault.jpg`, watched: r.watchedAt !== null,
});

/** What the page shows · `enabled` = watch-later channel ids switched on in Settings (null = all). */
export async function listVideos(enabled: string[] | null = null): Promise<VideoFeed> {
  await ensureTable();
  const picks = await Promise.all(DAILY_PICKS.map(async (channel) => {
    const [row] = await db.select().from(ytVideos).where(and(eq(ytVideos.channelId, channel.id), sql`(${ytVideos.durationSec} IS NULL OR ${ytVideos.durationSec} <> 0)`)).orderBy(desc(ytVideos.publishedAt)).limit(1).catch(() => []);
    return { channel, video: row ? toVideo(row) : null };
  }));
  const laterChannels = WATCH_LATER.filter((c) => !enabled || enabled.includes(c.id));
  const since = new Date(Date.now() - LATER_WINDOW_DAYS * 86400_000);
  const rows = laterChannels.length
    ? await db.select().from(ytVideos).where(and(inArray(ytVideos.channelId, laterChannels.map((c) => c.id)), gte(ytVideos.publishedAt, since), isNull(ytVideos.watchedAt), sql`(${ytVideos.durationSec} IS NULL OR ${ytVideos.durationSec} <> 0)`)).catch(() => [])
    : [];
  const rank = (id: string) => channelById(id)?.priority ?? 99;
  // At most PER_CHANNEL per channel (The Diary Of A CEO posts ten a fortnight and would bury the rest).
  const seen = new Map<string, number>();
  const later = rows.map(toVideo).sort((a, b) => rank(a.channelId) - rank(b.channelId) || b.publishedAt - a.publishedAt)
    .filter((v) => { const n = (seen.get(v.channelId) ?? 0) + 1; seen.set(v.channelId, n); return n <= PER_CHANNEL; });
  return { picks, later, fetchedAt: Date.now() };
}

/** Mark watched / unwatched · the desired final state, so outbox replays are safe. */
export async function setVideoWatched(videoId: string, watched: boolean): Promise<void> {
  await ensureTable();
  await db.update(ytVideos).set({ watchedAt: watched ? new Date() : null }).where(eq(ytVideos.videoId, videoId));
}
