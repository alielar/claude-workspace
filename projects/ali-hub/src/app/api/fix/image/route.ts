/**
 * GET /api/fix/image?id=<request id>&i=<index> · one screenshot of one R2-D2 request, as bytes.
 *
 * Screenshots used to ride inside the chat feed as data URLs (up to 600 KB each, eight requests'
 * worth on every poll). That made the feed several megabytes, too big for the phone's local copy,
 * so the chat opened empty every time (2026-10-03). The feed now carries counts only and the
 * page asks for each picture here; the answer is immutable, so the browser keeps it.
 * Same gate as the rest of /api/fix (proxy + auth()).
 */

import { NextResponse, type NextRequest } from "next/server";
import { authPrimary as auth } from "@/lib/auth"; // Ali's section (2026-10-09): a guest gets 401 here
import { db } from "@/db";
import { fixRequests } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number(req.nextUrl.searchParams.get("id"));
  const i = Number(req.nextUrl.searchParams.get("i") ?? 0);
  if (!Number.isFinite(id) || !Number.isFinite(i) || i < 0) return NextResponse.json({ error: "id and i" }, { status: 400 });
  const [row] = await db.select({ images: fixRequests.images }).from(fixRequests).where(and(eq(fixRequests.id, id), eq(fixRequests.userId, session.user.id)));
  let list: string[] = [];
  try { const v = JSON.parse(row?.images ?? "[]"); list = Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { list = []; }
  const url = list[i];
  const m = url?.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) return new NextResponse(null, { status: 404 });
  const bytes = Buffer.from(m[2], "base64");
  return new NextResponse(bytes, { headers: { "Content-Type": m[1], "Content-Length": String(bytes.length), "Cache-Control": "private, max-age=31536000, immutable" } });
}
