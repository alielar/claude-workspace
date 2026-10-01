/**
 * POST /api/fix/dictate · ALAI's dictation, two ways (same gate as the rest of /api/fix: session
 * cookie or app key, proxy + auth()). POST only, so the service worker never keeps a copy.
 *   · no body       → a 60-second Deepgram token for the live WebSocket (the key never reaches the
 *                     phone). Needs a key allowed to grant tokens (Deepgram role Member or above);
 *                     the current one answers "Insufficient permissions" (2026-10-01) → 403 here.
 *   · ?phrase=1     → body = one spoken phrase as 16 kHz WAV (≤ 1 MB), answered { text } from
 *                     Deepgram's normal transcription · the way the phone gets Deepgram text when
 *                     live tokens are refused.
 */

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

const PHRASE_URL = `https://api.deepgram.com/v1/listen?${new URLSearchParams({ model: "nova-3", language: "en", smart_format: "true", punctuate: "true" })}`;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) return NextResponse.json({ error: "DEEPGRAM_API_KEY missing" }, { status: 503 });

  if (req.nextUrl.searchParams.get("phrase") === "1") {
    const audio = await req.arrayBuffer();
    if (audio.byteLength < 1000) return NextResponse.json({ text: "" });
    if (audio.byteLength > 1_000_000) return NextResponse.json({ error: "phrase too long" }, { status: 413 });
    try {
      const res = await fetch(PHRASE_URL, { method: "POST", headers: { Authorization: `Token ${key}`, "Content-Type": "audio/wav" }, body: audio, cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as { results?: { channels?: { alternatives?: { transcript?: string }[] }[] }; err_msg?: string };
      if (!res.ok) return NextResponse.json({ error: j.err_msg ?? `Deepgram answered ${res.status}` }, { status: 502 });
      return NextResponse.json({ text: j.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "" }, { headers: { "Cache-Control": "no-store" } });
    } catch {
      return NextResponse.json({ error: "Deepgram did not answer" }, { status: 502 });
    }
  }

  try {
    const res = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl_seconds: 60 }),
      cache: "no-store",
    });
    const j = (await res.json().catch(() => ({}))) as { access_token?: string; err_msg?: string };
    if (!res.ok || !j.access_token) return NextResponse.json({ error: j.err_msg ?? `Deepgram answered ${res.status}` }, { status: res.status === 403 || /permission/i.test(j.err_msg ?? "") ? 403 : 502 });
    return NextResponse.json({ token: j.access_token }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Deepgram did not answer" }, { status: 502 });
  }
}
