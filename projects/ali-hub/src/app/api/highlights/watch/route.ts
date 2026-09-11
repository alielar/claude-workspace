/**
 * POST /api/highlights/watch { videoId, watched } · idempotent (desired final state),
 * safe through the outbox. Watched state lives on the server so every device agrees.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { setWatched } from "@/lib/news/highlights";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null);
  const videoId = typeof b?.videoId === "string" && /^[\w-]{6,20}$/.test(b.videoId) ? b.videoId : null;
  if (!videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });
  await setWatched(videoId, b.watched !== false);
  return NextResponse.json({ ok: true });
}
