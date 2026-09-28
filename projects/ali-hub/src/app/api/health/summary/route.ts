/** GET /api/health/summary · nights, daily metrics and workouts for the Health tab and Train → Body. Signed in (cookie or x-app-key). */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { healthSummary } from "@/lib/health/summary";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await healthSummary(session.user.id), { headers: { "Cache-Control": "no-store" } });
}
