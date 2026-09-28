/** GET /api/health/workout/<hkId> · one workout with its route, heart-rate trace and splits. */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { workoutDetail } from "@/lib/health/summary";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const w = await workoutDetail(session.user.id, decodeURIComponent(id));
  if (!w) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(w, { headers: { "Cache-Control": "no-store" } });
}
