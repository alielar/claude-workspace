/**
 * POST /api/wati?key=…  ·  Wati webhook receiver.
 *
 * Wati pushes an event here for every incoming WhatsApp message and delivery
 * status (all channels, including the telemarketing number, which the Wati
 * read API cannot see). Each event is stored as one row in wati_events.
 * GET with the same key returns the newest events WITH their content inline —
 * one request replaces the old blob-per-event downloads that exhausted the
 * Vercel Blob free tier (the store got blocked and events were being lost).
 *
 * GET params: limit (default 200, max 5000), since (ISO timestamp — only
 * events received after it).
 *
 * The key is a shared secret carried in the URL, because Wati webhooks cannot
 * sign requests or send custom headers.
 */

import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";

const KEY = "gQSRs71A4SB49IvbYfrRWB1r";

function authorized(req: Request): boolean {
  return new URL(req.url).searchParams.get("key") === KEY;
}

let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  await db.run(sql`CREATE TABLE IF NOT EXISTS wati_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    received_at TEXT NOT NULL,
    body TEXT NOT NULL
  )`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS ix_wati_events_received ON wati_events(received_at)`);
  tableReady = true;
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: string;
  try {
    body = await req.text();
  } catch {
    return NextResponse.json({ error: "unreadable body" }, { status: 400 });
  }

  // Answer 200 even if storage fails — a webhook that errors gets marked
  // Defective by Wati and silently disabled.
  try {
    await ensureTable();
    await db.run(sql`INSERT INTO wati_events (received_at, body) VALUES (${new Date().toISOString()}, ${body || "{}"})`);
  } catch {
    return NextResponse.json({ ok: false });
  }
  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 200, 5000);
  const since = url.searchParams.get("since");

  await ensureTable();
  const rows = since
    ? await db.all<{ id: number; received_at: string; body: string }>(
        sql`SELECT id, received_at, body FROM wati_events WHERE received_at > ${since} ORDER BY id DESC LIMIT ${limit}`)
    : await db.all<{ id: number; received_at: string; body: string }>(
        sql`SELECT id, received_at, body FROM wati_events ORDER BY id DESC LIMIT ${limit}`);

  const events = rows.map((r) => {
    let parsed: unknown;
    try { parsed = JSON.parse(r.body); } catch { parsed = { raw: r.body }; }
    return { id: r.id, at: r.received_at, event: parsed };
  });
  return NextResponse.json({ count: events.length, events });
}
