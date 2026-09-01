/**
 * GET /api/news/archive          · list of saved briefs (last 30 days), newest first
 * GET /api/news/archive?date=... · full brief for a specific YYYY-MM-DD date
 *
 * DB-only reads. Zero Anthropic API calls.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { newsBriefs } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import type { NewsBrief } from "@/lib/news-brief";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const dateParam = req.nextUrl.searchParams.get("date");

  // ── Specific date ──────────────────────────────────────────────────────────
  if (dateParam) {
    const [row] = await db
      .select({ content: newsBriefs.content })
      .from(newsBriefs)
      .where(and(eq(newsBriefs.userId, userId), eq(newsBriefs.date, dateParam)));

    if (!row) return NextResponse.json(null);
    return NextResponse.json(JSON.parse(row.content) as NewsBrief);
  }

  // ── Archive list ───────────────────────────────────────────────────────────
  const rows = await db
    .select({ date: newsBriefs.date, content: newsBriefs.content })
    .from(newsBriefs)
    .where(eq(newsBriefs.userId, userId))
    .orderBy(desc(newsBriefs.date))
    .limit(30);

  const entries = rows.map(row => {
    const brief = JSON.parse(row.content) as NewsBrief;
    return {
      date: row.date,
      storyCount: brief.stories?.length ?? 0,
      topHeadline: brief.stories?.[0]?.headline ?? "",
      generatedAt: brief.generatedAt,
    };
  });

  return NextResponse.json(entries);
}
