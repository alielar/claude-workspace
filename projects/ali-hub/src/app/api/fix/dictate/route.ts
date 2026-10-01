/**
 * POST /api/fix/dictate · a 60-second Deepgram token for ALAI's live dictation, so the phone can
 * open the speech WebSocket without ever holding the key. POST (not GET) so the service worker
 * never keeps a copy. Same gate as the rest of /api/fix (session cookie or app key, proxy + auth()).
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) return NextResponse.json({ error: "DEEPGRAM_API_KEY missing" }, { status: 503 });
  try {
    const res = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl_seconds: 60 }),
      cache: "no-store",
    });
    const j = (await res.json().catch(() => ({}))) as { access_token?: string; err_msg?: string };
    if (!res.ok || !j.access_token) return NextResponse.json({ error: j.err_msg ?? `Deepgram answered ${res.status}` }, { status: 502 });
    return NextResponse.json({ token: j.access_token }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Deepgram did not answer" }, { status: 502 });
  }
}
