/**
 * GET /api/workouts/coach-cron
 * Called by Vercel Cron every Monday at 07:00 UTC.
 * Generates coach card for all users directly (no self-fetch).
 */

export const maxDuration = 60;

import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { generateCoachCard } from "@/lib/workouts/generateCoach";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allUsers = await db.select().from(users);
  const results = { ok: 0, failed: 0 };

  for (const user of allUsers) {
    try {
      await generateCoachCard(user.id);
      results.ok++;
    } catch (err) {
      console.error(`[coach-cron] Failed for user ${user.id}:`, err);
      results.failed++;
    }
  }

  return NextResponse.json({ ok: true, generated: results.ok, failed: results.failed });
}
