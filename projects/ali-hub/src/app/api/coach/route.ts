/**
 * GET /api/coach · objectives (seeded on first visit), the latest report (light) and the list of weeks.
 * PUT /api/coach · upsert one objective by id (the full desired state · idempotent, replay-safe;
 *                  `deleted: true` removes it). Signed in only.
 */

import { NextResponse, type NextRequest } from "next/server";
import { auth, authPrimary } from "@/lib/auth";
import { listCoachReports, listObjectives, upsertObjective } from "@/lib/coach/server";
import type { Objective } from "@/lib/coach/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.primary) return NextResponse.json({ objectives: [], reports: [], latest: null }, { headers: { "Cache-Control": "no-store" } }); // the coach is Ali's (2026-10-09)
  const [objectives, reports] = await Promise.all([listObjectives(session.user.id), listCoachReports(session.user.id)]);
  return NextResponse.json({ objectives, reports, latest: reports[0] ?? null }, { headers: { "Cache-Control": "no-store" } });
}

const KINDS = new Set(["run5k", "strengthWeeks", "kbRounds", "vo2max"]);
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export async function PUT(req: NextRequest) {
  const session = await authPrimary();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => null)) as Partial<Objective> & { deleted?: boolean } | null;
  if (!b || typeof b.id !== "string" || !b.id || b.id.length > 64 || !KINDS.has(String(b.kind)) || typeof b.title !== "string" || !b.title.trim()) return NextResponse.json({ error: "bad objective" }, { status: 400 });
  const o: Objective & { deleted?: boolean } = {
    id: b.id, kind: b.kind as Objective["kind"], title: b.title.trim(), target: Number.isFinite(Number(b.target)) ? Number(b.target) : 0,
    due: typeof b.due === "string" && YMD.test(b.due) ? b.due : "2026-12-31", startedAt: typeof b.startedAt === "string" && YMD.test(b.startedAt) ? b.startedAt : "2026-10-05",
    startValue: b.startValue === null || b.startValue === undefined ? null : Number(b.startValue), note: typeof b.note === "string" ? b.note.slice(0, 300) : null,
    done: !!b.done, updatedAt: Number(b.updatedAt) || Date.now(), deleted: !!b.deleted,
  };
  await upsertObjective(session.user.id, o);
  return NextResponse.json({ ok: true });
}
