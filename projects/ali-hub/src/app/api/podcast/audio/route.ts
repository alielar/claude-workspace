/**
 * GET /api/podcast/audio?date=YYYY-MM-DD · streams the day's episode MP3 from the DB
 * (Vercel Blob store is suspended; ~3 MB/day base64 in Turso is the free store).
 * Range requests supported — iOS Safari probes with `Range: bytes=0-1` before playing.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { podcastEpisodes } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const date = new URL(req.url).searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "bad date" }, { status: 400 });

  const [row] = await db.select({ audioB64: podcastEpisodes.audioB64 }).from(podcastEpisodes)
    .where(and(eq(podcastEpisodes.userId, session.user.id), eq(podcastEpisodes.date, date)));
  if (!row?.audioB64) return NextResponse.json({ error: "no audio" }, { status: 404 });

  const buf = Buffer.from(row.audioB64, "base64");
  const range = req.headers.get("range");
  const common = {
    "content-type": "audio/mpeg",
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=3600",
  };

  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    const start = m?.[1] ? Number(m[1]) : 0;
    const end = m?.[2] ? Math.min(Number(m[2]), buf.length - 1) : buf.length - 1;
    if (start >= buf.length || start > end) {
      return new NextResponse(null, { status: 416, headers: { ...common, "content-range": `bytes */${buf.length}` } });
    }
    const slice = buf.subarray(start, end + 1);
    return new NextResponse(new Uint8Array(slice), {
      status: 206,
      headers: { ...common, "content-length": String(slice.length), "content-range": `bytes ${start}-${end}/${buf.length}` },
    });
  }

  return new NextResponse(new Uint8Array(buf), { status: 200, headers: { ...common, "content-length": String(buf.length) } });
}
