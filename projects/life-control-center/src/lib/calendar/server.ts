/**
 * Google Calendar → tickable blocks (2026-09-08, server only).
 *
 * Feeds are the calendars' SECRET iCAL ADDRESSES (Google Calendar → settings →
 * "Secret address in iCal format") stored in user_settings.calendar_feeds as
 * JSON [{ name: "Work" | "Personal", url }]. No OAuth, read-only, one-way.
 *
 * Work feed: same-day meetings with gaps ≤ 30 min merge into one block
 * ("Work block · 9:30-12:30 · 4 meetings") so a sales day is 2-3 ticks, not 8 rows.
 * Personal feed: rare, important → each event stays its own row.
 * node-ical (lazy import) handles ICS + recurring events (RRULE).
 */

import { db } from "@/db";
import { calendarCache, userSettings } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const TZ = "Europe/Madrid";
const MERGE_GAP_MS = 30 * 60 * 1000;
const CACHE_TTL_MS = 10 * 60 * 1000;

export type CalBlock = {
  key: string;                 // stable within the day: source + start-end
  source: "work" | "personal";
  start: string;               // HH:MM (Madrid)
  end: string;                 // HH:MM
  startMin: number;            // minutes since midnight, for timeline ordering
  count: number;               // merged meetings in the block
  title: string;               // "4 meetings" / the event's name
};

export type CalFeed = { name: string; url: string };

const hm = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
const ymdOf = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

type RawEvent = { start: Date; end: Date; summary: string };

/** node-ical summaries can be plain strings or { params, val } objects. */
const summaryText = (s: unknown): string =>
  typeof s === "string" ? s : (s && typeof s === "object" && "val" in s ? String((s as { val: unknown }).val) : "busy");

/** All of `day`'s (YYYY-MM-DD, Madrid) timed events from one ICS feed. */
export async function fetchDayEvents(url: string, day: string): Promise<RawEvent[]> {
  const ical = await import("node-ical");
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { "user-agent": "ali-control-center" } });
  if (!res.ok) throw new Error(`ics ${res.status}`);
  const data = ical.sync.parseICS(await res.text());

  // Recurrence window: generous bounds around the day, then filter by Madrid date.
  const dayMs = new Date(`${day}T12:00:00Z`).getTime();
  const winStart = new Date(dayMs - 48 * 3600_000);
  const winEnd = new Date(dayMs + 48 * 3600_000);

  const out: RawEvent[] = [];
  for (const k of Object.keys(data)) {
    const ev = data[k] as import("node-ical").VEvent;
    if (ev.type !== "VEVENT" || !ev.start) continue;
    if (String(ev.status ?? "").toUpperCase() === "CANCELLED") continue;

    if (ev.rrule) {
      // node-ical's own expander · handles EXDATE, RECURRENCE-ID overrides and DST.
      for (const inst of ical.expandRecurringEvent(ev, { from: winStart, to: winEnd })) {
        if (inst.isFullDay) continue;
        if (ymdOf(inst.start) === day) {
          out.push({ start: inst.start, end: inst.end ?? inst.start, summary: summaryText(inst.summary) });
        }
      }
    } else {
      const dateOnly = (ev.datetype as string) === "date" || (ev.start as Date & { dateOnly?: boolean }).dateOnly === true;
      if (dateOnly) continue; // all-day
      if (ymdOf(ev.start) === day) {
        out.push({ start: ev.start, end: ev.end ?? ev.start, summary: summaryText(ev.summary) });
      }
    }
  }
  return out;
}

function toBlocks(events: RawEvent[], source: "work" | "personal"): CalBlock[] {
  const sorted = [...events].sort((a, b) => a.start.getTime() - b.start.getTime());
  const blocks: CalBlock[] = [];

  if (source === "personal") {
    // Personal events are rare and each one matters · no merging.
    for (const e of sorted) {
      const s = hm(e.start), en = hm(e.end);
      blocks.push({ key: `personal:${s}-${en}`, source, start: s, end: en, startMin: toMin(s), count: 1, title: e.summary });
    }
    return blocks;
  }

  let cur: { start: Date; end: Date; count: number } | null = null;
  const flush = () => {
    if (!cur) return;
    const s = hm(cur.start), en = hm(cur.end);
    blocks.push({
      key: `work:${s}-${en}`, source, start: s, end: en, startMin: toMin(s),
      count: cur.count, title: cur.count === 1 ? "1 meeting" : `${cur.count} meetings`,
    });
    cur = null;
  };
  for (const e of sorted) {
    if (cur && e.start.getTime() - cur.end.getTime() <= MERGE_GAP_MS) {
      cur.end = new Date(Math.max(cur.end.getTime(), e.end.getTime()));
      cur.count += 1;
    } else {
      flush();
      cur = { start: e.start, end: e.end, count: 1 };
    }
  }
  flush();
  return blocks;
}

/**
 * Externally ingested blocks (2026-09-08): the work calendar's ICS is blocked by
 * the Workspace admin, so a scheduled Claude routine reads it through Ali's
 * claude.ai Google Calendar connector and POSTs the day's blocks to
 * /api/calendar/ingest. They live in calendar_cache under date "ing:<day>" and are
 * merged into every read; the feed fetch (personal calendar) never overwrites them.
 */
export async function ingestedBlocks(userId: string, day: string): Promise<CalBlock[]> {
  try {
    const [row] = await db.select().from(calendarCache)
      .where(and(eq(calendarCache.userId, userId), eq(calendarCache.date, `ing:${day}`)));
    return row ? (JSON.parse(row.payload) as CalBlock[]) : [];
  } catch { return []; }
}

function mergeBlocks(a: CalBlock[], b: CalBlock[]): CalBlock[] {
  const seen = new Set<string>();
  return [...a, ...b]
    .filter((x) => (seen.has(x.key) ? false : (seen.add(x.key), true)))
    .sort((x, y) => x.startMin - y.startMin);
}

export function parseFeeds(json: string | null): CalFeed[] {
  try {
    const arr = JSON.parse(json ?? "null");
    if (!Array.isArray(arr)) return [];
    return arr.filter((f): f is CalFeed => typeof f?.url === "string" && /^https:\/\//.test(f.url) && typeof f?.name === "string");
  } catch { return []; }
}

/** Today's blocks for a user · DB-cached 10 min, stale cache served on fetch errors. */
export async function blocksForDay(userId: string, day: string, fresh = false): Promise<{ blocks: CalBlock[]; configured: boolean; fetchedAt: number | null; errors: string[] }> {
  const [settings] = await db.select({ feeds: userSettings.calendarFeeds }).from(userSettings).where(eq(userSettings.userId, userId));
  const feeds = parseFeeds(settings?.feeds ?? null);
  const ingested = await ingestedBlocks(userId, day);
  if (feeds.length === 0) return { blocks: ingested, configured: ingested.length > 0, fetchedAt: null, errors: [] };

  const [cached] = await db.select().from(calendarCache)
    .where(and(eq(calendarCache.userId, userId), eq(calendarCache.date, day))).catch(() => []);
  if (!fresh && cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
    return { blocks: mergeBlocks(JSON.parse(cached.payload) as CalBlock[], ingested), configured: true, fetchedAt: cached.fetchedAt.getTime(), errors: [] };
  }

  // One broken feed must not hide the other one's blocks.
  const perFeed = await Promise.allSettled(feeds.map(async (f) => {
    const source = /personal/i.test(f.name) ? "personal" as const : "work" as const;
    return toBlocks(await fetchDayEvents(f.url, day), source);
  }));
  const ok = perFeed.filter((r): r is PromiseFulfilledResult<CalBlock[]> => r.status === "fulfilled");
  const errors = perFeed.flatMap((r, i) =>
    r.status === "rejected" ? [`${feeds[i].name}: ${String((r.reason as Error)?.message ?? r.reason).slice(0, 80)}`] : []);

  if (ok.length === 0) {
    // Google unreachable · the saved copy is better than an error.
    if (cached) return { blocks: mergeBlocks(JSON.parse(cached.payload) as CalBlock[], ingested), configured: true, fetchedAt: cached.fetchedAt.getTime(), errors };
    return { blocks: ingested, configured: true, fetchedAt: null, errors };
  }

  // Cache only the feed-fetched blocks · ingested ones live in their own row and are
  // merged on every read, so a routine update never fights a stale feed cache.
  const feedBlocks = ok.flatMap((r) => r.value).sort((a, b) => a.startMin - b.startMin);
  const now = new Date();
  try { await db.insert(calendarCache).values({ userId, date: day, payload: JSON.stringify(feedBlocks), fetchedAt: now }); }
  catch {
    try { await db.update(calendarCache).set({ payload: JSON.stringify(feedBlocks), fetchedAt: now }).where(and(eq(calendarCache.userId, userId), eq(calendarCache.date, day))); }
    catch { /* cache only */ }
  }
  return { blocks: mergeBlocks(feedBlocks, ingested), configured: true, fetchedAt: now.getTime(), errors };
}
