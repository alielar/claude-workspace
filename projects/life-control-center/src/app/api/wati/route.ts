/**
 * POST /api/wati?key=…  ·  Wati webhook receiver.
 *
 * Wati pushes an event here for every incoming WhatsApp message (all channels,
 * including the telemarketing number, which the Wati read API cannot see).
 * Each event is stored as one JSON blob under wati/inbox/ — nothing else in
 * this app is touched. GET with the same key lists the newest events.
 *
 * The key is a shared secret carried in the URL, because Wati webhooks cannot
 * sign requests or send custom headers.
 */

import { NextResponse } from "next/server";
import { put, list } from "@vercel/blob";

const KEY = "gQSRs71A4SB49IvbYfrRWB1r";

function authorized(req: Request): boolean {
  return new URL(req.url).searchParams.get("key") === KEY;
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: string;
  try {
    body = await req.text();
  } catch {
    return NextResponse.json({ error: "unreadable body" }, { status: 400 });
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await put(`wati/inbox/${stamp}.json`, body || "{}", {
    access: "public",
    addRandomSuffix: true,
    contentType: "application/json",
  });

  // Answer fast and always 200 — a webhook that errors gets marked Defective.
  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 5000);
  // Page through the store; blob listing is paginated at 1000 per call.
  const blobs: { uploadedAt: string | Date; url: string; size: number }[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: "wati/inbox/", limit: 1000, cursor });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor && blobs.length < 20000);
  blobs.sort((a, b) => +new Date(b.uploadedAt) - +new Date(a.uploadedAt));
  return NextResponse.json({
    count: blobs.length,
    events: blobs.slice(0, limit).map((b) => ({ at: b.uploadedAt, url: b.url, size: b.size })),
  });
}
