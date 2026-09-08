/** GET /api/podcast/today → today's episode (status, script, audio URL) for the play card. */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { todaysEpisode } from "@/lib/podcast/generate";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ep = await todaysEpisode(session.user.id);
  return NextResponse.json({ episode: ep });
}
