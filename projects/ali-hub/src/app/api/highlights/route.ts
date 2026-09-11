/**
 * GET /api/highlights → { items: Highlight[] } · spoiler-free football highlights
 * (matchup + context only; the News page turns each into a YouTube link).
 * The reminders tick polls every 5 min; if the table looks stale (> 15 min) or
 * empty, this poll runs inline with a short budget so the first open is not blank.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listHighlights, pollHighlights } from "@/lib/news/highlights";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let items = await listHighlights().catch(() => []);
  const newest = items[0]?.publishedAt ?? 0;
  if (items.length === 0 || Date.now() - newest > 15 * 60 * 1000) {
    await Promise.race([pollHighlights().catch(() => null), new Promise((r) => setTimeout(r, 7000))]);
    items = await listHighlights().catch(() => items);
  }
  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}
