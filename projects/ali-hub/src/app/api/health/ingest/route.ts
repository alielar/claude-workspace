/**
 * POST /api/health/ingest · Health Auto Export's door (spec §7c item 5, 2026-09-12).
 *
 * HAE Premium's REST API automation posts { data: { metrics, workouts } } on a
 * timer; iOS only lets it run while the phone is unlocked, so posts arrive at
 * odd times and repeat the last days. Everything is parsed defensively and
 * upserted (night by wake day, workout by HealthKit id, metric by day+name).
 *
 * Auth: header `x-app-key: APP_KEY` (HAE "Add Headers"), or `?key=` as a fallback.
 * Public in the proxy; checks the key itself.
 *
 * GET /api/health/ingest · signed-in status for Settings → Apple Watch: last
 * received stamps plus the URL + key to paste into HAE.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserId } from "@/lib/user";
import { parseHaePayload } from "@/lib/health/types";
import { healthStatus, logRaw, rawPosts, storeParsed } from "@/lib/health/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function keyOk(req: Request): boolean {
  const key = process.env.APP_KEY;
  if (!key) return false;
  const h = req.headers.get("x-app-key") ?? req.headers.get("x-api-key");
  if (h === key) return true;
  const q = new URL(req.url).searchParams.get("key");
  return q === key;
}

export async function POST(req: Request) {
  if (!keyOk(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "no user" }, { status: 500 });

  const text = await req.text();
  let body: unknown;
  try { body = JSON.parse(text); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }

  const parsed = parseHaePayload(body);
  const planned = `sleep ${parsed.sleep.length} · workouts ${parsed.workouts.length} · metrics ${parsed.metrics.length}${parsed.skipped.length ? ` · skipped ${parsed.skipped.length}` : ""}`;
  // Log first, store second: a post that times out while storing is still visible in ?raw=1.
  await logRaw(req.headers.get("automation-name"), text, planned);
  const result = await storeParsed(userId, parsed);
  return NextResponse.json({ ok: true, ...result, skipped: parsed.skipped.slice(0, 10) });
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (new URL(req.url).searchParams.get("raw")) return NextResponse.json({ posts: await rawPosts() }, { headers: { "Cache-Control": "no-store" } });
  const status = await healthStatus(session.user.id);
  return NextResponse.json({
    ...status,
    setup: { url: "https://ali-hub.vercel.app/api/health/ingest", header: "x-app-key", key: process.env.APP_KEY ?? "" },
  }, { headers: { "Cache-Control": "no-store" } });
}
