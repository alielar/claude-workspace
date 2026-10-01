// Web push to every device that turned notifications on. Dead subscriptions are dropped.

import webpush from 'web-push';
import { subscriptions, removeSubscription } from './db.mjs';

const ready = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
if (ready) webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:ali@example.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

// No em dashes in notifications (Ali, 2026-10-01): a dash becomes a full stop or a comma.
const clean = (x) => typeof x === 'string' ? x.replace(/\s*—\s*/g, '. ').replace(/\s+–\s+/g, ', ').replace(/\.\s*\./g, '.').trim() : x;
export async function pushAll(payload) {
  if (!ready) return { sent: 0 };
  payload = { ...payload, title: clean(payload.title), body: clean(payload.body) };
  let sent = 0;
  // Each device gets up to 3 tries (2 s, then 6 s apart): the blank "push failed" lines of 2026-10-01 were network drops
  // on the way to Apple/Google (empty error message), and a single try lost that notification for good.
  await Promise.all(subscriptions().map(async (s) => {
    const host = (() => { try { return new URL(s.endpoint).host; } catch { return '?'; } })();
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600, urgency: 'high', timeout: 10000 });
        sent++;
        if (attempt > 1) console.log(`push ok on try ${attempt} (${host})`);
        return;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) { removeSubscription(s.endpoint); console.log(`push: device gone, removed (${host})`); return; }
        const why = [e.statusCode, e.code, e.message, e.errors?.map((x) => x.code || x.message).join('/'), String(e.body || '').slice(0, 120)].filter(Boolean).join(' ') || 'no detail';
        const retry = attempt < 3 && !(e.statusCode >= 400 && e.statusCode < 500 && e.statusCode !== 429);
        console.error(`push failed (${host}, try ${attempt}): ${why}${retry ? ', retrying' : ''}`);
        if (!retry) return;
        await new Promise((r) => setTimeout(r, attempt === 1 ? 2000 : 6000));
      }
    }
  }));
  return { sent };
}
