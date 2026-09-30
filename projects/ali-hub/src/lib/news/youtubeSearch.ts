/**
 * Live YouTube channel search for Settings (2026-09-12). Server-only.
 *
 * No API key and no cost: it fetches the public search results page with the "channels"
 * filter (the same page a browser gets) and reads the embedded `ytInitialData` JSON. Around
 * 1 MB per search, one request per keystroke pause, nothing stored. If Google ever changes
 * that page, set YOUTUBE_API_KEY in Vercel and the official Data API is tried first
 * (its free quota is 10,000 units/day; a channel search costs 100, so ~100 searches/day).
 *
 * Pasted links work too: youtube.com/channel/UC…, youtube.com/@handle, or a bare @handle.
 */

export type ChannelHit = { id: string; name: string; handle?: string; subs?: string; thumb?: string; about?: string };

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  "Accept-Language": "en",
  Cookie: "CONSENT=YES+cb; SOCS=CAI",
};

export async function searchChannels(raw: string): Promise<ChannelHit[]> {
  const q = raw.trim().slice(0, 100);
  if (q.length < 2) return [];
  const idInUrl = q.match(/youtube\.com\/channel\/(UC[\w-]{22})/i)?.[1] ?? q.match(/^(UC[\w-]{22})$/)?.[1];
  const handleInUrl = q.match(/youtube\.com\/(@[\w.-]+)/i)?.[1];
  const query = idInUrl ?? handleInUrl ?? q;
  if (process.env.YOUTUBE_API_KEY) {
    const hits = await viaApi(query).catch(() => null);
    if (hits && hits.length) return hits;
  }
  return viaPage(query);
}

async function viaPage(query: string): Promise<ChannelHit[]> {
  const params = new URLSearchParams({ search_query: query, sp: "EgIQAg==", hl: "en" });
  const res = await fetch(`https://www.youtube.com/results?${params}`, { headers: HEADERS, signal: AbortSignal.timeout(9000) });
  if (!res.ok) throw new Error(`youtube ${res.status}`);
  const html = await res.text();
  const m = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
  if (!m) throw new Error("ytInitialData not found");
  const data: unknown = JSON.parse(m[1]);
  const hits: ChannelHit[] = [];
  const seen = new Set<string>();
  walk(data, (c) => {
    const id = str(c.channelId);
    if (!id || seen.has(id)) return;
    seen.add(id);
    const title = str((c.title as Rec | undefined)?.simpleText);
    if (!title) return;
    // YouTube has swapped these two fields over the years: read whichever holds what.
    const a = str((c.subscriberCountText as Rec | undefined)?.simpleText);
    const b = str((c.videoCountText as Rec | undefined)?.simpleText);
    const canonical = str(((c.navigationEndpoint as Rec | undefined)?.browseEndpoint as Rec | undefined)?.canonicalBaseUrl);
    const handle = canonical?.startsWith("/@") ? canonical.slice(1) : [a, b].find((t) => t?.startsWith("@"));
    const subs = [a, b].find((t) => /subscriber/i.test(t ?? ""));
    const thumbs = (c.thumbnail as Rec | undefined)?.thumbnails;
    let thumb = Array.isArray(thumbs) ? str((thumbs[0] as Rec | undefined)?.url) : undefined;
    if (thumb?.startsWith("//")) thumb = `https:${thumb}`;
    const runs = (c.descriptionSnippet as Rec | undefined)?.runs;
    const about = Array.isArray(runs) ? runs.map((r) => str((r as Rec).text) ?? "").join("").slice(0, 140) : undefined;
    hits.push({ id, name: title, handle, subs, thumb, about: about || undefined });
  });
  return hits.slice(0, 12);
}

async function viaApi(query: string): Promise<ChannelHit[]> {
  const params = new URLSearchParams({ part: "snippet", type: "channel", maxResults: "10", q: query, key: process.env.YOUTUBE_API_KEY ?? "" });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`api ${res.status}`);
  const data = (await res.json()) as { items?: { id?: { channelId?: string }; snippet?: { title?: string; description?: string; thumbnails?: { default?: { url?: string } } } }[] };
  return (data.items ?? [])
    .map((it) => ({ id: it.id?.channelId ?? "", name: it.snippet?.title ?? "", thumb: it.snippet?.thumbnails?.default?.url, about: it.snippet?.description?.slice(0, 140) || undefined }))
    .filter((h) => h.id && h.name);
}

type Rec = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

// ─── Video search (highlights, 2026-09-14 night) ──────────────────────────────
export type VideoHit = { videoId: string; title: string; channel: string; views: number; seconds: number; ageHours: number | null };

/** "1,234,567 views" / "1.2M views" / "87K views" → number (0 when unreadable). */
export function parseViews(t: string | undefined): number {
  if (!t) return 0;
  const m = t.replace(/,/g, "").match(/([\d.]+)\s*([KMB])?/i);
  if (!m) return 0;
  const n = parseFloat(m[1]); const u = (m[2] ?? "").toUpperCase();
  return Math.round(n * (u === "B" ? 1e9 : u === "M" ? 1e6 : u === "K" ? 1e3 : 1));
}
/** "3 days ago" / "22 hours ago" / "Streamed 2 weeks ago" → hours (null when unreadable) · used to keep a
 * national-team video to the match just played, not the same two sides at a tournament years ago. */
export function parseAge(t: string | undefined): number | null {
  if (!t) return null;
  const m = t.match(/(\d+)\s*(minute|hour|day|week|month|year)s?\s+ago/i);
  if (!m) return null;
  const n = Number(m[1]);
  const per: Record<string, number> = { minute: 1 / 60, hour: 1, day: 24, week: 168, month: 730, year: 8760 };
  return n * (per[m[2].toLowerCase()] ?? 24);
}
const parseLen = (t: string | undefined): number => {
  if (!t) return 0;
  const parts = t.split(":").map(Number);
  if (parts.some((x) => Number.isNaN(x))) return 0;
  return parts.reduce((acc, x) => acc * 60 + x, 0);
};

/** YouTube's own filters: videos only · videos uploaded this week · this month. */
const SP: Record<"any" | "week" | "month", string> = { any: "EgIQAQ==", week: "EgQIAxAB", month: "EgQIBBAB" };

/** Public video search (the "videos" filter of the results page) · no key, no cost.
 * `recent` narrows to this week / this month (national-team matches: only videos uploaded after the game). */
export async function searchVideos(query: string, opts: { recent?: "week" | "month" } = {}): Promise<VideoHit[]> {
  const params = new URLSearchParams({ search_query: query.slice(0, 120), sp: SP[opts.recent ?? "any"], hl: "en" });
  const res = await fetch(`https://www.youtube.com/results?${params}`, { headers: HEADERS, signal: AbortSignal.timeout(9000) });
  if (!res.ok) throw new Error(`youtube ${res.status}`);
  const html = await res.text();
  const m = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
  if (!m) throw new Error("ytInitialData not found");
  const data: unknown = JSON.parse(m[1]);
  const hits: VideoHit[] = [];
  const seen = new Set<string>();
  walkVideos(data, (v) => {
    const id = str(v.videoId);
    if (!id || seen.has(id)) return;
    seen.add(id);
    const runs = (v.title as Rec | undefined)?.runs;
    const title = Array.isArray(runs) ? runs.map((r) => str((r as Rec).text) ?? "").join("") : "";
    const owner = ((v.ownerText as Rec | undefined)?.runs as Rec[] | undefined)?.[0];
    const channel = str(owner?.text) ?? "";
    const views = parseViews(str((v.viewCountText as Rec | undefined)?.simpleText));
    const seconds = parseLen(str((v.lengthText as Rec | undefined)?.simpleText));
    const pubRuns = (v.publishedTimeText as Rec | undefined)?.runs;
    const ageHours = parseAge(str((v.publishedTimeText as Rec | undefined)?.simpleText) ?? (Array.isArray(pubRuns) ? pubRuns.map((r) => str((r as Rec).text) ?? "").join("") : undefined));
    if (title) hits.push({ videoId: id, title, channel, views, seconds, ageHours });
  });
  return hits.slice(0, 20);
}
function walkVideos(node: unknown, onVideo: (v: Rec) => void): void {
  if (Array.isArray(node)) { for (const v of node) walkVideos(v, onVideo); return; }
  if (!node || typeof node !== "object") return;
  const r = node as Rec;
  if (r.videoRenderer && typeof r.videoRenderer === "object") onVideo(r.videoRenderer as Rec);
  for (const v of Object.values(r)) walkVideos(v, onVideo);
}

/** Depth-first visit of every `channelRenderer` object in YouTube's page data. */
function walk(node: unknown, onChannel: (c: Rec) => void): void {
  if (Array.isArray(node)) { for (const v of node) walk(v, onChannel); return; }
  if (!node || typeof node !== "object") return;
  const r = node as Rec;
  if (r.channelRenderer && typeof r.channelRenderer === "object") onChannel(r.channelRenderer as Rec);
  for (const v of Object.values(r)) walk(v, onChannel);
}
