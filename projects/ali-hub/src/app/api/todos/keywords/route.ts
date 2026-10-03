/**
 * POST /api/todos/keywords[?all=1] · tag Knowledge entries with hidden search words now (the
 * Sunday cron does it weekly for new entries). Signed in only. Answers how many were tagged and
 * how many still wait (the writer may be down · then `error` says why).
 */

export const maxDuration = 120;

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { tagKnowledge } from "@/lib/todo/keywords";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = await tagKnowledge(session.user.id, { all: req.nextUrl.searchParams.get("all") === "1" });
  return NextResponse.json(r);
}
