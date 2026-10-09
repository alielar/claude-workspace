/**
 * WhatsApp reminders (CallMeBot, 2026-10-10) · per account.
 *   GET    → { on, phone, lastSentAt, lastError, activationLink, number, activation } (the key never comes back)
 *   PUT    { phone, apikey } → saves · POST → one test message · DELETE → off
 */

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getWaConfig, normalizePhone, PHONE, saveWaConfig, sendWhatsApp, waStatus } from "@/lib/whatsapp/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await auth();
  if (!s?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await waStatus(s.user.id), { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: NextRequest) {
  const s = await auth();
  if (!s?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { phone?: string; apikey?: string } | null;
  const phone = typeof b?.phone === "string" ? normalizePhone(b.phone) : "";
  const apikey = typeof b?.apikey === "string" ? b.apikey.trim().slice(0, 40) : "";
  if (!PHONE.test(phone)) return NextResponse.json({ error: "The number needs the country code, like +212 6…" }, { status: 400 });
  if (!/^[\w-]{3,40}$/.test(apikey)) return NextResponse.json({ error: "The API key is the number CallMeBot sent back" }, { status: 400 });
  const old = await getWaConfig(s.user.id);
  await saveWaConfig(s.user.id, { ...(old ?? {}), phone, apikey, lastError: null });
  return NextResponse.json(await waStatus(s.user.id));
}

export async function POST() {
  const s = await auth();
  if (!s?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = await sendWhatsApp(s.user.id, "A L I · WhatsApp reminders are on. Your to-dos will arrive here.");
  return NextResponse.json({ ...r, status: await waStatus(s.user.id) });
}

export async function DELETE() {
  const s = await auth();
  if (!s?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await saveWaConfig(s.user.id, null);
  return NextResponse.json(await waStatus(s.user.id));
}
