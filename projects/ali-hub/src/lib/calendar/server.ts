/**
 * Google Calendar → tickable blocks (2026-09-08, server only).
 *
 * Feeds are the calendars' SECRET iCAL ADDRESSES (Google Calendar → settings →
 * "Secret address in iCal format") stored in user_settings.calendar_feeds as
 * JSON [{ name: "Work" | "Personal", url }]. No OAuth, read-only, one-way.
 *
 * Work: the whole day collapses into AT MOST TWO blocks (Ali, 2026-09-11 · the old
 * "merge meetings ≤ 30 min apart" rule produced 5-6 rows on a sales day):
 *   · Morning   = first meeting of the morning → start of Ali's "Lunch block"
 *   · Afternoon = end of the "Lunch block"     → start of his "Evening block"
 * The boundaries come from Ali's own time-blocking events in the work calendar
 * (titles containing "block"); they are never meetings themselves. Without a lunch
 * marker the day splits at 14:00 (his usual lunch). See collapseWorkDay().
 * Personal feed: rare, important → each event stays its own row.
 * node-ical (lazy import) handles ICS + recurring events (RRULE).
 */

import { db } from "@/db";
import { calendarCache, userSettings } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const TZ = "Europe/Madrid";
const DEFAULT_LUNCH_MIN = 14 * 60; // fallback split when no "Lunch block" event exists
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
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { "user-agent": "ali-hub/1.0 (personal dashboard)" } });
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
  // Personal events are rare and each one matters · no merging. Work events are
  // returned one per row too (count 1, real title) · collapseWorkDay() folds them
  // into the two day halves on every read, together with the ingested ones.
  return sorted.map((e) => {
    const s = hm(e.start), en = hm(e.end);
    return { key: `${source}:${s}-${en}`, source, start: s, end: en, startMin: toMin(s), count: 1, title: e.summary };
  });
}

const minToHm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const endMin = (b: CalBlock) => { const e = toMin(b.end); return e < b.startMin ? e + 24 * 60 : e; };
/** Ali's time-blocking placeholders ("Morning block", "Lunch block", "Evening block") · never meetings. */
const isMarker = (b: CalBlock) => /\bblock\b/i.test(b.title);

/**
 * All of the day's work items (meetings + Ali's time-block markers, from the ICS
 * feed and/or the ingest routine, possibly already partly merged) → at most two
 * tickable blocks: Morning and Afternoon. Counts are summed, so pre-merged input
 * ("4 meetings") and raw events both work.
 */
export function collapseWorkDay(items: CalBlock[]): CalBlock[] {
  const work = items.filter((b) => b.source === "work");
  if (work.length === 0) return [];
  const lunch = work.find((b) => isMarker(b) && /lunch/i.test(b.title));
  const evening = work.find((b) => isMarker(b) && /evening/i.test(b.title));
  const meetings = work.filter((b) => !isMarker(b)).sort((a, b) => a.startMin - b.startMin);
  if (meetings.length === 0) return [];

  const lunchStart = lunch ? lunch.startMin : DEFAULT_LUNCH_MIN;
  const lunchEnd = lunch ? endMin(lunch) : DEFAULT_LUNCH_MIN;
  const morning = meetings.filter((m) => m.startMin < lunchStart);
  const afternoon = meetings.filter((m) => m.startMin >= lunchStart);
  const sum = (xs: CalBlock[]) => xs.reduce((n, x) => n + Math.max(1, x.count), 0);
  const label = (n: number) => (n === 1 ? "1 meeting" : `${n} meetings`);

  const out: CalBlock[] = [];
  if (morning.length) {
    const startMin = morning[0].startMin;
    // Morning runs until lunch starts (or until the last morning meeting ends if there
    // is no lunch marker, or if a meeting spills past the lunch start).
    const lastEnd = Math.max(...morning.map(endMin));
    const end = lunch ? Math.max(lunchStart, lastEnd) : lastEnd;
    const s = minToHm(startMin), en = minToHm(Math.min(end, 24 * 60 - 1));
    out.push({ key: `work:${s}-${en}`, source: "work", start: s, end: en, startMin, count: sum(morning), title: `Morning · ${label(sum(morning))}` });
  }
  if (afternoon.length) {
    // Afternoon starts when lunch ends (or at the first meeting if that is later) and
    // runs until the evening block starts, or the last meeting ends.
    const startMin = lunch ? Math.min(lunchEnd, afternoon[0].startMin) : afternoon[0].startMin;
    const lastEnd = Math.max(...afternoon.map(endMin));
    const end = evening ? Math.max(evening.startMin, lastEnd) : lastEnd;
    const s = minToHm(startMin), en = minToHm(Math.min(end, 24 * 60 - 1));
    out.push({ key: `work:${s}-${en}`, source: "work", start: s, end: en, startMin, count: sum(afternoon), title: `Afternoon · ${label(sum(afternoon))}` });
  }
  return out;
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

/** Feed + ingested items → personal rows as they are, work items collapsed into ≤ 2 blocks. */
function mergeBlocks(a: CalBlock[], b: CalBlock[]): CalBlock[] {
  const seen = new Set<string>();
  const all = [...a, ...b].filter((x) => (seen.has(x.key) ? false : (seen.add(x.key), true)));
  return [...all.filter((x) => x.source === "personal"), ...collapseWorkDay(all)]
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
