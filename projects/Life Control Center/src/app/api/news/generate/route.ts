/**
 * POST /api/news/generate — manually trigger today's brief (or return cached version).
 * GET  /api/news/generate — fetch today's cached brief without generating.
 */

export const maxDuration = 60;

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { newsBriefs, userSettings } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { todayInTz } from "@/lib/utils";
import { ensureTodaysBrief } from "@/lib/news/generateBrief";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const brief = await ensureTodaysBrief(session.user.id);
    return NextResponse.json(brief);
  } catch (err) {
    console.error("[news-generate] Failed:", err);
    return NextResponse.json({ error: "Failed to generate brief" }, { status: 500 });
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  const tz = settings?.timezone ?? "Europe/Madrid";
  const today = todayInTz(tz);

  const [existing] = await db
    .select()
    .from(newsBriefs)
    .where(and(eq(newsBriefs.userId, userId), eq(newsBriefs.date, today)));

  if (existing) return NextResponse.json(JSON.parse(existing.content));
  return NextResponse.json(null);
}
