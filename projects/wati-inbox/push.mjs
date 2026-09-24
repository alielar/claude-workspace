// Web push to every device that turned notifications on. Dead subscriptions are dropped.

import webpush from 'web-push';
import { subscriptions, removeSubscription } from './db.mjs';

const ready = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
if (ready) webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:ali@example.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

export async function pushAll(payload) {
  if (!ready) return { sent: 0 };
  let sent = 0;
  await Promise.all(subscriptions().map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600, urgency: 'high' });
      sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) removeSubscription(s.endpoint);
      else console.error('push failed', e.statusCode || e.message);
    }
  }));
  return { sent };
}
