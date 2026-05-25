import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { getUserId } from "@/lib/user";

/**
 * POST /api/sleep/ingest — receives sleep data from Apple Shortcut.
 * No authentication — security by obscurity (personal use only).
 */
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "No user found" }, { status: 500 });
  }

  const body = await req.json();
  const raw = JSON.stringify(body);

  const {
    date,
    bedtime,
    wake_time,
    duration_minutes,
    stage_deep_minutes,
    stage_core_minutes,
    stage_rem_minutes,
    stage_awake_minutes,
    heart_rate_avg,
    heart_rate_min,
    heart_rate_max,
    respiratory_rate_avg,
    blood_oxygen_avg,
  } = body as Record<string, unknown>;

  // date is required
  if (!date || typeof date !== "string") {
    return NextResponse.json({ error: "date is required" }, { status: 400 });
  }

  // Compute hours from duration_minutes or bedtime/wake_time
  let hours: number | null = null;
  if (typeof duration_minutes === "number") {
    hours = Math.round((duration_minutes / 60) * 10) / 10;
  } else if (typeof bedtime === "string" && typeof wake_time === "string") {
    const [bh, bm] = bedtime.split(":").map(Number);
    const [wh, wm] = wake_time.split(":").map(Number);
    let mins = (wh * 60 + wm) - (bh * 60 + bm);
    if (mins < 0) mins += 1440;
    hours = Math.round((mins / 60) * 10) / 10;
  }

  const bed = typeof bedtime === "string" ? bedtime : "00:00";
  const wake = typeof wake_time === "string" ? wake_time : "00:00";
  const h = hours ?? 0;

  await db.run(
    sql`INSERT INTO sleep_entries (
          user_id, date, bedtime, wake, hours, quality, source,
          stage_deep_minutes, stage_core_minutes, stage_rem_minutes, stage_awake_minutes,
          heart_rate_avg, heart_rate_min, heart_rate_max,
          respiratory_rate_avg, blood_oxygen_avg, raw_payload
        ) VALUES (
          ${userId}, ${date as string}, ${bed}, ${wake}, ${h}, ${5}, ${"apple_health"},
          ${(stage_deep_minutes as number) ?? null}, ${(stage_core_minutes as number) ?? null},
          ${(stage_rem_minutes as number) ?? null}, ${(stage_awake_minutes as number) ?? null},
          ${(heart_rate_avg as number) ?? null}, ${(heart_rate_min as number) ?? null},
          ${(heart_rate_max as number) ?? null},
          ${(respiratory_rate_avg as number) ?? null}, ${(blood_oxygen_avg as number) ?? null},
          ${raw}
        )
        ON CONFLICT (user_id, date) DO UPDATE SET
          bedtime = ${bed},
          wake = ${wake},
          hours = ${h},
          source = 'apple_health',
          stage_deep_minutes = ${(stage_deep_minutes as number) ?? null},
          stage_core_minutes = ${(stage_core_minutes as number) ?? null},
          stage_rem_minutes = ${(stage_rem_minutes as number) ?? null},
          stage_awake_minutes = ${(stage_awake_minutes as number) ?? null},
          heart_rate_avg = ${(heart_rate_avg as number) ?? null},
          heart_rate_min = ${(heart_rate_min as number) ?? null},
          heart_rate_max = ${(heart_rate_max as number) ?? null},
          respiratory_rate_avg = ${(respiratory_rate_avg as number) ?? null},
          blood_oxygen_avg = ${(blood_oxygen_avg as number) ?? null},
          raw_payload = ${raw}`
  );

  return NextResponse.json({ success: true, date });
}
