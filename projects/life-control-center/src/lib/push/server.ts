import webpush from "web-push";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Web push (server). VAPID keys live in env; subscriptions in `push_subscriptions`.
 * Dead subscriptions (404/410 from the push service) are removed as we go.
 */

export type PushPayload = { title: string; body: string; tag?: string; url?: string };
export type PushTarget = "phone" | "laptop";

function configured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/** Phone (iPhone/iPad/Android) vs laptop (Mac/Windows/Linux browser) from the subscription's user agent. */
export function deviceClass(userAgent: string | null): PushTarget {
  return /iPhone|iPad|iPod|Android|Mobile/i.test(userAgent ?? "") ? "phone" : "laptop";
}

/** Send to the user's devices · `target` limits to phone or laptop, omitted = all. */
export async function sendToUser(userId: string, payload: PushPayload, target?: PushTarget): Promise<{ sent: number; removed: number }> {
  if (!configured()) return { sent: 0, removed: 0 };
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:ali@example.com", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  let subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  if (target) subs = subs.filter((s) => deviceClass(s.userAgent) === target);
  let sent = 0, removed = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600, urgency: "high" });
      sent++;
    } catch (e: unknown) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id)).catch(() => {});
        removed++;
      }
    }
  }));
  return { sent, removed };
}
