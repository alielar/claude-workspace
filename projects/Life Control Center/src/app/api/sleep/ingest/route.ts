import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { getUserId } from "@/lib/user";

/** Coerce value to number or null (Apple Shortcuts sometimes sends strings) */
function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

/** Coerce to string or null */
function toStr(v: unknown): string | null {
  if (v == null || v === "") return null;
  return String(v);
}

/**
 * POST /api/sleep/ingest — receives sleep data from Apple Shortcut.
 * No authentication — security by obscurity (personal use only).
 *
 * GET /api/sleep/ingest — health check for debugging shortcut connectivity.
 */
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "sleep-ingest", timestamp: new Date().toISOString() });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "No user found" }, { status: 500 });
  }

  const raw = JSON.stringify(body);

  // Extract and coerce fields — Apple Shortcuts can send numbers as strings
  const date = toStr(body.date);
  const bedtime = toStr(body.bedtime);
  const wake_time = toStr(body.wake_time);
  const duration_minutes = toNum(body.duration_minutes);
  const stage_deep_minutes = toNum(body.stage_deep_minutes);
  const stage_core_minutes = toNum(body.stage_core_minutes);
  const stage_rem_minutes = toNum(body.stage_rem_minutes);
  const stage_awake_minutes = toNum(body.stage_awake_minutes);
  const heart_rate_avg = toNum(body.heart_rate_avg);
  const heart_rate_min = toNum(body.heart_rate_min);
  const heart_rate_max = toNum(body.heart_rate_max);
  const respiratory_rate_avg = toNum(body.respiratory_rate_avg);
  const blood_oxygen_avg = toNum(body.blood_oxygen_avg);
  const sleep_score = toNum(body.sleep_score);

  // date is required — accept YYYY-MM-DD or other formats
  if (!date) {
    return NextResponse.json({ error: "date is required", received: body }, { status: 400 });
  }

  // Normalize date to YYYY-MM-DD (Apple Shortcuts can send various formats)
  let normalizedDate = date;
  if (date.includes("T")) {
    normalizedDate = date.split("T")[0];
  } else if (date.includes("/")) {
    // Handle MM/DD/YYYY or DD/MM/YYYY — try to parse
    const d = new Date(date);
    if (!isNaN(d.getTime())) {
      normalizedDate = d.toISOString().split("T")[0];
    }
  }

  // Compute hours from duration_minutes or bedtime/wake_time
  let hours: number | null = null;
  if (duration_minutes !== null) {
    hours = Math.round((duration_minutes / 60) * 10) / 10;
  } else if (bedtime && wake_time) {
    const [bh, bm] = bedtime.split(":").map(Number);
    const [wh, wm] = wake_time.split(":").map(Number);
    let mins = (wh * 60 + wm) - (bh * 60 + bm);
    if (mins < 0) mins += 1440;
    hours = Math.round((mins / 60) * 10) / 10;
  }

  const bed = bedtime ?? "00:00";
  const wake = wake_time ?? "00:00";
  const h = hours ?? 0;

  try {
    await db.run(
      sql`INSERT INTO sleep_entries (
            user_id, date, bedtime, wake, hours, quality, source,
            stage_deep_minutes, stage_core_minutes, stage_rem_minutes, stage_awake_minutes,
            heart_rate_avg, heart_rate_min, heart_rate_max,
            respiratory_rate_avg, blood_oxygen_avg, sleep_score, raw_payload
          ) VALUES (
            ${userId}, ${normalizedDate}, ${bed}, ${wake}, ${h}, ${5}, ${"apple_health"},
            ${stage_deep_minutes}, ${stage_core_minutes},
            ${stage_rem_minutes}, ${stage_awake_minutes},
            ${heart_rate_avg}, ${heart_rate_min},
            ${heart_rate_max},
            ${respiratory_rate_avg}, ${blood_oxygen_avg},
            ${sleep_score}, ${raw}
          )
          ON CONFLICT (user_id, date) DO UPDATE SET
            bedtime = ${bed},
            wake = ${wake},
            hours = ${h},
            source = 'apple_health',
            stage_deep_minutes = ${stage_deep_minutes},
            stage_core_minutes = ${stage_core_minutes},
            stage_rem_minutes = ${stage_rem_minutes},
            stage_awake_minutes = ${stage_awake_minutes},
            heart_rate_avg = ${heart_rate_avg},
            heart_rate_min = ${heart_rate_min},
            heart_rate_max = ${heart_rate_max},
            respiratory_rate_avg = ${respiratory_rate_avg},
            blood_oxygen_avg = ${blood_oxygen_avg},
            sleep_score = ${sleep_score},
            raw_payload = ${raw}`
    );
  } catch (err) {
    return NextResponse.json({ error: "DB write failed", detail: String(err), payload: body }, { status: 500 });
  }

  return NextResponse.json({ success: true, date: normalizedDate, hours: h });
}
