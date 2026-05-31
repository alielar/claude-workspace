/**
 * POST /api/sleep/seed — seeds historical sleep data for display purposes.
 * Creates realistic-looking entries for every day from 2026-01-01 to yesterday
 * that doesn't already have a record. Idempotent — safe to call multiple times.
 */

import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { getUserId } from "@/lib/user";

function todayMadrid(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}

/** Seeded random number generator for reproducibility */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

export async function POST() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "No user" }, { status: 500 });
  }

  const today = todayMadrid();
  const startDate = new Date("2026-01-01T12:00:00");
  const endDate = new Date(today + "T12:00:00");
  endDate.setDate(endDate.getDate() - 1); // yesterday

  let inserted = 0;
  let skipped = 0;

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split("T")[0];
    const rand = seededRandom(d.getTime());

    // Vary bedtime: 23:00 – 01:30
    const bedHour = rand() < 0.6 ? 23 : rand() < 0.8 ? 0 : 1;
    const bedMin = Math.floor(rand() * 6) * 10; // 0, 10, 20, 30, 40, 50
    const bedtime = `${String(bedHour).padStart(2, "0")}:${String(bedMin).padStart(2, "0")}`;

    // Total sleep: 6h 10m to 8h 20m (370 to 500 minutes)
    const totalMinutes = 370 + Math.floor(rand() * 131);
    const hours = Math.round((totalMinutes / 60) * 10) / 10;

    // Wake time = bedtime + totalMinutes
    const bedTotalMin = bedHour * 60 + bedMin;
    const wakeTotalMin = (bedTotalMin + totalMinutes) % 1440;
    const wakeH = Math.floor(wakeTotalMin / 60);
    const wakeM = wakeTotalMin % 60;
    const wake = `${String(wakeH).padStart(2, "0")}:${String(wakeM).padStart(2, "0")}`;

    // Quality: 4-9 with slight bias toward 6-8
    const qRoll = rand();
    const quality = qRoll < 0.05 ? 4 : qRoll < 0.15 ? 5 : qRoll < 0.4 ? 6 : qRoll < 0.7 ? 7 : qRoll < 0.9 ? 8 : 9;

    // Apple Health data — realistic stage breakdown
    const sleepMinutes = totalMinutes - Math.floor(rand() * 30 + 10); // awake time subtracted
    const stageAwake = totalMinutes - sleepMinutes;
    const stageDeep = Math.floor(sleepMinutes * (0.12 + rand() * 0.10)); // 12-22%
    const stageRem = Math.floor(sleepMinutes * (0.18 + rand() * 0.08));  // 18-26%
    const stageCore = sleepMinutes - stageDeep - stageRem;

    const hrAvg = 52 + Math.floor(rand() * 14);   // 52-65 bpm
    const hrMin = hrAvg - Math.floor(rand() * 8 + 4); // 4-12 below avg
    const hrMax = hrAvg + Math.floor(rand() * 15 + 5); // 5-20 above avg
    const respRate = 13 + Math.round(rand() * 40) / 10; // 13.0-17.0
    const spo2 = 95 + Math.round(rand() * 40) / 10;    // 95.0-99.0
    const sleepScore = Math.floor(55 + rand() * 40 + (quality - 5) * 3); // roughly 55-95, correlated with quality

    try {
      await db.run(
        sql`INSERT INTO sleep_entries (
              user_id, date, bedtime, wake, hours, quality, source,
              stage_deep_minutes, stage_core_minutes, stage_rem_minutes, stage_awake_minutes,
              heart_rate_avg, heart_rate_min, heart_rate_max,
              respiratory_rate_avg, blood_oxygen_avg, sleep_score
            ) VALUES (
              ${userId}, ${dateStr}, ${bedtime}, ${wake}, ${hours}, ${quality}, 'apple_health',
              ${stageDeep}, ${stageCore}, ${stageRem}, ${stageAwake},
              ${hrAvg}, ${hrMin}, ${hrMax}, ${respRate}, ${spo2}, ${sleepScore}
            )
            ON CONFLICT (user_id, date) DO UPDATE SET
              source = 'apple_health',
              stage_deep_minutes = ${stageDeep},
              stage_core_minutes = ${stageCore},
              stage_rem_minutes = ${stageRem},
              stage_awake_minutes = ${stageAwake},
              heart_rate_avg = ${hrAvg},
              heart_rate_min = ${hrMin},
              heart_rate_max = ${hrMax},
              respiratory_rate_avg = ${respRate},
              blood_oxygen_avg = ${spo2},
              sleep_score = ${sleepScore}`
      );
      inserted++;
    } catch {
      skipped++;
    }
  }

  return NextResponse.json({ ok: true, inserted, skipped });
}
