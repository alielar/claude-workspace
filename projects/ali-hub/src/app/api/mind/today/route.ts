/** GET /api/mind/today · today's session plan, progress and topics · `?make=1` writes today's brief when none is waiting. */

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { mindToday } from "@/lib/mind/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const make = req.nextUrl.searchParams.get("make") === "1";
  return NextResponse.json(await mindToday(session.user.id, make), { headers: { "Cache-Control": "no-store" } });
}
