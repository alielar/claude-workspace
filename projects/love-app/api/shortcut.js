import { list } from '@vercel/blob';
import { who, keyFrom, json } from '../lib/people.js';

// Hands out the person's own signed "Send to Love" shortcut (it carries their key).
export async function GET(request) {
  const me = who(keyFrom(request));
  if (!me) return json({ error: 'Unknown link' }, 401);
  const { blobs } = await list({ prefix: `shortcuts/${me}-` });
  if (!blobs.length) return json({ error: 'Shortcut not built yet' }, 404);
  const file = await fetch(blobs[0].url);
  return new Response(file.body, {
    headers: {
      'content-type': 'application/octet-stream',
      'content-disposition': 'attachment; filename="Send to Love.shortcut"',
      'cache-control': 'no-store',
    },
  });
}
