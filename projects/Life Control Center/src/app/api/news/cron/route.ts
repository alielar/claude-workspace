/**
 * GET /api/news/cron
 * Called by Vercel Cron Jobs at 06:00 UTC daily (07:00 Madrid winter / 08:00 summer).
 * Protected by CRON_SECRET to prevent unauthorized triggering.
 *
 * Generates today's brief for every user. Idempotent — safe to call multiple times.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, newsBriefs } from "@/db/schema";
import { ensureTodaysBrief } from "@/lib/news/generateBrief";
import { lt } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allUsers = await db.select().from(users);
  const results = { ok: 0, failed: 0 };

  for (const user of allUsers) {
    try {
      await ensureTodaysBrief(user.id);
      results.ok++;
    } catch (err) {
      console.error(`[news-cron] Failed for user ${user.id}:`, err);
      results.failed++;
    }
  }

  // Prune briefs older than 30 days (all users) — runs after generation so today's data is safe
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  await db.delete(newsBriefs).where(lt(newsBriefs.createdAt, cutoff));

  if (results.failed > 0 && results.ok === 0) {
    return NextResponse.json({ error: "All users failed", ok: results.ok, failed: results.failed }, { status: 500 });
  }

  return NextResponse.json({ ok: true, generated: results.ok, failed: results.failed });
}
