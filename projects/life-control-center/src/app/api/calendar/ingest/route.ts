/**
 * POST /api/calendar/ingest · the scheduled Claude routine's door (2026-09-08).
 *
 * The work Google Workspace blocks its secret ICS, so a scheduled Claude routine
 * reads Ali's work calendar through his claude.ai Google Calendar connector a few
 * times a day and posts the day's merged blocks here. Replaces that day's ingested
 * set atomically; blocksForDay merges them with the personal ICS feed on every read.
 *
 * Auth: x-ingest-key header (long random, checked in constant fashion; not APP_KEY
 * so the routine never holds the app's master key). Body:
 *   { date: "YYYY-MM-DD", blocks: [{ source?, start: "HH:MM", end: "HH:MM", count?, title? }] }
 */

import { NextResponse } from "next/server";
import { db } from "@/db";
import { calendarCache } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getUserId } from "@/lib/user";
import { blocksForDay, type CalBlock } from "@/lib/calendar/server";

export const dynamic = "force-dynamic";

const INGEST_KEY = "d740fe585d04c05f4cbf1ddeee38ca7c813ad2e5549efd43";
const HM = /^\d{2}:\d{2}$/, YMD = /^\d{4}-\d{2}-\d{2}$/;
const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

export async function POST(req: Request) {
  if (req.headers.get("x-ingest-key") !== INGEST_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "no user" }, { status: 500 });

  let body: { date?: string; blocks?: unknown[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  if (!body.date || !YMD.test(body.date) || !Array.isArray(body.blocks)) {
    return NextResponse.json({ error: "need date + blocks[]" }, { status: 400 });
  }

  const blocks: CalBlock[] = [];
  for (const raw of body.blocks.slice(0, 40)) {
    const b = raw as { source?: string; start?: string; end?: string; count?: number; title?: string };
    if (typeof b.start !== "string" || !HM.test(b.start) || typeof b.end !== "string" || !HM.test(b.end)) continue;
    const source = b.source === "personal" ? "personal" as const : "work" as const;
    const count = Number.isFinite(Number(b.count)) && Number(b.count) > 0 ? Math.round(Number(b.count)) : 1;
    blocks.push({
      key: `${source}:${b.start}-${b.end}`,
      source,
      start: b.start,
      end: b.end,
      startMin: toMin(b.start),
      count,
      title: typeof b.title === "string" && b.title.trim()
        ? b.title.trim().slice(0, 80)
        : count === 1 ? "1 meeting" : `${count} meetings`,
    });
  }
  blocks.sort((a, b) => a.startMin - b.startMin);

  const key = `ing:${body.date}`;
  const now = new Date();
  try { await db.insert(calendarCache).values({ userId, date: key, payload: JSON.stringify(blocks), fetchedAt: now }); }
  catch { await db.update(calendarCache).set({ payload: JSON.stringify(blocks), fetchedAt: now }).where(and(eq(calendarCache.userId, userId), eq(calendarCache.date, key))); }

  // Echo the merged day back so the routine (and tests) can verify end to end.
  const merged = await blocksForDay(userId, body.date, true);
  return NextResponse.json({ ok: true, stored: blocks.length, merged: merged.blocks });
}
