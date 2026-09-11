/**
 * POST /api/workouts/run-ingest · receives running data from Apple Shortcut.
 * No authentication · same pattern as /api/sleep/ingest.
 *
 * GET /api/workouts/run-ingest · debug: shows recent ingested runs.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { runLogs } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getUserId } from "@/lib/user";

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function toStr(v: unknown): string | null {
  if (v == null || v === "") return null;
  return String(v);
}

export async function GET() {
  try {
    const rows = await db
      .select({
        date: runLogs.date,
        distanceKm: runLogs.distanceKm,
        durationSeconds: runLogs.durationSeconds,
        paceSecondsPerKm: runLogs.paceSecondsPerKm,
        notes: runLogs.notes,
        createdAt: runLogs.createdAt,
      })
      .from(runLogs)
      .orderBy(desc(runLogs.createdAt))
      .limit(5);
    return NextResponse.json({
      ok: true,
      endpoint: "run-ingest",
      timestamp: new Date().toISOString(),
      recentRuns: rows,
    });
  } catch {
    return NextResponse.json({ ok: true, endpoint: "run-ingest", timestamp: new Date().toISOString() });
  }
}

export async function POST(req: NextRequest) {
  console.log("[run-ingest] Received POST request");
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    console.error("[run-ingest] Invalid JSON body");
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  console.log("[run-ingest] Payload:", JSON.stringify(body));

  const userId = await getUserId();
  if (!userId) {
    console.error("[run-ingest] No user found");
    return NextResponse.json({ error: "No user found" }, { status: 500 });
  }

  const date = toStr(body.date);
  const distanceKm = toNum(body.distance_km);
  const durationSeconds = toNum(body.duration_seconds);
  const notes = toStr(body.notes);

  if (!date) {
    return NextResponse.json({ error: "date is required (YYYY-MM-DD)" }, { status: 400 });
  }
  if (!distanceKm || distanceKm <= 0) {
    return NextResponse.json({ error: "distance_km is required and must be > 0" }, { status: 400 });
  }
  if (!durationSeconds || durationSeconds <= 0) {
    return NextResponse.json({ error: "duration_seconds is required and must be > 0" }, { status: 400 });
  }

  // Normalize date
  let normalizedDate = date;
  if (date.includes("T")) {
    normalizedDate = date.split("T")[0];
  } else if (date.includes("/")) {
    const d = new Date(date);
    if (!isNaN(d.getTime())) {
      normalizedDate = d.toISOString().split("T")[0];
    }
  }

  const paceSecondsPerKm = Math.round(durationSeconds / distanceKm);

  try {
    const [run] = await db
      .insert(runLogs)
      .values({
        userId,
        date: normalizedDate,
        distanceKm,
        durationSeconds,
        paceSecondsPerKm,
        notes,
      })
      .returning();

    console.log(`[run-ingest] Success: date=${normalizedDate}, distance=${distanceKm}km, pace=${paceSecondsPerKm}s/km`);
    return NextResponse.json({ success: true, run });
  } catch (err) {
    console.error("[run-ingest] DB write failed:", err);
    return NextResponse.json({ error: "DB write failed", detail: String(err) }, { status: 500 });
  }
}
