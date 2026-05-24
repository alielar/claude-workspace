/**
 * GET /api/workouts/coach-cron
 * Called by Vercel Cron every Monday at 07:00 UTC.
 * Triggers coach card generation for all users.
 */

import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const base = process.env.NEXTAUTH_URL ?? "https://life-control-center.vercel.app";
    await fetch(`${base}/api/workouts/coach`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "cron" }),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
