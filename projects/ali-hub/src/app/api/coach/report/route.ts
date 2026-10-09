/**
 * GET /api/coach/report[?week=2026-W41][&make=1][&force=1] · one weekly training report. Without
 * `week`: the current week (the Sunday report covers Monday to Sunday of the week it is written in,
 * so until Sunday evening the latest stored one is last week's). `make=1` writes a missing one now
 * (one AI call), `force=1` rewrites it. Signed in only.
 */

export const maxDuration = 120;

import { NextResponse, type NextRequest } from "next/server";
import { authPrimary as auth } from "@/lib/auth"; // Ali's section (2026-10-09): a guest gets 401 here
import { ensureCoachReport, getCoachReport, lastCoachError, listCoachReports } from "@/lib/coach/server";
import { isoWeekOf } from "@/lib/health/client";
import { checklistToday } from "@/lib/checklist/day";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = req.nextUrl.searchParams;
  const today = checklistToday();
  const week = q.get("week") && /^\d{4}-W\d{2}$/.test(q.get("week")!) ? q.get("week")! : null;
  const reports = await listCoachReports(session.user.id);
  const target = week ?? reports[0]?.week ?? isoWeekOf(today);
  let report = await getCoachReport(session.user.id, target);
  let error: string | null = null;
  if ((q.get("make") === "1" && !report) || q.get("force") === "1") {
    // The Monday of the asked week → any day of it works for ensureCoachReport.
    const [y, w] = target.split("-W").map(Number);
    const jan4 = new Date(Date.UTC(y, 0, 4));
    const monday = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86400_000 + (w - 1) * 7 * 86400_000).toISOString().slice(0, 10);
    report = await ensureCoachReport(session.user.id, monday, { force: q.get("force") === "1" });
    if (!report) error = lastCoachError ?? "the writer did not answer";
  }
  return NextResponse.json({ report, week: target, reports: report || reports.length ? await listCoachReports(session.user.id) : reports, error }, { headers: { "Cache-Control": "no-store" } });
}
