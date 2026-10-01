/**
 * GET /api/mind/today · today's session plan, progress and topics · `?make=1` writes today's brief
 * when none is waiting · `?swap=1` drops the waiting (unread, ungraded) brief and writes another.
 * POST { retire: topicId } · no more callbacks for that topic, answers the refreshed day.
 */

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { dropPendingTopic, mindToday, retireTopic } from "@/lib/mind/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = req.nextUrl.searchParams;
  const swap = q.get("swap") === "1";
  if (swap) await dropPendingTopic(session.user.id);
  const make = swap || q.get("make") === "1";
  return NextResponse.json(await mindToday(session.user.id, make), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { retire?: unknown } | null;
  const id = Number(body?.retire);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "retire: topic id required" }, { status: 400 });
  await retireTopic(session.user.id, id);
  return NextResponse.json(await mindToday(session.user.id, false), { headers: { "Cache-Control": "no-store" } });
}
