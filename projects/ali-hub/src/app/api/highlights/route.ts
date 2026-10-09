/**
 * GET /api/highlights → { items: Highlight[] } · spoiler-free football highlights
 * (matchup + context only; the News page turns each into a YouTube link).
 * The reminders tick polls every 5 min; if the table looks stale (> 15 min) or
 * empty, this poll runs inline with a short budget so the first open is not blank.
 *
 * ?scan=national[&days=8] · run the national-team scan now (the backfill after a deploy,
 * or a check) and answer with what it did · ?national=1 · the ranking + tracked teams.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listHighlights, pollHighlights, pruneHighlights } from "@/lib/news/highlights";
import { nationalStatus, pollNational } from "@/lib/news/national";
import { getProfile } from "@/lib/profile/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  if (url.searchParams.get("scan") === "national") {
    const days = Math.min(14, Math.max(1, Number(url.searchParams.get("days") ?? 8) || 8));
    const scan = await pollNational({ force: true, days, budget: Number(url.searchParams.get("budget") ?? 8) || 8 });
    await pruneHighlights();
    return NextResponse.json({ scan, status: await nationalStatus() }, { headers: { "Cache-Control": "no-store" } });
  }
  if (url.searchParams.get("national")) return NextResponse.json(await nationalStatus(), { headers: { "Cache-Control": "no-store" } });
  // Football switched off in the profile (a guest's choice, 2026-10-09) · an empty list, nothing polled.
  const { profile } = await getProfile(session.user.id);
  if (!profile.football) return NextResponse.json({ items: [] }, { headers: { "Cache-Control": "no-store" } });
  let items = await listHighlights(60, session.user.id).catch(() => []);
  const newest = items[0]?.publishedAt ?? 0;
  if (items.length === 0 || Date.now() - newest > 15 * 60 * 1000) {
    await Promise.race([pollHighlights({ search: false }).catch(() => null), new Promise((r) => setTimeout(r, 7000))]);
    items = await listHighlights(60, session.user.id).catch(() => items);
  }
  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}
