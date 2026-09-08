/** POST /api/podcast/retry · the play card's "try the voice again" button (bypasses spacing). */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ensureTodaysPodcast } from "@/lib/podcast/generate";

export const maxDuration = 300;

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ep = await ensureTodaysPodcast(session.user.id, true);
  return NextResponse.json({ episode: ep });
}
