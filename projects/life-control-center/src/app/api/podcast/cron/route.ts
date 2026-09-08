/**
 * GET /api/podcast/cron · daily podcast generation.
 * Called by Vercel Cron at 04:40 UTC (06:40 Madrid summer / 05:40 winter) so the
 * episode is ready before breakfast. Idempotent; the reminders tick retries failures.
 * Auth: Vercel cron's Bearer CRON_SECRET, or ?key= for manual runs.
 */

export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ensureTodaysPodcast } from "@/lib/podcast/generate";

const CRON_KEY = "a019090fd3263431b3f1b99f0b1e1884";

export async function GET(req: NextRequest) {
  const bearerOk = req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  const keyOk = req.nextUrl.searchParams.get("key") === CRON_KEY;
  if (!bearerOk && !keyOk) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const force = req.nextUrl.searchParams.get("force") === "1";

  const allUsers = await db.select().from(users);
  const results: Record<string, string> = {};
  for (const u of allUsers) {
    try {
      const ep = await ensureTodaysPodcast(u.id, force);
      results[u.id] = `${ep.status}${ep.audioUrl ? " · audio ok" : ""} · attempts ${ep.attempts}`;
    } catch (e) {
      results[u.id] = `error: ${String((e as Error).message).slice(0, 120)}`;
    }
  }
  return NextResponse.json({ ok: true, results });
}
