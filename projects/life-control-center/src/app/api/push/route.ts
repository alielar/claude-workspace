import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { pushSubscriptions, userSettings } from "@/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * GET    /api/push → { publicKey, count, endpoints, lastTickAt }
 *          VAPID public key, this user's subscribed devices (endpoints let a phone
 *          verify the server still knows IT), and when the nag service last ran
 *          (stale = the external pinger is down, not the subscription).
 * POST   /api/push { subscription }        · save this device (idempotent on endpoint)
 * DELETE /api/push { endpoint }            · remove this device
 */

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await db.select({ endpoint: pushSubscriptions.endpoint }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, session.user.id)).catch(() => []);
  const [settings] = await db.select({ lastTickAt: userSettings.lastReminderTickAt }).from(userSettings).where(eq(userSettings.userId, session.user.id)).catch(() => []);
  return NextResponse.json({
    publicKey: process.env.VAPID_PUBLIC_KEY ?? null,
    count: rows.length,
    endpoints: rows.map((r) => r.endpoint),
    lastTickAt: settings?.lastTickAt?.getTime() ?? null,
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json();
  const s = b?.subscription ?? b;
  const endpoint = s?.endpoint, p256dh = s?.keys?.p256dh, authKey = s?.keys?.auth;
  if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof authKey !== "string") return NextResponse.json({ error: "bad subscription" }, { status: 400 });
  const values = { userId: session.user.id, endpoint, p256dh, auth: authKey, userAgent: (req.headers.get("user-agent") ?? "").slice(0, 200), lastUsedAt: new Date() };
  try { await db.insert(pushSubscriptions).values(values); }
  catch { await db.update(pushSubscriptions).set(values).where(eq(pushSubscriptions.endpoint, endpoint)); }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (typeof b?.endpoint === "string") {
    await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, session.user.id), eq(pushSubscriptions.endpoint, b.endpoint)));
  }
  return NextResponse.json({ ok: true });
}
