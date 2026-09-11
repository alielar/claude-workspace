/**
 * GET /api/youtube/search?q=… → { hits } · live channel search for Settings → YouTube channels.
 * Signed-in only. Needs a connection; the phone disables the box offline.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { searchChannels } from "@/lib/news/youtubeSearch";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = req.nextUrl.searchParams.get("q") ?? "";
  try {
    const hits = await searchChannels(q);
    return NextResponse.json({ hits }, { headers: { "Cache-Control": "private, max-age=600" } });
  } catch {
    return NextResponse.json({ error: "YouTube did not answer" }, { status: 502 });
  }
}
