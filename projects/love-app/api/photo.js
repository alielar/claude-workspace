import { put } from '@vercel/blob';
import { who, partner, topicOf, nameOf, keyFrom, json, MAX, folderFor } from '../lib/people.js';

const LIMIT = 4_000_000;

function kind(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) return ['image/jpeg', 'jpg'];
  if (buf[0] === 0x89 && buf[1] === 0x50) return ['image/png', 'png'];
  if (buf.slice(4, 12).toString() === 'ftypheic' || buf.slice(4, 12).toString() === 'ftypmif1') return ['image/heic', 'heic'];
  return null;
}

export async function POST(request) {
  const me = who(keyFrom(request));
  if (!me) return json({ error: 'Unknown link' }, 401);

  const buf = Buffer.from(await request.arrayBuffer());
  if (!buf.length) return json({ error: 'No photo received' }, 400);
  if (buf.length > LIMIT) return json({ error: 'Photo too large' }, 413);
  const type = kind(buf);
  if (!type) return json({ error: 'Not a photo' }, 415);

  const to = partner(me);
  const now = Date.now();
  const blob = await put(`${folderFor(to)}${String(MAX - now).padStart(13, '0')}-${me}.${type[1]}`, buf, {
    access: 'public',
    addRandomSuffix: true,
    contentType: type[0],
  });

  // Instant notification with the photo on the partner's phone. A failure here never fails the upload.
  const sender = nameOf(me);
  try {
    await fetch(`https://ntfy.sh/${topicOf(to)}`, {
      method: 'POST',
      headers: {
        Title: sender ? `${sender} sent a photo` : 'New photo',
        Attach: blob.url,
        Filename: `photo.${type[1]}`,
        Tags: 'heart',
      },
      body: 'Your widget updates in a few minutes',
      signal: AbortSignal.timeout(4000),
    });
  } catch {}

  return json({ ok: true, url: blob.url, at: now });
}
