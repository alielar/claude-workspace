import webpush from "web-push";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Web push (server). VAPID keys live in env; subscriptions in `push_subscriptions`.
 * Dead subscriptions (404/410 from the push service) are removed as we go.
 */

export type PushPayload = { title: string; body: string; tag?: string; url?: string };

function configured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export async function sendToUser(userId: string, payload: PushPayload): Promise<{ sent: number; removed: number }> {
  if (!configured()) return { sent: 0, removed: 0 };
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:ali@example.com", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
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
